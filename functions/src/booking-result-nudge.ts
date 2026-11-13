/**
 * Fase 2 do "Lançar placar" da pelada (canvas "Proposta · lançar placar em 2 passos"):
 *
 * 1. "Como foi o jogo?" — varredura a cada 15 min: reserva garantida e liberada (metade paga pelo
 *    app), terminada há 15 min–3 h, sem placar e ainda não lembrada → push a quem reservou, que
 *    abre direto o "Lançar placar". Uma vez por reserva (`resultPromptedAt`).
 * 2. Placar sugerido — o convidado marca (ao vivo ou digitado) e manda para quem reservou enviar:
 *    `bookingResultSuggestions/{bookingId}` (um por reserva, o último vale). Quem reservou recebe
 *    push, abre o "Lançar placar" já preenchido e envia pelo `saveBookingResult` de sempre, que
 *    apaga a sugestão. Cliente não grava a coleção (rule `write: false`).
 *
 * Tipos de push `pelada_score_*`, sem `url`: o app da loja de antes desta tela não tem a rota e
 * abre só o app; o app novo leva ao "Lançar placar" pelo tipo.
 */
import {FieldValue, Timestamp, getFirestore, type Firestore} from "firebase-admin/firestore";
import {HttpsError, onCall} from "firebase-functions/v2/https";
import {onSchedule} from "firebase-functions/v2/scheduler";
import * as logger from "firebase-functions/logger";
import {resolveBookingSocialUnlock} from "./booking-app-payment";
import {
  BOOKING_RESULTS,
  bookingEndAt,
  bookingOwnerUid,
  bookingResultOpenError,
  isDocId,
  parseBookingResultInput,
  resultInputMessage,
  resultParticipants,
  resultPlayerName,
  resultPlayerPhoto,
} from "./booking-result";
import {EVENT_TIME_ZONE} from "./event-timezone";
import {CLIENT_FACING_REGIONS} from "./function-regions";
import {
  WEB_PUSH_PRIVATE_KEY,
  WEB_PUSH_PUBLIC_KEY,
  WEB_PUSH_SUBJECT,
  deliverNotificationToUser,
} from "./notification-delivery";

type Data = Record<string, unknown>;

export const BOOKING_RESULT_SUGGESTIONS = "bookingResultSuggestions";

/** O lembrete sai depois desse tempo do fim (dá para guardar as coisas e pegar o celular). */
export const PROMPT_AFTER_END_MS = 15 * 60 * 1000;

/** Passou disso do fim, não lembra mais (o momento passou). */
export const PROMPT_UNTIL_END_MS = 3 * 60 * 60 * 1000;

/** Quantas reservas a varredura do lembrete olha por rodada. */
export const PROMPT_LIMIT = 300;

const NOT_PLAYABLE = new Set(["canceled", "cancelled", "pending", "processing", "pending_payment",
  "expired", "refunded", "rejected"]);

/** Reserva que não é jogo de pelada: aula, clubinho, manutenção, torneio. */
const NOT_A_GAME_SOURCES = new Set(["club", "class", "lesson", "maintenance", "tournament", "block"]);

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

