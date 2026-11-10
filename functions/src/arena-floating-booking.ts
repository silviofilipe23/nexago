/**
 * Reserva flutuante — a que não tem quadra definida para o atleta (modo "a arena define a
 * quadra", `docs/product/reservas-por-capacidade.md`). Ela segura uma quadra PROVISÓRIA com as
 * `arenaSlotLocks` de sempre, marcadas com `floating: true`, e pode ser empurrada para outra
 * quadra livre quando alguém precisa daquela quadra específica.
 *
 * Duas peças:
 *
 * - `claimCourtLocks`: o que todo fluxo que ocupa quadra específica (reserva do atleta, balcão,
 *   horário fixo, aula, clubinho, reposição, remarcação por chuva, desfazer cancelamento, troca
 *   de quadra) chama DENTRO da sua transação no lugar do "trava existe → conflito". Trava comum
 *   continua sendo conflito. Trava flutuante vira um plano de deslocamento; sem quadra livre para
 *   ela, é conflito como antes. Só lê — as escritas do deslocamento ficam em `commit()`, que o
 *   fluxo chama na fase de escrita (o Firestore exige todas as leituras antes das escritas).
 *
 * - `readBookingMove` + `writeBookingCourtMove`: mover uma reserva de quadra (travas, `arenaSlots`,
 *   `courtId`/`courtName` e histórico). Usado pelo deslocamento e pela troca de quadra do gestor.
 *
 * Sem reserva flutuante gravada (antes do modo capacidade), `claimCourtLocks` se comporta
 * exatamente como o "trava existe → conflito" que substitui.
 */
import {FieldValue, Timestamp} from "firebase-admin/firestore";
import type {DocumentData, DocumentReference, DocumentSnapshot, Firestore, QuerySnapshot} from "firebase-admin/firestore";
import {computeSlotLockIds} from "./arena-booking-waitlist";
import {courtSportCodes} from "./arena-booking-sport";
import {hasBlockedSlotOverlap} from "./arena-recurring-booking";
import {parseDateKeyFromBooking} from "./slot-vacancy-alerts";

const ARENA_BOOKINGS = "arenaBookings";
const ARENA_SLOTS = "arenaSlots";
const ARENA_SLOT_LOCKS = "arenaSlotLocks";

/** Histórico guardado na reserva — o suficiente pra auditoria, sem crescer sem fim. */
export const COURT_HISTORY_MAX = 20;

/** Autor do deslocamento automático no histórico da reserva. */
export const SYSTEM_ACTOR = "system";

/** O que `claimCourtLocks` e `readBookingMove` usam da transação (o fake dos testes cumpre). */
export interface TxReader {
  get(ref: DocumentReference): Promise<DocumentSnapshot>;
  get(query: FirebaseFirestore.Query): Promise<QuerySnapshot>;
}

export interface TxWriter {
  set(ref: DocumentReference, data: DocumentData, opts?: {merge: boolean}): unknown;
  delete(ref: DocumentReference): unknown;
}

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

/** Trava de reserva flutuante (pode ser empurrada para outra quadra). */
export function isFloatingLock(data: DocumentData | undefined): boolean {
  return data?.["floating"] === true;
}

/** Quadra de destino pode receber a reserva? `null` = pode. Puro. */
export function targetCourtBlockReason(
  courtData: DocumentData | undefined,
  bookingSport: string | null,
): string | null {
  if (!courtData) return "Quadra não encontrada.";
  if (courtData["status"] === "maintenance" || courtData["maintenance"] === true) {
    return "Essa quadra está em manutenção.";
  }
  if (bookingSport) {
    const sports = courtSportCodes(courtData);
    if (sports.length > 0 && !sports.includes(bookingSport)) {
      return "Essa quadra não é do esporte desta reserva.";
    }
  }
  return null;
}

