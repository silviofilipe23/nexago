/**
 * Pedido de remarcação pelo chat (canvas D3): o aluno (ou o professor) propõe outro horário para uma
 * PARTICULAR (`professorPrivateLessons`, fase 10); o outro lado aceita ou sugere outro.
 *
 * - O pedido fica na aula (`reschedule: {requestedBy, startAt, endAt, status, messageId}`) e aparece
 *   na conversa direta como um cartão (`messages/{id}.card`, gravado só pelo servidor).
 * - Só horário LIVRE do professor (a mesma conta da disponibilidade, ignorando a própria aula); ao
 *   aceitar, a checagem roda de novo dentro da transação — dois pedidos não ocupam o mesmo horário.
 * - "Sugerir outro" = um novo pedido do outro lado, que substitui o pendente.
 * Aula com reserva de quadra fica de fora: mover a reserva mexe na grade da arena.
 */
import * as logger from "firebase-functions/logger";
import {onCall, HttpsError, type CallableRequest} from "firebase-functions/v2/https";
import {FieldValue, getFirestore, Timestamp, type Firestore} from "firebase-admin/firestore";
import {dayKeyFromEventDate, eventTimeLabel} from "./event-timezone";
import {CLIENT_FACING_REGIONS} from "./function-regions";
import {deliverNotificationToUser, WEB_PUSH_PRIVATE_KEY, WEB_PUSH_PUBLIC_KEY, WEB_PUSH_SUBJECT} from "./notification-delivery";
import {
  PROFESSOR_AVAILABILITY,
  PROFESSOR_PRIVATE_LESSONS,
  computeOpenSlots,
  loadBusy,
  storedAvailability,
} from "./professor-availability";
import {CONVERSATIONS, CONVERSATION_MESSAGES, MESSAGE_PUSH_TYPE, isStudentOfProfessor, upsertDirect} from "./professor-messages";

export const RESCHEDULE_CARD = "reschedule";

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function cleanId(v: unknown, message: string): string {
  const id = str(v);
  if (!id || id.includes("/")) throw new HttpsError("invalid-argument", message);
  return id;
}

const label = (d: Date) => {
  const day = dayKeyFromEventDate(d);
  const wd = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"][new Date(`${day}T12:00:00Z`).getUTCDay()];
  return `${wd} ${day.slice(8, 10)}/${day.slice(5, 7)} · ${eventTimeLabel(d)}`;
};

export interface RescheduleDeps {
  now: () => Date;
  notify: (input: {userId: string; title: string; body: string; type: string; data: Record<string, string>}) => Promise<void>;
}

const defaultDeps: RescheduleDeps = {
  now: () => new Date(),
  notify: async (input) => {
    await deliverNotificationToUser({...input, requireInteraction: false, skipHistory: true});
  },
};

/** Grava o cartão na conversa direta (resumo + não lida para o outro lado) e devolve o id. */
async function postCard(
  db: Firestore, professorUid: string, athleteId: string, senderUid: string, card: Record<string, unknown>, text: string, now: Date,
): Promise<{conversationId: string; messageId: string}> {
  const conversationId = await upsertDirect(db, professorUid, athleteId);
  const ref = db.collection(CONVERSATIONS).doc(conversationId);
  const msgRef = ref.collection(CONVERSATION_MESSAGES).doc();
  const other = senderUid === professorUid ? athleteId : professorUid;
  await db.runTransaction(async (tx) => {
    const c = (await tx.get(ref)).data() ?? {};
    const senderName = (c["memberNames"] as Record<string, string> | undefined)?.[senderUid] || "Atleta";
    tx.create(msgRef, {senderUid, senderName, text, card, createdAt: Timestamp.fromDate(now)});
    tx.update(ref, {
      lastMessage: {text, senderUid, senderName, messageId: msgRef.id},
      lastAt: Timestamp.fromDate(now),
      [`unread.${other}`]: FieldValue.increment(1),
    });
  });
  return {conversationId, messageId: msgRef.id};
}

async function notifyOther(deps: RescheduleDeps, userId: string, professorUid: string, conversationId: string, title: string, body: string) {
  try {
    await deps.notify({
      userId, title, body, type: MESSAGE_PUSH_TYPE,
      data: {conversationId, url: userId === professorUid ? `/professor/mensagens/${conversationId}` : `/mensagens/${conversationId}`},
    });
  } catch (e) {
    logger.warn(`remarcação: push para ${userId} falhou`, e);
  }
}

