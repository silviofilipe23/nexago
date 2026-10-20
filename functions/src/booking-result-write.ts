/**
 * Callables do placar do pós-jogo (`bookingResults/{bookingId}`): o dono da reserva salva, os
 * adversários com conta confirmam ou contestam. Cliente não grava o doc (rule `write: false`);
 * nome, foto, arena e horário vêm da reserva e dos perfis, nunca do payload. Regras puras em
 * `booking-result.ts`.
 */
import {FieldValue, Timestamp, getFirestore, type Firestore} from "firebase-admin/firestore";
import {HttpsError, onCall} from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import {CLIENT_FACING_REGIONS} from "./function-regions";
import {
  WEB_PUSH_PRIVATE_KEY,
  WEB_PUSH_PUBLIC_KEY,
  WEB_PUSH_SUBJECT,
  deliverNotificationToUser,
} from "./notification-delivery";
import {
  BOOKING_RESULTS,
  RESULT_RENOTIFY_MS,
  bookingOwnerUid,
  bookingResultOpenError,
  firstName,
  isDocId,
  parseBookingResultInput,
  resultInputMessage,
  resultParticipants,
  resultPlayerName,
  resultPlayerPhoto,
  resultPushLine,
  responseBlocker,
  shortDateLabel,
  type BookingResultResponse,
} from "./booking-result";

type Data = Record<string, unknown>;

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

/** Aviso a quem está no placar. Falha de push não desfaz o placar salvo. */
export interface ResultNotice {
  userId: string;
  title: string;
  body: string;
  type: "booking_result_pending" | "booking_result_confirmed" | "booking_result_disputed";
  bookingId: string;
}