/**
 * Quadras que podem receber uma reserva flutuante, na ordem de preferência: as da distribuição
 * (`arenas.bookingAllocation.courtIds`, na ordem gravada) ou, sem configuração, todas as da
 * arena por nome. Tira manutenção, outro esporte e `excludeCourtIds`. Puro.
 */
export function floatingCandidateCourts(
  arenaData: DocumentData | undefined,
  courts: ReadonlyArray<{id: string; data: DocumentData}>,
  sport: string | null,
  excludeCourtIds: ReadonlyArray<string>,
): Array<{id: string; name: string}> {
  const allocation = arenaData?.["bookingAllocation"] as DocumentData | undefined;
  const configured = Array.isArray(allocation?.["courtIds"]) ?
    (allocation!["courtIds"] as unknown[]).map(str).filter(Boolean) :
    null;
  const byId = new Map(courts.map((c) => [c.id, c.data]));
  const ordered = configured ?
    configured.filter((id) => byId.has(id)) :
    [...courts].sort((a, b) => str(a.data["name"]).localeCompare(str(b.data["name"]), "pt-BR", {numeric: true}))
      .map((c) => c.id);
  return ordered
    .filter((id) => !excludeCourtIds.includes(id))
    .filter((id) => targetCourtBlockReason(byId.get(id), sport) == null)
    .map((id) => ({id, name: str(byId.get(id)?.["name"]) || "Quadra"}));
}

// ---------------------------------------------------------------------------
// Mover uma reserva de quadra
// ---------------------------------------------------------------------------

export interface BookingMove {
  bookingId: string;
  bookingRef: DocumentReference;
  booking: DocumentData;
  arenaId: string;
  dateKey: string;
  fromCourtId: string;
  fromCourtName: string;
  /** Travas da quadra atual (mesma ordem de horas de `toLockIds`). */
  fromLocks: DocumentSnapshot[];
  toCourtId: string;
  toCourtName: string;
  toLockIds: string[];
  slotDocs: DocumentSnapshot[];
}

/** Leituras de uma mudança de quadra (fase de leitura da transação). `null` se a reserva sumiu. */
export async function readBookingMove(
  tx: TxReader,
  db: Firestore,
  bookingId: string,
  to: {courtId: string; courtName: string},
  knownBooking?: DocumentSnapshot,
): Promise<BookingMove | null> {
  const bookingRef = db.collection(ARENA_BOOKINGS).doc(bookingId);
  const snap = knownBooking ?? await tx.get(bookingRef);
  if (!snap.exists) return null;
  const booking = snap.data() as DocumentData;
  const arenaId = str(booking["arenaId"]);
  const dateKey = parseDateKeyFromBooking(booking["date"]) ?? "";
  const startTime = str(booking["startTime"]);
  const endTime = str(booking["endTime"]);
  const fromCourtId = str(booking["courtId"]);
  const toLockIds = computeSlotLockIds({arenaId, courtId: to.courtId, dateKey, startTime, endTime});
  if (!arenaId || !dateKey || toLockIds.length === 0) return null;

  const fromLockIds = fromCourtId ?
    computeSlotLockIds({arenaId, courtId: fromCourtId, dateKey, startTime, endTime}) :
    [];
  const fromLocks: DocumentSnapshot[] = [];
  for (const id of fromLockIds) fromLocks.push(await tx.get(db.collection(ARENA_SLOT_LOCKS).doc(id)));
  const slots = await tx.get(db.collection(ARENA_SLOTS).where("bookingId", "==", bookingId));

  return {
    bookingId,
    bookingRef,
    booking,
    arenaId,
    dateKey,
    fromCourtId,
    fromCourtName: str(booking["courtName"]) || "Quadra",
    fromLocks,
    toCourtId: to.courtId,
    toCourtName: to.courtName,
    toLockIds,
    slotDocs: slots.docs,
  };
}