/** Aluno ou professor propõe outro horário (substitui um pedido pendente). */
export async function requestLessonRescheduleCore(
  db: Firestore, uid: string, raw: Record<string, unknown>, deps: RescheduleDeps = defaultDeps,
): Promise<{messageId: string; conversationId: string}> {
  const lessonId = cleanId(raw["lessonId"], "Aula inválida.");
  const startAt = new Date(str(raw["startAt"]));
  if (Number.isNaN(startAt.getTime())) throw new HttpsError("invalid-argument", "Horário inválido.");
  const now = deps.now();
  const ref = db.collection(PROFESSOR_PRIVATE_LESSONS).doc(lessonId);
  const lesson = (await ref.get()).data();
  if (!lesson || (lesson["professorUid"] !== uid && lesson["athleteId"] !== uid)) throw new HttpsError("not-found", "Aula não encontrada.");
  if (!["pending", "confirmed"].includes(str(lesson["status"]))) throw new HttpsError("failed-precondition", "Esta aula não está ativa.");
  const currentStart = (lesson["startAt"] as Timestamp).toDate();
  if (currentStart.getTime() <= now.getTime()) throw new HttpsError("failed-precondition", "A aula já começou.");
  if (startAt.getTime() === currentStart.getTime()) throw new HttpsError("invalid-argument", "Escolha um horário diferente do atual.");
  const professorUid = str(lesson["professorUid"]);
  const athleteId = str(lesson["athleteId"]);
  // Vínculo acabou: o chat foi fechado e não reabre por aqui.
  if (!(await isStudentOfProfessor(db, professorUid, athleteId, now))) {
    throw new HttpsError("failed-precondition", "O vínculo de aula acabou: cancele a particular em vez de remarcar.");
  }
  const availability = storedAvailability((await db.collection(PROFESSOR_AVAILABILITY).doc(professorUid).get()).data());
  if (!availability) throw new HttpsError("failed-precondition", "O professor não tem horários publicados.");
  const day = dayKeyFromEventDate(startAt);
  const busy = await loadBusy(db, professorUid, [day], undefined, lessonId);
  // A antecedência mínima vale para o pedido do aluno; o professor pode propor em cima da hora.
  const slots = computeOpenSlots(availability, [day], busy, uid === professorUid ? now.getTime() - availability.minNoticeHours * 3600_000 : now.getTime());
  const slot = slots.find((s) => s.start === startAt.getTime());
  if (!slot) throw new HttpsError("failed-precondition", "Este horário não está livre. Escolha outro.");

  const previous = lesson["reschedule"] as Record<string, unknown> | undefined;
  const fromLabel = label(currentStart);
  const toLabel = label(startAt);
  const card = {
    type: RESCHEDULE_CARD, lessonId, status: "pending", requestedBy: uid,
    fromStartAt: Timestamp.fromDate(currentStart), toStartAt: Timestamp.fromDate(new Date(slot.start)),
    toEndAt: Timestamp.fromDate(new Date(slot.end)),
  };
  const {conversationId, messageId} = await postCard(db, professorUid, athleteId, uid, card, `Pedido de remarcação: ${toLabel}`, now);
  // Pedido anterior ainda pendente vira "substituído" no cartão dele.
  if (previous?.["status"] === "pending" && str(previous["messageId"])) {
    await db.collection(CONVERSATIONS).doc(conversationId).collection(CONVERSATION_MESSAGES).doc(str(previous["messageId"]))
      .update({"card.status": "replaced"}).catch(() => undefined);
  }
  await ref.update({
    reschedule: {
      requestedBy: uid, startAt: Timestamp.fromDate(new Date(slot.start)), endAt: Timestamp.fromDate(new Date(slot.end)),
      status: "pending", messageId, conversationId, createdAt: Timestamp.fromDate(now),
    },
  });
  const other = uid === professorUid ? athleteId : professorUid;
  const who = uid === professorUid ? str(lesson["professorName"]) || "Seu professor" : str(lesson["athleteName"]) || "Seu aluno";
  await notifyOther(deps, other, professorUid, conversationId, `Remarcar particular · ${who}`, `${fromLabel} → ${toLabel}`);
  return {messageId, conversationId};
}