/** `YYYY-MM-DD` do instante na parede de São Paulo (UTC-3, sem horário de verão). */
export function saoPauloDateKey(at: Date): string {
  return new Date(at.getTime() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/**
 * A reserva pede o "Como foi o jogo?" agora? Só a parte que dá para decidir pelo doc — placar
 * já lançado e a liberação (metade paga pelo app) ficam com quem chama.
 */
export function resultPromptDue(booking: Data, now: Date): boolean {
  if (booking["resultPromptedAt"] != null) return false;
  if (!bookingOwnerUid(booking)) return false;
  const status = str(booking["status"]).toLowerCase();
  if (NOT_PLAYABLE.has(status)) return false;
  if (booking["refundedAt"] != null) return false;
  const source = str(booking["source"]).toLowerCase();
  if (NOT_A_GAME_SOURCES.has(source)) return false;
  if (str(booking["clubSessionId"]) || str(booking["classId"]) || str(booking["classSessionId"])) {
    return false;
  }
  const dateKey = (str(booking["date"]) || str(booking["dateKey"])).slice(0, 10);
  const endsAt = bookingEndAt(dateKey, str(booking["startTime"]), str(booking["endTime"]));
  if (!endsAt) return false;
  const since = now.getTime() - endsAt.getTime();
  return since >= PROMPT_AFTER_END_MS && since <= PROMPT_UNTIL_END_MS;
}

/** "Enzo, Rafael e Lia" — quem jogou com quem reservou (convidados da reserva). */
export function promptNamesLine(booking: Data): string {
  const raw = Array.isArray(booking["participants"]) ? (booking["participants"] as unknown[]) : [];
  const names: string[] = [];
  for (const entry of raw) {
    const name = str((entry as Data | null)?.["name"]).split(/\s+/)[0];
    if (name && !names.includes(name)) names.push(name);
  }
  if (names.length === 0) return "";
  if (names.length > 3) return `${names.slice(0, 2).join(", ")} e mais ${names.length - 2}`;
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(", ")} e ${names[names.length - 1]}`;
}

export function resultPromptBody(booking: Data): string {
  const arena = str(booking["arenaName"]) || "a quadra";
  const names = promptNamesLine(booking);
  return names ?
    `Lance o placar da ${arena} em 30 segundos: ${names} confirmam e vira estatística.` :
    `Lance o placar da ${arena} em 30 segundos e guarde o resultado no seu histórico.`;
}

export interface NudgeNotice {
  userId: string;
  title: string;
  body: string;
  type: "pelada_score_prompt" | "pelada_score_suggested";
  bookingId: string;
}

/**
 * Uma rodada do lembrete: reservas de hoje e de ontem (parede de SP) que terminaram há 15 min–3 h.
 * Cada uma numa transação que relê o doc e marca `resultPromptedAt` — duas rodadas não avisam duas
 * vezes.
 */
export async function promptBookingResultsCore(
  db: Firestore,
  now: Date,
): Promise<{prompted: number; notices: NudgeNotice[]}> {
  const days = [saoPauloDateKey(now), saoPauloDateKey(new Date(now.getTime() - 24 * 60 * 60 * 1000))];
  const snap = await db.collection("arenaBookings").where("date", "in", days).limit(PROMPT_LIMIT).get();
  const notices: NudgeNotice[] = [];
  const nowTs = Timestamp.fromDate(now);
  for (const docSnap of snap.docs) {
    const booking = docSnap.data() as Data;
    if (!resultPromptDue(booking, now)) continue;
    const result = await db.collection(BOOKING_RESULTS).doc(docSnap.id).get();
    if (result.exists) continue;
    const unlock = await resolveBookingSocialUnlock(db, booking);
    if (!unlock.socialUnlocked) continue;
    const ref = db.collection("arenaBookings").doc(docSnap.id);
    const marked = await db.runTransaction(async (tx) => {
      const fresh = await tx.get(ref);
      const current = fresh.exists ? (fresh.data() as Data) : null;
      if (!current || !resultPromptDue(current, now)) return false;
      tx.update(ref, {resultPromptedAt: nowTs});
      return true;
    });
    if (!marked) continue;
    notices.push({
      userId: bookingOwnerUid(booking),
      title: "Como foi o jogo?",
      body: resultPromptBody(booking),
      type: "pelada_score_prompt",
      bookingId: docSnap.id,
    });
  }
  return {prompted: notices.length, notices};
}

/** Quem pode sugerir: convidado da reserva (`participants`) ou quem já está no placar salvo. */
function bookingGuestUids(booking: Data): Set<string> {
  const out = new Set<string>();
  for (const key of ["participantUids"]) {
    const list = booking[key];
    if (Array.isArray(list)) for (const v of list) if (typeof v === "string" && v) out.add(v);
  }
  const raw = Array.isArray(booking["participants"]) ? (booking["participants"] as unknown[]) : [];
  for (const entry of raw) {
    const uid = str((entry as Data | null)?.["uid"]);
    if (uid) out.add(uid);
  }
  return out;
}

/**
 * "Mandar para quem reservou enviar": o convidado grava a sugestão (teams/games validados como no
 * "Salvar placar"; nomes e fotos vêm dos perfis) e quem reservou é avisado.
 */
export async function suggestBookingResultCore(
  db: Firestore,
  uid: string,
  raw: unknown,
  now: Date,
): Promise<{result: {status: "suggested"}; notices: NudgeNotice[]}> {
  const {input, fields} = parseBookingResultInput(raw);
  if (fields.length > 0) {
    throw new HttpsError("invalid-argument", resultInputMessage(fields), {fields});
  }
  if (!isDocId(input.bookingId)) throw new HttpsError("invalid-argument", "Reserva inválida.");
  const bookingSnap = await db.collection("arenaBookings").doc(input.bookingId).get();
  const booking = bookingSnap.exists ? (bookingSnap.data() as Data) : null;
  if (!booking) throw new HttpsError("not-found", "Reserva não encontrada.");
  const ownerUid = bookingOwnerUid(booking);
  if (ownerUid === uid) {
    throw new HttpsError("failed-precondition", "Você reservou a quadra: envie o placar direto.");
  }
  const saved = await db.collection(BOOKING_RESULTS).doc(input.bookingId).get();
  const savedData = saved.exists ? (saved.data() as Data) : null;
  const savedPlayers = Array.isArray(savedData?.["playerUids"]) ? (savedData!["playerUids"] as unknown[]) : [];
  if (!bookingGuestUids(booking).has(uid) && !savedPlayers.includes(uid)) {
    throw new HttpsError("permission-denied", "Só quem está na reserva sugere o placar.");
  }
  const closed = bookingResultOpenError(booking, now);
  if (closed) throw new HttpsError("failed-precondition", closed);
  if (str(savedData?.["status"]) === "confirmed") {
    throw new HttpsError("failed-precondition", "O placar desta pelada já foi confirmado.");
  }
  const {playerUids, creatorTeamId} = resultParticipants(input.teams, uid);
  if (creatorTeamId == null) {
    throw new HttpsError("invalid-argument", "Você precisa estar em um dos times.", {fields: ["teams"]});
  }
  const userSnaps = await db.getAll(...playerUids.map((id) => db.collection("users").doc(id)));
  if (userSnaps.some((s) => !s.exists)) {
    throw new HttpsError("invalid-argument", "Um dos atletas do placar não foi encontrado.", {fields: ["teams"]});
  }
  const users = new Map(userSnaps.map((s) => [s.id, s.data() as Data]));
  const teams = input.teams.map((t) => ({
    id: t.id,
    customName: t.customName,
    players: t.players.map((p) => {
      const user = users.get(p.id) ?? null;
      return {id: p.id, name: resultPlayerName(user), avatarUrl: resultPlayerPhoto(user)};
    }),
  }));
  const suggesterName = resultPlayerName(users.get(uid) ?? null);
  await db.collection(BOOKING_RESULT_SUGGESTIONS).doc(input.bookingId).set({
    bookingId: input.bookingId,
    ownerUid,
    suggestedBy: uid,
    suggestedByName: suggesterName,
    arenaName: str(booking["arenaName"]) || "Arena",
    sport: str(booking["sport"]) || null,
    teams,
    games: input.games,
    createdAt: Timestamp.fromDate(now),
    updatedAt: FieldValue.serverTimestamp(),
  });
  const first = suggesterName.split(/\s+/)[0] || "Um jogador";
  const arena = str(booking["arenaName"]) || "a quadra";
  return {
    result: {status: "suggested"},
    notices: [{
      userId: ownerUid,
      title: `${first} marcou o placar`,
      body: `Confira o placar da ${arena} e envie para todos confirmarem.`,
      type: "pelada_score_suggested",
      bookingId: input.bookingId,
    }],
  };
}

/** Depois do "Salvar placar": a sugestão cumpriu o papel. Falha não desfaz o placar. */
export async function clearBookingResultSuggestion(db: Firestore, bookingId: string): Promise<void> {
  try {
    await db.collection(BOOKING_RESULT_SUGGESTIONS).doc(bookingId).delete();
  } catch (err) {
    logger.warn("bookingResult: sugestão não apagada", {bookingId, err});
  }
}

async function deliverNudges(notices: NudgeNotice[]): Promise<void> {
  await Promise.all(notices.map(async (n) => {
    try {
      await deliverNotificationToUser({
        userId: n.userId,
        title: n.title,
        body: n.body,
        type: n.type,
        data: {bookingId: n.bookingId},
      });
    } catch (err) {
      logger.warn("bookingResult: aviso não entregue", {userId: n.userId, type: n.type, err});
    }
  }));
}

export const suggestBookingResult = onCall(
  {region: CLIENT_FACING_REGIONS, secrets: [WEB_PUSH_PUBLIC_KEY, WEB_PUSH_PRIVATE_KEY, WEB_PUSH_SUBJECT]},
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "Entre na sua conta para mandar o placar.");
    const {result, notices} = await suggestBookingResultCore(getFirestore(), uid, request.data, new Date());
    await deliverNudges(notices);
    return result;
  },
);

export const promptBookingResults = onSchedule(
  {
    schedule: "every 15 minutes",
    timeZone: EVENT_TIME_ZONE,
    secrets: [WEB_PUSH_PUBLIC_KEY, WEB_PUSH_PRIVATE_KEY, WEB_PUSH_SUBJECT],
  },
  async () => {
    const {prompted, notices} = await promptBookingResultsCore(getFirestore(), new Date());
    await deliverNudges(notices);
    logger.info("promptBookingResults", {prompted});
  },
);
