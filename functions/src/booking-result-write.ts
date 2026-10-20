/**
 * Callables e varredura do placar do pós-jogo — a "pelada" (`bookingResults/{bookingId}`): o dono
 * da reserva salva (e edita), quem está no placar confirma ou contesta, e a varredura lembra 24h
 * antes do prazo e confirma sozinha quando as 48h vencem. Cliente não grava o doc (rule
 * `write: false`); nome, foto, arena e horário vêm da reserva e dos perfis, nunca do payload.
 * Regras puras em `booking-result.ts`.
 */
import {FieldValue, Timestamp, getFirestore, type Firestore} from "firebase-admin/firestore";
import {HttpsError, onCall} from "firebase-functions/v2/https";
import {onSchedule} from "firebase-functions/v2/scheduler";
import * as logger from "firebase-functions/logger";
import {EVENT_TIME_ZONE} from "./event-timezone";
import {CLIENT_FACING_REGIONS} from "./function-regions";
import {
  WEB_PUSH_PRIVATE_KEY,
  WEB_PUSH_PUBLIC_KEY,
  WEB_PUSH_SUBJECT,
  deliverNotificationToUser,
} from "./notification-delivery";
import {
  BOOKING_RESULTS,
  CONFIRM_WINDOW_MS,
  REMINDER_BEFORE_MS,
  RESULT_RENOTIFY_MS,
  autoConfirmedConfirmations,
  bookingEndAt,
  bookingOwnerUid,
  bookingResultOpenError,
  bookingStartAt,
  confirmationsAfterResponse,
  confirmationsOf,
  disputePushBody,
  freshConfirmations,
  isDocId,
  parseBookingResultInput,
  parseDisputeReason,
  pendingPushBody,
  pendingUidsOf,
  reminderPushBody,
  resultFormat,
  resultInputMessage,
  resultParticipants,
  resultPlayerName,
  resultPlayerPhoto,
  responseBlocker,
  statusOf,
  sweepAction,
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
  type: "booking_result_pending" | "booking_result_reminder" | "booking_result_disputed";
  bookingId: string;
}

/** Quantos placares a varredura trata por rodada (roda a cada 30 min). */
export const SWEEP_LIMIT = 200;