/** O outro lado aceita (a aula muda de horário) ou recusa o pedido pendente. */
export async function respondLessonRescheduleCore(
  db: Firestore, uid: string, raw: Record<string, unknown>, deps: RescheduleDeps = defaultDeps,
): Promise<{status: "accepted" | "declined"}> {
  const lessonId = cleanId(raw["lessonId"], "Aula inválida.");
  const accept = raw["accept"] === true;
  const now = deps.now();
  const ref = db.collection(PROFESSOR_PRIVATE_LESSONS).doc(lessonId);
  const pre = (await ref.get()).data();
  if (!pre || (pre["professorUid"] !== uid && pre["athleteId"] !== uid)) throw new HttpsError("not-found", "Aula não encontrada.");
  const professorUid = str(pre["professorUid"]);
  const availability = storedAvailability((await db.collection(PROFESSOR_AVAILABILITY).doc(professorUid).get()).data());
  const result = await db.runTransaction(async (tx) => {
    const lesson = (await tx.get(ref)).data() ?? {};
    const r = lesson["reschedule"] as Record<string, unknown> | undefined;
    if (!r || r["status"] !== "pending") throw new HttpsError("failed-precondition", "Não há pedido de remarcação pendente.");
    if (r["requestedBy"] === uid) throw new HttpsError("failed-precondition", "Quem pediu não responde o próprio pedido.");
    if (!["pending", "confirmed"].includes(str(lesson["status"]))) throw new HttpsError("failed-precondition", "Esta aula não está ativa.");
    const to = (r["startAt"] as Timestamp).toDate();
    const toEnd = (r["endAt"] as Timestamp).toDate();
    if (accept) {
      if (to.getTime() <= now.getTime()) throw new HttpsError("failed-precondition", "O novo horário já passou.");
      const day = dayKeyFromEventDate(to);
      // Mesma conta de ocupação, dentro da transação, sem a própria aula.
      const busy = await loadBusy(db, professorUid, [day], tx, lessonId);
      const ok = availability ? busy.every((b) => !(b.start < toEnd.getTime() && to.getTime() < b.end)) : false;
      if (!ok) throw new HttpsError("failed-precondition", "O horário pedido não está mais livre. Sugira outro.");
      tx.update(ref, {
        startAt: Timestamp.fromDate(to), endAt: Timestamp.fromDate(toEnd), date: day,
        "reschedule.status": "accepted", "reschedule.respondedAt": Timestamp.fromDate(now),
        previousStartAt: lesson["startAt"],
      });
    } else {
      tx.update(ref, {"reschedule.status": "declined", "reschedule.respondedAt": Timestamp.fromDate(now)});
    }
    return {lesson, r, to};
  });
  const {lesson, r, to} = result;
  const conversationId = str(r["conversationId"]);
  const status = accept ? "accepted" : "declined";
  if (conversationId && str(r["messageId"])) {
    await db.collection(CONVERSATIONS).doc(conversationId).collection(CONVERSATION_MESSAGES).doc(str(r["messageId"]))
      .update({"card.status": status, "card.respondedBy": uid}).catch(() => undefined);
  }
  const requester = str(r["requestedBy"]);
  await notifyOther(deps, requester, professorUid, conversationId,
    accept ? "Remarcação aceita" : "Remarcação recusada",
    accept ? `Particular agora em ${label(to)}.` : `O horário continua ${label((lesson["startAt"] as Timestamp).toDate())}.`);
  return {status};
}

// ---------------------------------------------------------------------------

function requireUid(r: CallableRequest): string {
  const uid = r.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Faça login para continuar.");
  return uid;
}

const dataOf = (r: CallableRequest) => (r.data ?? {}) as Record<string, unknown>;
const OPTS = {region: CLIENT_FACING_REGIONS, timeoutSeconds: 60, secrets: [WEB_PUSH_PUBLIC_KEY, WEB_PUSH_PRIVATE_KEY, WEB_PUSH_SUBJECT]};

export const requestLessonReschedule = onCall(OPTS, async (r) =>
  requestLessonRescheduleCore(getFirestore(), requireUid(r), dataOf(r)));

export const respondLessonReschedule = onCall(OPTS, async (r) =>
  respondLessonRescheduleCore(getFirestore(), requireUid(r), dataOf(r)));
