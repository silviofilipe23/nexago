/**
 * "Como o atleta reserva" — modo de alocação de quadra da arena
 * (`docs/product/reservas-por-capacidade.md`, PR 3).
 *
 * - `court` (padrão, campo ausente): o atleta escolhe a quadra, como sempre.
 * - `capacity`: o atleta reserva o horário; a reserva nasce flutuante numa quadra provisória da
 *   distribuição (`floating: true` nas travas) e a recepção define a quadra na chegada.
 *
 * Gravado só por callable em `arenas/{arenaId}.bookingAllocation` (as rules congelam o campo
 * para o cliente). A troca de modo vale para reservas novas; as existentes ficam como estão.
 */
import {onCall, HttpsError} from "firebase-functions/v2/https";
import {getFirestore, FieldValue, type DocumentData, type Firestore} from "firebase-admin/firestore";
import {assertArenaAreaAccess} from "./arena-area-access";
import {bookingSportCode, courtSportCodes} from "./arena-booking-sport";
import {computeSlotLockIds} from "./arena-booking-waitlist";
import {floatingCandidateCourts, type TxReader} from "./arena-floating-booking";
import {hasBlockedSlotOverlap} from "./arena-recurring-booking";
import {CLIENT_FACING_REGIONS} from "./function-regions";

export type BookingAllocationMode = "court" | "capacity";

export interface BookingAllocation {
  mode: BookingAllocationMode;
  /** Quadras da distribuição, na ordem de preferência. */
  courtIds: string[];
  /** Preço por hora do horário, por esporte (código do catálogo). */
  priceBySport: Record<string, number>;
  /** Mostrar a quadra ao atleta quando a recepção definir antes da chegada. */
  revealBeforeArrival: boolean;
  /** Modo misto: o atleta pode escolher a quadra, se quiser. */
  allowCourtChoice: boolean;
}

export const DEFAULT_BOOKING_ALLOCATION: BookingAllocation = {
  mode: "court",
  courtIds: [],
  priceBySport: {},
  revealBeforeArrival: false,
  allowCourtChoice: false,
};

/** Mensagem para app/portal que ainda não sabe reservar sem quadra. */
export const OUTDATED_CLIENT_MESSAGE = "Atualize o app para reservar nesta arena.";

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

/** Lê a configuração da arena; ausente ou inválida = modo `court`. Puro. */
export function readBookingAllocation(arenaData: DocumentData | undefined): BookingAllocation {
  const raw = arenaData?.["bookingAllocation"] as DocumentData | undefined;
  if (!raw || raw["mode"] !== "capacity") {
    return {...DEFAULT_BOOKING_ALLOCATION, courtIds: [], priceBySport: {}};
  }
  const priceBySport: Record<string, number> = {};
  const rawPrices = raw["priceBySport"];
  if (rawPrices && typeof rawPrices === "object") {
    for (const [sport, value] of Object.entries(rawPrices as Record<string, unknown>)) {
      if (typeof value === "number" && value > 0) priceBySport[sport] = value;
    }
  }
  return {
    mode: "capacity",
    courtIds: Array.isArray(raw["courtIds"]) ? (raw["courtIds"] as unknown[]).map(str).filter(Boolean) : [],
    priceBySport,
    revealBeforeArrival: raw["revealBeforeArrival"] === true,
    allowCourtChoice: raw["allowCourtChoice"] === true,
  };
}

export type AllocationRequest = {kind: "court"} | {kind: "floating"};

/**
 * O que a reserva do atleta vai ser nesta arena. `allocation: "capacity"` é o cliente dizendo
 * que sabe reservar sem quadra (apps/portais antigos não mandam).
 * - Arena `court`: sempre quadra escolhida (o `allocation` do cliente é ignorado).
 * - Arena `capacity` sem `courtId` e com `allocation`: flutuante.
 * - Arena `capacity` com `courtId`: só se a arena deixa escolher (modo misto).
 * - Arena `capacity` e cliente antigo sem escolha permitida: "Atualize o app".
 */
export function resolveAllocationRequest(
  allocation: BookingAllocation,
  input: {courtId?: string | null; allocation?: unknown},
): AllocationRequest {
  if (allocation.mode !== "capacity") return {kind: "court"};
  const courtId = str(input.courtId);
  if (courtId) {
    if (allocation.allowCourtChoice) return {kind: "court"};
    if (input.allocation === "capacity") {
      throw new HttpsError("failed-precondition", "Nesta arena a quadra é definida pela equipe na chegada.");
    }
    throw new HttpsError("failed-precondition", OUTDATED_CLIENT_MESSAGE);
  }
  if (input.allocation !== "capacity") {
    throw new HttpsError("failed-precondition", OUTDATED_CLIENT_MESSAGE);
  }
  return {kind: "floating"};
}