export interface MoveWriteOptions {
  by: string;
  reason: string | null;
  nowMs: number;
  /** Gestor definindo a quadra: a reserva flutuante passa a `assigned` e a trava deixa de flutuar. */
  assignedBy?: {uid: string; source: "staff" | "qr"};
  /** Travas que outra escrita da mesma transação vai sobrescrever — não apagar. */
  skipDeletePaths?: ReadonlySet<string>;
}

/** Escritas de uma mudança de quadra (fase de escrita da transação). */
export function writeBookingCourtMove(
  tx: TxWriter,
  db: Firestore,
  move: BookingMove,
  opts: MoveWriteOptions,
): void {
  const skip = opts.skipDeletePaths ?? new Set<string>();
  const owns = (snap: DocumentSnapshot | undefined) =>
    snap?.exists === true && snap.data()?.["bookingId"] === move.bookingId;

  for (let i = 0; i < move.toLockIds.length; i++) {
    const source = move.fromLocks[i];
    const sourceData = owns(source) ? {...source!.data() as DocumentData} : null;
    const data: DocumentData = {
      // Copia o que a trava carregava (recurringBookingId etc.); só a quadra muda.
      ...(sourceData ?? {
        arenaId: move.arenaId,
        date: move.dateKey,
        bookingId: move.bookingId,
        bookingAthleteId: str(move.booking["athleteId"]) || null,
      }),
      courtId: move.toCourtId,
      movedAt: FieldValue.serverTimestamp(),
    };
    if (opts.assignedBy) delete data["floating"];
    tx.set(db.collection(ARENA_SLOT_LOCKS).doc(move.toLockIds[i]!), data);
  }
  // Trava de origem só sai se for desta reserva (nunca derruba a de outra).
  for (const source of move.fromLocks) {
    if (owns(source) && !skip.has(source.ref.path)) tx.delete(source.ref);
  }

  for (const doc of move.slotDocs) {
    tx.set(doc.ref, {courtId: move.toCourtId}, {merge: true});
  }

  const history = Array.isArray(move.booking["courtHistory"]) ? move.booking["courtHistory"] as unknown[] : [];
  const entry = {
    fromCourtId: move.fromCourtId,
    fromCourtName: move.fromCourtName,
    toCourtId: move.toCourtId,
    toCourtName: move.toCourtName,
    by: opts.by,
    at: Timestamp.fromMillis(opts.nowMs),
    reason: opts.reason,
  };
  const assignment = opts.assignedBy && move.booking["allocationStatus"] === "unassigned" ? {
    allocationStatus: "assigned",
    allocationSource: opts.assignedBy.source,
    allocatedAt: FieldValue.serverTimestamp(),
    allocatedBy: opts.assignedBy.uid,
  } : {};
  tx.set(move.bookingRef, {
    courtId: move.toCourtId,
    courtName: move.toCourtName,
    courtHistory: [...history, entry].slice(-COURT_HISTORY_MAX),
    courtChangedAt: FieldValue.serverTimestamp(),
    courtChangedBy: opts.by,
    ...assignment,
  }, {merge: true});
}

// ---------------------------------------------------------------------------
// Ocupar quadra específica empurrando a reserva flutuante
// ---------------------------------------------------------------------------

export interface ClaimTarget {
  arenaId: string;
  courtId: string;
  /** Travas que o fluxo quer gravar (todas na quadra `courtId`). */
  lockRefs: ReadonlyArray<DocumentReference>;
}

export interface ClaimOptions {
  /** Trava desta reserva não é conflito (retry, sobra de liberação). */
  ownBookingId?: string | null;
  /** Reservas cujas travas contam como livres ao procurar quadra para a flutuante (troca). */
  freeBookingIds?: ReadonlyArray<string>;
  /** Quadras que a flutuante não pode receber (além da disputada). */
  avoidCourtIds?: ReadonlyArray<string>;
  /** Fluxo que ocupa várias quadras na mesma transação (clubinho): o mesmo Set em todos os
   *  claims, para duas flutuantes não irem para a mesma quadra nem para uma que o fluxo ocupa. */
  takenLockPaths?: Set<string>;
  /** Motivo no histórico da reserva empurrada. */
  reason?: string;
  nowMs?: number;
  /** `false` quando o fluxo NÃO grava as travas disputadas (bloqueio de quadra): o deslocamento
   *  apaga as travas antigas da flutuante também nelas. Padrão `true`. */
  flowWritesTargetLocks?: boolean;
}