export async function saveBookingResultCore(
  db: Firestore,
  uid: string,
  raw: unknown,
  now: Date,
): Promise<{result: {status: "pending"; version: number; opponentUids: string[]}; notices: ResultNotice[]}> {
  const {input, fields} = parseBookingResultInput(raw);
  if (fields.length > 0) {
    throw new HttpsError("invalid-argument", resultInputMessage(fields), {fields});
  }

  const bookingSnap = await db.collection("arenaBookings").doc(input.bookingId).get();
  const booking = bookingSnap.exists ? bookingSnap.data()! : null;
  if (!booking || bookingOwnerUid(booking) !== uid) {
    throw new HttpsError("not-found", "Reserva não encontrada.");
  }
  const closed = bookingResultOpenError(booking, now);
  if (closed) throw new HttpsError("failed-precondition", closed);

  const {playerUids, opponentUids, creatorTeamId} = resultParticipants(input.teams, uid);
  if (creatorTeamId == null) {
    throw new HttpsError("invalid-argument", "Você precisa estar em um dos times.", {fields: ["teams"]});
  }

  const userSnaps = await db.getAll(...playerUids.map((id) => db.collection("users").doc(id)));
  const users = new Map(userSnaps.map((s) => [s.id, s.exists ? s.data()! : null]));
  if (userSnaps.some((s) => !s.exists)) {
    throw new HttpsError("invalid-argument", "Um dos atletas do placar não foi encontrado.", {fields: ["teams"]});
  }

  const teams = input.teams.map((t) => ({
    id: t.id,
    customName: t.customName,
    players: t.players.map((p) => {
      const user = p.guest ? null : users.get(p.id) ?? null;
      return {
        id: p.id,
        name: p.guest ? p.name : resultPlayerName(user),
        avatarUrl: p.guest ? null : resultPlayerPhoto(user),
        guest: p.guest,
      };
    }),
  }));
  const creatorName = resultPlayerName(users.get(uid) ?? null);
  const ref = db.collection(BOOKING_RESULTS).doc(input.bookingId);

  const {version, notifyUids} = await db.runTransaction(async (tx) => {
    const current = await tx.get(ref);
    const prev = current.exists ? current.data()! : null;
    if (str(prev?.["status"]) === "confirmed") {
      throw new HttpsError("failed-precondition", "Esse placar já foi confirmado e não muda mais.");
    }
    const next = (typeof prev?.["version"] === "number" ? (prev["version"] as number) : 0) + 1;
    // Salvar de novo em seguida não repete o push a quem já foi avisado (o placar pendente já
    // aparece no app dele); adversário novo e a correção depois de uma contestação sempre avisam.
    const lastNotified = (prev?.["notifiedAt"] as Timestamp | null | undefined)?.toMillis?.() ?? null;
    const renotify = lastNotified == null || str(prev?.["status"]) === "disputed" ||
      now.getTime() - lastNotified >= RESULT_RENOTIFY_MS;
    tx.set(ref, {
      bookingId: input.bookingId,
      arenaId: str(booking["arenaId"]),
      arenaName: str(booking["arenaName"]) || "Arena",
      courtName: str(booking["courtName"]) || null,
      sport: str(booking["sport"]) || null,
      dateKey: (str(booking["date"]) || str(booking["dateKey"])).slice(0, 10),
      startTime: str(booking["startTime"]).slice(0, 5),
      endTime: str(booking["endTime"]).slice(0, 5),
      createdBy: uid,
      createdByName: creatorName,
      teams,
      games: input.games,
      playerUids,
      opponentUids,
      status: "pending",
      version: next,
      respondedBy: null,
      respondedByName: null,
      respondedAt: null,
      notifiedAt: renotify && opponentUids.length > 0 ? Timestamp.fromDate(now) : prev?.["notifiedAt"] ?? null,
      createdAt: prev?.["createdAt"] ?? FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    const prevOpponents = Array.isArray(prev?.["opponentUids"]) ? (prev!["opponentUids"] as unknown[]) : [];
    return {
      version: next,
      notifyUids: renotify ? opponentUids : opponentUids.filter((id) => !prevOpponents.includes(id)),
    };
  });

  const arenaName = str(booking["arenaName"]) || "Arena";
  const when = shortDateLabel(str(booking["date"]) || str(booking["dateKey"]));
  const line = resultPushLine(teams, input.games, creatorTeamId);
  const where = [when && `de ${when}`, `na ${arenaName}`].filter(Boolean).join(" ");
  const notices: ResultNotice[] = notifyUids.map((userId) => ({
    userId,
    title: "Placar para confirmar",
    body: line ?
      `${firstName(creatorName)} lançou o jogo ${where}: ${line}. Confirme ou conteste.` :
      `${firstName(creatorName)} lançou o placar da rotação ${where}. Confirme ou conteste.`,
    type: "booking_result_pending",
    bookingId: input.bookingId,
  }));
  return {result: {status: "pending", version, opponentUids}, notices};
}

export async function respondBookingResultCore(
  db: Firestore,
  uid: string,
  raw: unknown,
): Promise<{result: {status: "confirmed" | "disputed"}; notices: ResultNotice[]}> {
  const data = (raw && typeof raw === "object" ? raw : {}) as Data;
  const bookingId = str(data["bookingId"]);
  const response = str(data["response"]) as BookingResultResponse;
  const version = data["version"];
  if (!isDocId(bookingId) || (response !== "confirm" && response !== "dispute") ||
    typeof version !== "number" || !Number.isInteger(version)) {
    throw new HttpsError("invalid-argument", "Resposta inválida.");
  }

  const responderSnap = await db.collection("users").doc(uid).get();
  const responderName = resultPlayerName(responderSnap.exists ? responderSnap.data()! : null);
  const ref = db.collection(BOOKING_RESULTS).doc(bookingId);

  const doc = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const current = snap.exists ? snap.data()! : null;
    const players = Array.isArray(current?.["playerUids"]) ? (current!["playerUids"] as unknown[]) : [];
    if (!current || !players.includes(uid)) {
      throw new HttpsError("not-found", "Placar não encontrado.");
    }
    const blocker = responseBlocker(current, uid, version);
    if (blocker) throw new HttpsError(blocker.code, blocker.message);
    tx.update(ref, {
      status: response === "confirm" ? "confirmed" : "disputed",
      respondedBy: uid,
      respondedByName: responderName,
      respondedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    return current;
  });

  const status = response === "confirm" ? "confirmed" : "disputed";
  const arenaName = str(doc["arenaName"]) || "Arena";
  const when = shortDateLabel(str(doc["dateKey"]));
  const where = [when && `de ${when}`, `na ${arenaName}`].filter(Boolean).join(" ");
  const who = firstName(responderName);
  const notice: ResultNotice = status === "confirmed" ?
    {
      userId: str(doc["createdBy"]),
      title: "Placar confirmado",
      body: `${who} confirmou o placar do jogo ${where}. Já conta no seu histórico.`,
      type: "booking_result_confirmed",
      bookingId,
    } :
    {
      userId: str(doc["createdBy"]),
      title: "Placar contestado",
      body: `${who} contestou o placar do jogo ${where}. Corrija e envie de novo.`,
      type: "booking_result_disputed",
      bookingId,
    };
  return {result: {status}, notices: notice.userId ? [notice] : []};
}

async function deliverNotices(notices: ResultNotice[]): Promise<void> {
  await Promise.all(notices.map(async (n) => {
    try {
      // Sem `url`: o app da loja de antes desta tela cai em Minhas reservas pelo `bookingId`; o
      // app novo abre a conferência do placar pelo tipo.
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

export const saveBookingResult = onCall(
  {region: CLIENT_FACING_REGIONS, secrets: [WEB_PUSH_PUBLIC_KEY, WEB_PUSH_PRIVATE_KEY, WEB_PUSH_SUBJECT]},
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "Entre na sua conta para salvar o placar.");
    const {result, notices} = await saveBookingResultCore(getFirestore(), uid, request.data, new Date());
    await deliverNotices(notices);
    return result;
  },
);

export const respondBookingResult = onCall(
  {region: CLIENT_FACING_REGIONS, secrets: [WEB_PUSH_PUBLIC_KEY, WEB_PUSH_PRIVATE_KEY, WEB_PUSH_SUBJECT]},
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "Entre na sua conta para responder.");
    const {result, notices} = await respondBookingResultCore(getFirestore(), uid, request.data);
    await deliverNotices(notices);
    return result;
  },
);