export async function saveBookingResultCore(
  db: Firestore,
  uid: string,
  raw: unknown,
  now: Date,
): Promise<{result: {status: "pending"; version: number; pendingUids: string[]}; notices: ResultNotice[]}> {
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
      const user = users.get(p.id) ?? null;
      return {id: p.id, name: resultPlayerName(user), avatarUrl: resultPlayerPhoto(user), guest: false};
    }),
  }));
  const creatorName = resultPlayerName(users.get(uid) ?? null);
  const dateKey = (str(booking["date"]) || str(booking["dateKey"])).slice(0, 10);
  const startTime = str(booking["startTime"]).slice(0, 5);
  const endTime = str(booking["endTime"]).slice(0, 5);
  const startsAt = bookingStartAt(dateKey, startTime);
  const endsAt = bookingEndAt(dateKey, startTime, endTime);
  const amount = typeof booking["amountReais"] === "number" ? (booking["amountReais"] as number) : null;
  const ref = db.collection(BOOKING_RESULTS).doc(input.bookingId);
  const nowTs = Timestamp.fromDate(now);

  const {version, notifyUids, pendingUids} = await db.runTransaction(async (tx) => {
    const current = await tx.get(ref);
    const prev = current.exists ? current.data()! : null;
    const next = (typeof prev?.["version"] === "number" ? (prev["version"] as number) : 0) + 1;
    const confirmations = freshConfirmations(playerUids, uid, next, nowTs);
    const pending = pendingUidsOf(confirmations);
    // Salvar de novo em seguida não repete o push a quem já foi avisado (o placar pendente já
    // aparece no app dele); jogador novo, correção de contestação e edição depois de confirmado
    // sempre avisam.
    const lastNotified = (prev?.["notifiedAt"] as Timestamp | null | undefined)?.toMillis?.() ?? null;
    const prevStatus = str(prev?.["status"]);
    const renotify = lastNotified == null || prevStatus !== "pending" ||
      now.getTime() - lastNotified >= RESULT_RENOTIFY_MS;
    tx.set(ref, {
      bookingId: input.bookingId,
      arenaId: str(booking["arenaId"]),
      arenaName: str(booking["arenaName"]) || "Arena",
      courtName: str(booking["courtName"]) || null,
      sport: str(booking["sport"]) || null,
      dateKey,
      startTime,
      endTime,
      startsAt: startsAt ? Timestamp.fromDate(startsAt) : null,
      endsAt: endsAt ? Timestamp.fromDate(endsAt) : null,
      bookingAmountReais: amount,
      format: resultFormat(teams.length),
      createdBy: str(prev?.["createdBy"]) || uid,
      createdByName: str(prev?.["createdByName"]) || creatorName,
      editedBy: uid,
      editedByName: creatorName,
      teams,
      games: input.games,
      playerUids,
      opponentUids,
      confirmations,
      pendingUids: pending,
      status: "pending",
      version: next,
      confirmDeadline: Timestamp.fromMillis(now.getTime() + CONFIRM_WINDOW_MS),
      remindedAt: null,
      autoConfirmedAt: null,
      disputedBy: null,
      disputedByName: null,
      disputeReason: null,
      respondedBy: null,
      respondedByName: null,
      respondedAt: null,
      notifiedAt: renotify ? nowTs : prev?.["notifiedAt"] ?? null,
      createdAt: prev?.["createdAt"] ?? FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    const prevPlayers = Array.isArray(prev?.["playerUids"]) ? (prev!["playerUids"] as unknown[]) : [];
    return {
      version: next,
      pendingUids: pending,
      notifyUids: renotify ? pending : pending.filter((id) => !prevPlayers.includes(id)),
    };
  });

  const arenaName = str(booking["arenaName"]) || "Arena";
  const notices: ResultNotice[] = notifyUids.map((userId) => ({
    userId,
    title: "Placar para confirmar",
    body: pendingPushBody(creatorName, arenaName, dateKey),
    type: "booking_result_pending",
    bookingId: input.bookingId,
  }));
  return {result: {status: "pending", version, pendingUids}, notices};
}

export async function respondBookingResultCore(
  db: Firestore,
  uid: string,
  raw: unknown,
  now: Date = new Date(),
): Promise<{result: {status: "pending" | "confirmed" | "disputed"}; notices: ResultNotice[]}> {
  const data = (raw && typeof raw === "object" ? raw : {}) as Data;
  const bookingId = str(data["bookingId"]);
  const response = str(data["response"]) as BookingResultResponse;
  const version = data["version"];
  if (!isDocId(bookingId) || (response !== "confirm" && response !== "dispute") ||
    typeof version !== "number" || !Number.isInteger(version)) {
    throw new HttpsError("invalid-argument", "Resposta inválida.");
  }
  const reason = response === "dispute" ? parseDisputeReason(data["reason"]) : null;
  if (response === "dispute" && !reason) {
    throw new HttpsError("invalid-argument", "Conte o que está errado no placar.", {fields: ["reason"]});
  }

  const responderSnap = await db.collection("users").doc(uid).get();
  const responderName = resultPlayerName(responderSnap.exists ? responderSnap.data()! : null);
  const ref = db.collection(BOOKING_RESULTS).doc(bookingId);
  const nowTs = Timestamp.fromDate(now);

  const {doc, status} = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const current = snap.exists ? snap.data()! : null;
    const players = Array.isArray(current?.["playerUids"]) ? (current!["playerUids"] as unknown[]) : [];
    if (!current || !players.includes(uid)) {
      throw new HttpsError("not-found", "Placar não encontrado.");
    }
    const blocker = responseBlocker(current, uid, version);
    if (blocker) throw new HttpsError(blocker.code, blocker.message);
    const confirmations = confirmationsAfterResponse(
      confirmationsOf(current), uid, response, version, reason, nowTs,
    );
    const next = statusOf(confirmations);
    tx.update(ref, {
      confirmations,
      pendingUids: pendingUidsOf(confirmations),
      status: next,
      ...(response === "dispute" ? {
        disputedBy: uid,
        disputedByName: responderName,
        disputeReason: reason,
      } : {}),
      respondedBy: uid,
      respondedByName: responderName,
      respondedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    return {doc: current, status: next};
  });

  // Confirmação não avisa ninguém (o estado aparece no app); contestação avisa quem lançou.
  const notices: ResultNotice[] = [];
  const editor = str(doc["editedBy"]) || str(doc["createdBy"]);
  if (response === "dispute" && editor) {
    notices.push({
      userId: editor,
      title: "Placar contestado",
      body: disputePushBody(responderName, reason!),
      type: "booking_result_disputed",
      bookingId,
    });
  }
  return {result: {status}, notices};
}

/**
 * Uma rodada da varredura: placares pendentes com prazo nas próximas 24h. Prazo vencido confirma
 * sozinho (sem push); quem ainda não foi lembrado recebe "Falta confirmar". Cada doc numa
 * transação própria, relendo o estado — a mesma rodada pode cruzar uma edição.
 */
export async function sweepBookingResultsCore(
  db: Firestore,
  now: Date,
): Promise<{autoConfirmed: number; reminded: number; notices: ResultNotice[]}> {
  const horizon = Timestamp.fromMillis(now.getTime() + REMINDER_BEFORE_MS);
  const snap = await db.collection(BOOKING_RESULTS)
    .where("status", "==", "pending")
    .where("confirmDeadline", "<=", horizon)
    .limit(SWEEP_LIMIT)
    .get();
  const nowTs = Timestamp.fromDate(now);
  let autoConfirmed = 0;
  let reminded = 0;
  const notices: ResultNotice[] = [];

  for (const docSnap of snap.docs) {
    const ref = db.collection(BOOKING_RESULTS).doc(docSnap.id);
    const outcome = await db.runTransaction(async (tx) => {
      const fresh = await tx.get(ref);
      const current = fresh.exists ? fresh.data()! : null;
      if (!current) return null;
      const action = sweepAction(current, now.getTime());
      if (action === "auto_confirm") {
        const confirmations = autoConfirmedConfirmations(confirmationsOf(current), nowTs);
        tx.update(ref, {
          confirmations,
          pendingUids: [],
          status: "confirmed",
          autoConfirmedAt: nowTs,
          updatedAt: FieldValue.serverTimestamp(),
        });
        return {action, doc: current, pending: [] as string[]};
      }
      if (action === "remind") {
        tx.update(ref, {remindedAt: nowTs});
        return {action, doc: current, pending: pendingUidsOf(confirmationsOf(current))};
      }
      return null;
    });
    if (outcome?.action === "auto_confirm") autoConfirmed++;
    if (outcome?.action === "remind") {
      reminded++;
      const body = reminderPushBody(str(outcome.doc["arenaName"]) || "Arena", str(outcome.doc["dateKey"]));
      for (const userId of outcome.pending) {
        notices.push({
          userId,
          title: "Placar para confirmar",
          body,
          type: "booking_result_reminder",
          bookingId: docSnap.id,
        });
      }
    }
  }
  return {autoConfirmed, reminded, notices};
}

async function deliverNotices(notices: ResultNotice[]): Promise<void> {
  await Promise.all(notices.map(async (n) => {
    try {
      // Sem `url`: o app da loja de antes desta tela cai em Minhas reservas pelo `bookingId`; o
      // app novo abre o detalhe da pelada pelo tipo.
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

export const sweepBookingResults = onSchedule(
  {
    schedule: "every 30 minutes",
    timeZone: EVENT_TIME_ZONE,
    secrets: [WEB_PUSH_PUBLIC_KEY, WEB_PUSH_PRIVATE_KEY, WEB_PUSH_SUBJECT],
  },
  async () => {
    const {autoConfirmed, reminded, notices} = await sweepBookingResultsCore(getFirestore(), new Date());
    await deliverNotices(notices);
    logger.info("sweepBookingResults", {autoConfirmed, reminded, notices: notices.length});
  },
);