export type ClaimResult =
  | {
      ok: true;
      relocations: BookingMove[];
      /** Travas que o deslocamento grava — quem escreve na mesma transação não deve apagá-las. */
      relocatedLockPaths: ReadonlySet<string>;
      /** Grava os deslocamentos. Chamar na fase de escrita, antes ou depois das travas do fluxo. */
      commit: (tx: TxWriter) => void;
    }
  | {ok: false; blockingBookingIds: string[]};

function lockOwner(snap: DocumentSnapshot): string {
  return str(snap.data()?.["bookingId"]);
}

/**
 * Lê as travas que o fluxo quer ocupar. Livre → ok. Trava comum de outra reserva → conflito.
 * Trava flutuante → procura outra quadra livre para a reserva inteira; achou → ok com o
 * deslocamento planejado, não achou → conflito.
 */
export async function claimCourtLocks(
  tx: TxReader,
  db: Firestore,
  target: ClaimTarget,
  opts: ClaimOptions = {},
): Promise<ClaimResult> {
  const own = opts.ownBookingId ?? null;
  const snaps: DocumentSnapshot[] = [];
  for (const ref of target.lockRefs) snaps.push(await tx.get(ref));

  const foreign = snaps.filter((s) => s.exists && lockOwner(s) !== own);
  const blocking = foreign.filter((s) => !isFloatingLock(s.data()));
  if (blocking.length > 0) {
    return {ok: false, blockingBookingIds: [...new Set(blocking.map(lockOwner))]};
  }
  const floatingIds = [...new Set(foreign.map(lockOwner))].filter(Boolean);
  if (floatingIds.length === 0) {
    return {ok: true, relocations: [], relocatedLockPaths: new Set(), commit: () => undefined};
  }

  // Candidatas lidas fora da trava da transação (mudam raramente), como os outros fluxos fazem.
  const arenaRef = db.collection("arenas").doc(target.arenaId);
  const [arenaSnap, courtsSnap] = await Promise.all([arenaRef.get(), arenaRef.collection("courts").get()]);
  const courts = courtsSnap.docs.map((d) => ({id: d.id, data: d.data() as DocumentData}));

  const targetPaths = new Set(target.lockRefs.map((r) => r.path));
  const takenPaths = opts.takenLockPaths ?? new Set<string>();
  for (const path of targetPaths) takenPaths.add(path);
  const free = new Set(opts.freeBookingIds ?? []);
  const relocations: BookingMove[] = [];

  for (const bookingId of floatingIds) {
    const bookingSnap = await tx.get(db.collection(ARENA_BOOKINGS).doc(bookingId));
    if (!bookingSnap.exists) return {ok: false, blockingBookingIds: [bookingId]};
    const booking = bookingSnap.data() as DocumentData;
    const dateKey = parseDateKeyFromBooking(booking["date"]) ?? "";
    const startTime = str(booking["startTime"]);
    const endTime = str(booking["endTime"]);
    const candidates = floatingCandidateCourts(
      arenaSnap.data(),
      courts,
      str(booking["sport"]) || null,
      [target.courtId, str(booking["courtId"]), ...(opts.avoidCourtIds ?? [])],
    );

    // Quadra realmente livre primeiro; a liberada por `freeBookingIds` (troca) só se não houver.
    const fits = async (courtId: string, allowFreed: boolean): Promise<boolean> => {
      const lockIds = computeSlotLockIds({arenaId: target.arenaId, courtId, dateKey, startTime, endTime});
      if (lockIds.length === 0) return false;
      for (const id of lockIds) {
        const ref = db.collection(ARENA_SLOT_LOCKS).doc(id);
        if (takenPaths.has(ref.path)) return false;
        const snap = await tx.get(ref);
        if (!snap.exists || lockOwner(snap) === bookingId) continue;
        if (!(allowFreed && free.has(lockOwner(snap)))) return false;
      }
      return !await hasBlockedSlotOverlap(db, {arenaId: target.arenaId, courtId, startTime, endTime}, dateKey);
    };
    let chosen: {id: string; name: string} | null = null;
    for (const allowFreed of free.size > 0 ? [false, true] : [false]) {
      for (const court of candidates) {
        if (await fits(court.id, allowFreed)) {
          chosen = court;
          break;
        }
      }
      if (chosen) break;
    }
    if (!chosen) return {ok: false, blockingBookingIds: [bookingId]};

    const move = await readBookingMove(tx, db, bookingId, {courtId: chosen.id, courtName: chosen.name}, bookingSnap);
    if (!move) return {ok: false, blockingBookingIds: [bookingId]};
    for (const id of move.toLockIds) takenPaths.add(db.collection(ARENA_SLOT_LOCKS).doc(id).path);
    relocations.push(move);
  }

  const relocatedLockPaths = new Set<string>();
  for (const move of relocations) {
    for (const id of move.toLockIds) relocatedLockPaths.add(db.collection(ARENA_SLOT_LOCKS).doc(id).path);
  }
  const nowMs = opts.nowMs ?? Date.now();
  const reason = opts.reason ?? "Quadra ocupada por outra reserva";
  const keepPaths = opts.flowWritesTargetLocks === false ? new Set<string>() : targetPaths;
  return {
    ok: true,
    relocations,
    relocatedLockPaths,
    commit: (writer) => {
      for (const move of relocations) {
        // As travas antigas na quadra disputada serão sobrescritas pelo fluxo: não apagar.
        writeBookingCourtMove(writer, db, move, {by: SYSTEM_ACTOR, reason, nowMs, skipDeletePaths: keepPaths});
      }
    },
  };
}