/** Dados da quadra com o preço do horário do esporte no lugar do preço da quadra. Puro. */
export function withCapacityPrice(
  courtData: DocumentData | undefined,
  allocation: BookingAllocation,
  sport: string | null,
): DocumentData | undefined {
  const price = sport ? allocation.priceBySport[sport] : undefined;
  if (!price) {
    throw new HttpsError("failed-precondition", "A arena ainda não definiu o preço do horário deste esporte.");
  }
  return {...(courtData ?? {}), basePricePerHourReais: price, basePriceReais: price};
}

// ---------------------------------------------------------------------------
// Quadra provisória da reserva flutuante
// ---------------------------------------------------------------------------

export interface CapacityCourt {
  id: string;
  name: string;
  data: DocumentData;
}

/** Hora cheia anterior e seguinte do intervalo (vizinhas para o "menos buraco"). Puro. */
export function neighborWindows(startTime: string, endTime: string): Array<{startTime: string; endTime: string}> {
  const [sh, sm] = startTime.split(":").map((p) => parseInt(p, 10));
  const [eh, em] = endTime.split(":").map((p) => parseInt(p, 10));
  const startMin = (sh ?? 0) * 60 + (sm ?? 0);
  let endMin = (eh ?? 0) * 60 + (em ?? 0);
  if (endMin === 0 && startMin > 0) endMin = 24 * 60;
  const fmt = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
  const out: Array<{startTime: string; endTime: string}> = [];
  const before = Math.floor(startMin / 60) * 60 - 60;
  if (before >= 0) out.push({startTime: fmt(before), endTime: fmt(before + 60)});
  const after = Math.ceil(endMin / 60) * 60;
  if (after < 24 * 60) out.push({startTime: fmt(after), endTime: fmt(after + 60)});
  return out;
}

/**
 * Quadras que podem receber a reserva flutuante agora, na ordem em que vale tentar: as que
 * encostam numa reserva (hora antes/depois ocupada) primeiro, para a grade não ficar picada;
 * empate na ordem da distribuição. Tira bloqueada e já ocupada no horário. Fora da transação —
 * a transação confere de novo com `takeFirstFreeCourt`.
 */
export async function rankCapacityCourts(
  db: Firestore,
  params: {arenaId: string; arenaData: DocumentData | undefined; sport: string | null; dateKey: string; startTime: string; endTime: string},
): Promise<CapacityCourt[]> {
  const arenaRef = db.collection("arenas").doc(params.arenaId);
  const courtsSnap = await arenaRef.collection("courts").get();
  const courts = courtsSnap.docs.map((d) => ({id: d.id, data: d.data() as DocumentData}));
  const byId = new Map(courts.map((c) => [c.id, c.data]));
  const candidates = floatingCandidateCourts(params.arenaData, courts, params.sport, []);

  const ranked: Array<CapacityCourt & {score: number; order: number}> = [];
  for (let i = 0; i < candidates.length; i++) {
    const court = candidates[i]!;
    const lockIds = computeSlotLockIds({
      arenaId: params.arenaId, courtId: court.id, dateKey: params.dateKey,
      startTime: params.startTime, endTime: params.endTime,
    });
    if (lockIds.length === 0) continue;
    const neighborIds = neighborWindows(params.startTime, params.endTime).flatMap((w) => computeSlotLockIds({
      arenaId: params.arenaId, courtId: court.id, dateKey: params.dateKey, startTime: w.startTime, endTime: w.endTime,
    }));
    const refs = [...lockIds, ...neighborIds].map((id) => db.collection("arenaSlotLocks").doc(id));
    const snaps = await db.getAll(...refs);
    if (snaps.slice(0, lockIds.length).some((snap) => snap.exists)) continue;
    const blocked = await hasBlockedSlotOverlap(db, {
      arenaId: params.arenaId, courtId: court.id, startTime: params.startTime, endTime: params.endTime,
    }, params.dateKey);
    if (blocked) continue;
    const score = snaps.slice(lockIds.length).filter((snap) => snap.exists).length;
    ranked.push({id: court.id, name: court.name, data: byId.get(court.id) ?? {}, score, order: i});
  }
  ranked.sort((a, b) => b.score - a.score || a.order - b.order);
  return ranked.map(({id, name, data}) => ({id, name, data}));
}

/** Na transação: a primeira quadra da lista ainda livre em todas as horas, ou `null` (lotou). */
export async function takeFirstFreeCourt(
  tx: TxReader,
  db: Firestore,
  courts: ReadonlyArray<CapacityCourt>,
  params: {arenaId: string; dateKey: string; startTime: string; endTime: string},
): Promise<{court: CapacityCourt; lockRefs: FirebaseFirestore.DocumentReference[]} | null> {
  for (const court of courts) {
    const lockRefs = computeSlotLockIds({...params, courtId: court.id})
      .map((id) => db.collection("arenaSlotLocks").doc(id));
    let free = lockRefs.length > 0;
    for (const ref of lockRefs) {
      if ((await tx.get(ref)).exists) {
        free = false;
        break;
      }
    }
    if (free) return {court, lockRefs};
  }
  return null;
}