// ---------------------------------------------------------------------------
// Bloqueio de quadra do gestor (gravado direto pelo app/portal)
// ---------------------------------------------------------------------------

/** Dia do slot: `dateKey`/`date` string, ou Timestamp no fuso da arena (app grava Timestamp). */
function slotDateKey(data: DocumentData): string {
  const key = str(data["dateKey"]);
  if (key) return key.slice(0, 10);
  const raw = data["date"];
  if (typeof raw === "string") return raw.trim().slice(0, 10);
  if (raw && typeof raw === "object" && "toDate" in raw) {
    return (raw as {toDate: () => Date}).toDate().toLocaleDateString("en-CA", {timeZone: "America/Sao_Paulo"});
  }
  return "";
}

/** Bloqueio que deve empurrar flutuante: `blocked`, com quadra e horário, que não é do Modo chuva
 *  (o Modo chuva trata as reservas da quadra pela regra dele). Puro. */
export function isManagerCourtBlock(data: DocumentData | undefined): boolean {
  if (!data) return false;
  const status = str(data["status"]).toLowerCase();
  if (status !== "blocked" && status !== "bloqueado") return false;
  if (data["blockReason"] === "weather" || str(data["weatherEventId"])) return false;
  return Boolean(str(data["arenaId"]) && str(data["courtId"]) && slotDateKey(data) &&
    str(data["startTime"]).length >= 4 && str(data["endTime"]).length >= 4);
}

/**
 * Bloqueio novo numa quadra: cada reserva flutuante que estava nela no horário vai para outra
 * quadra livre (uma transação por reserva — uma que não cabe não segura as outras). Reserva comum
 * fica onde está (o gestor bloqueou por cima dela; é decisão dele). Devolve quem moveu e quem
 * ficou sem quadra.
 */