export const CAPACITY_FULL_MESSAGE = "Esse horário lotou. Escolha outro.";

// ---------------------------------------------------------------------------
// Configurar
// ---------------------------------------------------------------------------

export interface SetBookingAllocationInput {
  arenaId: string;
  mode: BookingAllocationMode;
  courtIds: string[];
  priceBySport: Record<string, number>;
  revealBeforeArrival: boolean;
  allowCourtChoice: boolean;
}

export function parseSetBookingAllocationInput(raw: unknown): SetBookingAllocationInput {
  const data = (raw ?? {}) as Record<string, unknown>;
  const arenaId = str(data["arenaId"]);
  if (!arenaId) throw new HttpsError("invalid-argument", "Arena inválida.");
  const mode = data["mode"];
  if (mode !== "court" && mode !== "capacity") throw new HttpsError("invalid-argument", "Modo inválido.");
  const courtIds = Array.isArray(data["courtIds"]) ?
    [...new Set((data["courtIds"] as unknown[]).map(str).filter(Boolean))] :
    [];
  const priceBySport: Record<string, number> = {};
  const rawPrices = data["priceBySport"];
  if (rawPrices && typeof rawPrices === "object") {
    for (const [rawSport, value] of Object.entries(rawPrices as Record<string, unknown>)) {
      const sport = bookingSportCode(rawSport);
      const price = typeof value === "number" ? Math.round(value * 100) / 100 : NaN;
      if (!sport) throw new HttpsError("invalid-argument", "Esporte inválido no preço do horário.");
      if (!(price > 0) || price > 10000) {
        throw new HttpsError("invalid-argument", "Preço do horário inválido.");
      }
      priceBySport[sport] = price;
    }
  }
  return {
    arenaId,
    mode,
    courtIds,
    priceBySport,
    revealBeforeArrival: data["revealBeforeArrival"] === true,
    allowCourtChoice: data["allowCourtChoice"] === true,
  };
}

/** Esportes das quadras escolhidas que ficaram sem preço do horário. Puro. */
export function sportsMissingPrice(
  courts: ReadonlyArray<DocumentData>,
  priceBySport: Record<string, number>,
): string[] {
  const missing = new Set<string>();
  for (const court of courts) {
    for (const sport of courtSportCodes(court)) {
      if (!priceBySport[sport]) missing.add(sport);
    }
  }
  return [...missing];
}

export async function setArenaBookingAllocationCore(
  db: Firestore,
  uid: string,
  input: SetBookingAllocationInput,
): Promise<{mode: BookingAllocationMode}> {
  await assertArenaAreaAccess(db, input.arenaId, uid, "quadras", "write");
  const arenaRef = db.collection("arenas").doc(input.arenaId);

  if (input.mode === "court") {
    // Volta ao padrão sem perder o que a arena configurou (se ligar de novo, está lá).
    await arenaRef.set({
      bookingAllocation: {mode: "court", updatedAt: FieldValue.serverTimestamp(), updatedBy: uid},
    }, {merge: true});
    return {mode: "court"};
  }

  if (input.courtIds.length === 0) {
    throw new HttpsError("invalid-argument", "Escolha ao menos uma quadra para a distribuição.");
  }
  const courtSnaps = await Promise.all(input.courtIds.map((id) => arenaRef.collection("courts").doc(id).get()));
  if (courtSnaps.some((s) => !s.exists)) {
    throw new HttpsError("not-found", "Uma das quadras escolhidas não existe mais.");
  }
  const courts = courtSnaps.map((s) => s.data() as DocumentData);
  const missing = sportsMissingPrice(courts, input.priceBySport);
  if (missing.length > 0) {
    throw new HttpsError("invalid-argument", "Defina o preço do horário de todos os esportes das quadras escolhidas.");
  }
  if (Object.keys(input.priceBySport).length === 0) {
    throw new HttpsError("invalid-argument", "Defina o preço do horário.");
  }

  // `update` troca o mapa `bookingAllocation` inteiro: esporte tirado do preço não fica de sobra.
  await arenaRef.update({
    bookingAllocation: {
      mode: "capacity",
      courtIds: input.courtIds,
      priceBySport: input.priceBySport,
      revealBeforeArrival: input.revealBeforeArrival,
      allowCourtChoice: input.allowCourtChoice,
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: uid,
    },
  });
  return {mode: "capacity"};
}

export const setArenaBookingAllocation = onCall({
  region: CLIENT_FACING_REGIONS,
}, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Faça login para continuar.");
  return setArenaBookingAllocationCore(getFirestore(), uid, parseSetBookingAllocationInput(request.data));
});