export async function relocateFloatingFromBlock(
  db: Firestore,
  slot: DocumentData,
  nowMs: number,
): Promise<{moved: string[]; stuck: string[]}> {
  const arenaId = str(slot["arenaId"]);
  const courtId = str(slot["courtId"]);
  const dateKey = slotDateKey(slot);
  const lockIds = computeSlotLockIds({
    arenaId, courtId, dateKey, startTime: str(slot["startTime"]), endTime: str(slot["endTime"]),
  });
  const refs = lockIds.map((id) => db.collection(ARENA_SLOT_LOCKS).doc(id));
  const snaps = refs.length > 0 ? await db.getAll(...refs) : [];
  const byBooking = new Map<string, DocumentReference[]>();
  for (const snap of snaps) {
    if (!snap.exists || !isFloatingLock(snap.data())) continue;
    const owner = lockOwner(snap);
    if (!owner) continue;
    byBooking.set(owner, [...(byBooking.get(owner) ?? []), snap.ref]);
  }

  return relocateFloatingLocks(db, arenaId, courtId, byBooking, "Quadra bloqueada pela arena", nowMs);
}

/** Tira cada reserva flutuante das suas travas nesta quadra (uma transação por reserva). */
async function relocateFloatingLocks(
  db: Firestore,
  arenaId: string,
  courtId: string,
  byBooking: Map<string, DocumentReference[]>,
  reason: string,
  nowMs: number,
): Promise<{moved: string[]; stuck: string[]}> {
  const moved: string[] = [];
  const stuck: string[] = [];
  for (const [bookingId, lockRefs] of byBooking) {
    const ok = await db.runTransaction(async (tx) => {
      const claim = await claimCourtLocks(tx, db, {arenaId, courtId, lockRefs}, {
        reason,
        flowWritesTargetLocks: false,
        nowMs,
      });
      if (!claim.ok) return false;
      claim.commit(tx);
      return true;
    });
    (ok ? moved : stuck).push(bookingId);
  }
  return {moved, stuck};
}

/** A quadra passou a estar em manutenção nesta escrita (antes não estava). Puro. */
export function courtEnteredMaintenance(before: DocumentData | undefined, after: DocumentData | undefined): boolean {
  const inMaintenance = (d: DocumentData | undefined) =>
    !!d && (str(d["status"]).toLowerCase() === "maintenance" || d["maintenance"] === true);
  return inMaintenance(after) && !inMaintenance(before);
}

/**
 * Quadra em manutenção: cada reserva flutuante dela, de [fromDateKey] em diante, vai para outra
 * quadra livre do esporte (manutenção desconta da capacidade). Sem quadra livre, fica — a recepção
 * resolve. Reserva com quadra definida não muda.
 */
export async function relocateFloatingOffCourt(
  db: Firestore,
  arenaId: string,
  courtId: string,
  fromDateKey: string,
  nowMs: number,
): Promise<{moved: string[]; stuck: string[]}> {
  const snap = await db.collection(ARENA_BOOKINGS)
    .where("arenaId", "==", arenaId)
    .where("courtId", "==", courtId)
    .where("allocationStatus", "==", "unassigned")
    .get();
  const byBooking = new Map<string, DocumentReference[]>();
  for (const doc of snap.docs) {
    const data = doc.data();
    const dateKey = parseDateKeyFromBooking(data["date"]);
    if (!dateKey || dateKey < fromDateKey) continue;
    const ids = computeSlotLockIds({
      arenaId, courtId, dateKey, startTime: str(data["startTime"]), endTime: str(data["endTime"]),
    });
    const refs = ids.map((id) => db.collection(ARENA_SLOT_LOCKS).doc(id));
    const locks = refs.length > 0 ? await db.getAll(...refs) : [];
    const own = locks.filter((l) => l.exists && isFloatingLock(l.data()) && lockOwner(l) === doc.id);
    if (own.length > 0) byBooking.set(doc.id, own.map((l) => l.ref));
  }
  return relocateFloatingLocks(db, arenaId, courtId, byBooking, "Quadra em manutenção", nowMs);
}
