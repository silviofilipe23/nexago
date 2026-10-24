/**
 * Portão dos avisos do Centro de Treinamento: todo push do centro passa por `deliverCenterNotice`,
 * que aplica as preferências de Configurações › Notificações (evento ligado/desligado e horário de
 * silêncio). No silêncio, o aviso vai para `trainingCenters/{c}/notificationOutbox` e sai quando o
 * silêncio acaba (ou é descartado, no caso do lembrete de aula).
 *
 * Agendador (15 min, `runTrainingCenterNotifications`), por centro ativo:
 * - manda os avisos adiados que venceram;
 * - lembrete de aula N minutos antes (alunos da turma + encaixados com "avisos de aula" ligado);
 * - chamada não finalizada 30 min depois do fim da aula → professor.
 * Cada aviso reserva `notificationLog/{id}` antes de sair: rodar de novo não repete.
 *
 * Também: recibo de pagamento confirmado (gatilho da cobrança) e "enviar teste para mim".
 */
import * as logger from "firebase-functions/logger";
import {HttpsError, onCall, type CallableRequest} from "firebase-functions/v2/https";
import {onDocumentWritten} from "firebase-functions/v2/firestore";
import {onSchedule} from "firebase-functions/v2/scheduler";
import {Timestamp, getFirestore, type DocumentReference, type Firestore} from "firebase-admin/firestore";
import {CLIENT_FACING_REGIONS} from "./function-regions";
import {deliverNotificationToUser, WEB_PUSH_PRIVATE_KEY, WEB_PUSH_PUBLIC_KEY, WEB_PUSH_SUBJECT} from "./notification-delivery";
import {TRAINING_CENTERS, brlFromCents, canManageCenterBilling} from "./training-center-billing-model";
import {
  NOTIFICATION_EVENTS,
  decide,
  readNotificationSettings,
  sessionEndMinutes,
  timeToMinutes,
  wallTime,
  type NotificationEventKey,
} from "./training-center-notification-settings-model";
import {dayLabel, sessionAudience, studentPushUid} from "./training-center-notifications-model";
import {addDays} from "./training-center-subscription-model";
import {dayKeyIn} from "./training-center-waitlist-model";

type Data = Record<string, unknown>;

export interface PushInput {
  userId: string;
  title: string;
  body: string;
  type: string;
  data: Record<string, string>;
}

export interface NotifyDeps {
  now: () => Date;
  notify: (input: PushInput) => Promise<void>;
}

export const defaultNotifyDeps: NotifyDeps = {
  now: () => new Date(),
  notify: async (input) => {
    await deliverNotificationToUser({...input, requireInteraction: false});
  },
};

export const CENTER_CLASS_REMINDER_TYPE = "training_center_class_reminder";
export const CENTER_ATTENDANCE_PENDING_TYPE = "training_center_attendance_pending";
export const CENTER_PAYMENT_CONFIRMED_TYPE = "training_center_payment_confirmed";
export const CENTER_STAFF_ALERT_TYPE = "training_center_staff_alert";
export const CENTER_TEST_NOTICE_TYPE = "training_center_test";
/** Aluno avisou pelo app que não vai (`respondTrainingCenterSession`) → professor da aula. */
export const CENTER_STUDENT_ABSENCE_TYPE = "training_center_student_absence";

/** Depois do fim da aula, quanto esperar para cobrar a chamada do professor. */
const ATTENDANCE_GRACE_MIN = 30;

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

const centerRef = (db: Firestore, centerId: string) => db.collection(TRAINING_CENTERS).doc(centerId);

export interface DeliverResult {
  sent: number;
  deferred: number;
  skipped: string | null;
}

/**
 * Manda (ou adia, ou descarta) um aviso do centro para `uids`, conforme as preferências.
 * `center` evita reler o doc quando quem chama já tem.
 */
export async function deliverCenterNotice(
  db: Firestore,
  deps: NotifyDeps,
  input: {centerId: string; center?: Data; event: NotificationEventKey; uids: string[]; title: string; body: string; type: string; data: Record<string, string>},
): Promise<DeliverResult> {
  const uids = [...new Set(input.uids.filter(Boolean))];
  if (uids.length === 0) return {sent: 0, deferred: 0, skipped: "no_recipient"};
  const center = input.center ?? (await centerRef(db, input.centerId).get()).data() ?? {};
  const settings = readNotificationSettings(center["notifications"]);
  const now = deps.now();
  const d = decide(input.event, settings, wallTime(now, str(center["timezone"])));
  if (d.action === "skip") return {sent: 0, deferred: 0, skipped: d.reason};
  if (d.action === "defer") {
    const sendAt = Timestamp.fromMillis(now.getTime() + d.minutes * 60_000);
    const outbox = centerRef(db, input.centerId).collection("notificationOutbox");
    for (const userId of uids) {
      await outbox.add({
        userId, title: input.title, body: input.body, type: input.type, data: input.data,
        event: input.event, sendAt, createdAt: Timestamp.fromDate(now),
      });
    }
    return {sent: 0, deferred: uids.length, skipped: null};
  }
  let sent = 0;
  for (const userId of uids) {
    try {
      await deps.notify({userId, title: input.title, body: input.body, type: input.type, data: input.data});
      sent++;
    } catch (e) {
      logger.warn("training-center notice: push falhou", {userId, type: input.type, e});
    }
  }
  return {sent, deferred: 0, skipped: null};
}

/** Reserva o aviso; `false` = já saiu (rodada ou gatilho repetido). */
export async function claimNotice(db: Firestore, centerId: string, id: string, kind: string, now: Date): Promise<boolean> {
  try {
    await centerRef(db, centerId).collection("notificationLog").doc(id).create({kind, at: Timestamp.fromDate(now)});
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Agendador
// ---------------------------------------------------------------------------

async function flushOutbox(db: Firestore, ref: DocumentReference, deps: NotifyDeps): Promise<number> {
  const due = await ref.collection("notificationOutbox").where("sendAt", "<=", Timestamp.fromDate(deps.now())).limit(300).get();
  let sent = 0;
  for (const doc of due.docs) {
    const d = doc.data();
    try {
      await deps.notify({userId: str(d["userId"]), title: str(d["title"]), body: str(d["body"]), type: str(d["type"]), data: (d["data"] ?? {}) as Record<string, string>});
      sent++;
    } catch (e) {
      logger.warn(`training-center outbox ${doc.ref.path}: push falhou`, e);
    }
    // Sai da fila mesmo se falhar: push perdido não deve repetir a cada 15 min para sempre.
    await doc.ref.delete();
  }
  return sent;
}

export interface NotificationRunResult {
  flushed: number;
  reminders: number;
  attendance: number;
}

export async function runCenterNotifications(db: Firestore, centerId: string, center: Data, deps: NotifyDeps): Promise<NotificationRunResult> {
  const ref = centerRef(db, centerId);
  const now = deps.now();
  const tz = str(center["timezone"]);
  const today = dayKeyIn(now, tz);
  const nowMin = timeToMinutes(wallTime(now, tz));
  const settings = readNotificationSettings(center["notifications"]);
  const result: NotificationRunResult = {flushed: await flushOutbox(db, ref, deps), reminders: 0, attendance: 0};
  const centerName = str(center["name"]);

  const sessions = await ref.collection("sessions").where("date", ">=", addDays(today, -1)).where("date", "<=", today).get();
  for (const doc of sessions.docs) {
    const s = doc.data();
    if (s["status"] !== "scheduled") continue;
    const date = str(s["date"]);
    const start = str(s["startTime"]);
    if (!start) continue;
    // Minutos de agora até o início / desde o fim, contando a virada do dia (aula de ontem).
    const offset = date === today ? 0 : -1440;
    const untilStart = timeToMinutes(start) + offset - nowMin;
    const sinceEnd = nowMin - (sessionEndMinutes(start, Number(s["durationMin"] ?? 60)) + offset);
    const place = str(s["locationName"]);

    if (date === today && untilStart > 0 && untilStart <= settings.reminderLeadMin) {
      if (await claimNotice(db, centerId, `reminder_${doc.id}`, "class_reminder", now)) {
        const cls = (await ref.collection("classes").doc(str(s["classId"])).get()).data();
        const students = await Promise.all(sessionAudience(cls, s).map((id) => ref.collection("students").doc(id).get()));
        const uids = students.map((x) => studentPushUid(x.data())).filter((x): x is string => !!x);
        const r = await deliverCenterNotice(db, deps, {
          centerId, center, event: "class_reminder", uids,
          title: `Aula hoje às ${start} · ${str(s["className"])}`,
          body: [place ? `Local: ${place}` : "", str(s["locationAddress"]), centerName].filter(Boolean).join(" · "),
          type: CENTER_CLASS_REMINDER_TYPE, data: {centerId, sessionId: doc.id},
        });
        result.reminders += r.sent;
      }
    }

    if (sinceEnd >= ATTENDANCE_GRACE_MIN && !s["finalizedAt"] && str(s["coachUid"])) {
      if (await claimNotice(db, centerId, `attendance_${doc.id}`, "attendance_pending", now)) {
        const r = await deliverCenterNotice(db, deps, {
          centerId, center, event: "attendance_pending", uids: [str(s["coachUid"])],
          title: "Chamada não finalizada",
          body: `${str(s["className"])} · ${dayLabel(date)} ${start}. Registre a presença para os créditos e reposições saírem certos.`,
          type: CENTER_ATTENDANCE_PENDING_TYPE, data: {centerId, sessionId: doc.id},
        });
        result.attendance += r.sent + r.deferred;
      }
    }
  }
  return result;
}

export async function runTrainingCenterNotificationsCore(db: Firestore, deps: NotifyDeps = defaultNotifyDeps): Promise<number> {
  const centers = await db.collection(TRAINING_CENTERS).where("status", "==", "active").get();
  let total = 0;
  for (const doc of centers.docs) {
    try {
      const r = await runCenterNotifications(db, doc.id, doc.data(), deps);
      total += r.flushed + r.reminders + r.attendance;
    } catch (e) {
      logger.error(`runTrainingCenterNotifications ${doc.id} falhou`, e);
    }
  }
  return total;
}

const PUSH_SECRETS = [WEB_PUSH_PUBLIC_KEY, WEB_PUSH_PRIVATE_KEY, WEB_PUSH_SUBJECT];

export const runTrainingCenterNotifications = onSchedule({
  schedule: "every 15 minutes",
  timeZone: "America/Sao_Paulo",
  secrets: PUSH_SECRETS,
}, async () => {
  await runTrainingCenterNotificationsCore(getFirestore());
});

// ---------------------------------------------------------------------------
// Recibo: cobrança aprovada → pagador
// ---------------------------------------------------------------------------

export async function handlePaymentConfirmed(
  db: Firestore, deps: NotifyDeps, centerId: string, invoiceId: string, eventId: string, before: Data | undefined, after: Data | undefined,
): Promise<number> {
  if (!after || after["status"] !== "approved" || before?.["status"] !== "pending") return 0;
  const studentId = str(after["studentId"]);
  const student = studentId ? (await centerRef(db, centerId).collection("students").doc(studentId).get()).data() : undefined;
  const uid = str(student?.["uid"]);
  if (!uid) return 0;
  if (!(await claimNotice(db, centerId, eventId, "payment_confirmed", deps.now()))) return 0;
  const center = (await centerRef(db, centerId).get()).data() ?? {};
  const r = await deliverCenterNotice(db, deps, {
    centerId, center, event: "payment_confirmed", uids: [uid],
    title: `Pagamento confirmado · ${brlFromCents(Number(after["amountCents"] ?? 0))}`,
    body: `${str(after["reference"]) || "Cobrança"} · ${str(center["name"])}. Obrigado!`,
    type: CENTER_PAYMENT_CONFIRMED_TYPE, data: {centerId, invoiceId},
  });
  return r.sent + r.deferred;
}

export const onTrainingCenterPaymentNotice = onDocumentWritten({
  document: `${TRAINING_CENTERS}/{centerId}/invoices/{invoiceId}`,
  secrets: PUSH_SECRETS,
}, async (event) => {
  await handlePaymentConfirmed(getFirestore(), defaultNotifyDeps, event.params.centerId, event.params.invoiceId, event.id,
    event.data?.before?.data(), event.data?.after?.data());
});

// ---------------------------------------------------------------------------
// Equipe: pagamentos sem confirmação do provedor
// ---------------------------------------------------------------------------

/** Owner e admin ativos (quem recebe os alertas da equipe). */
export async function managerUids(db: Firestore, centerId: string): Promise<string[]> {
  const snap = await centerRef(db, centerId).collection("centerMembers").where("status", "==", "active").get();
  return snap.docs.filter((d) => canManageCenterBilling(d.data())).map((d) => str(d.data()["uid"]) || d.id);
}

/** Um push por centro com as cobranças online que seguem sem confirmação depois de 2h. */
export async function alertStaffPendingPayments(db: Firestore, deps: NotifyDeps, centerId: string, invoices: {payerName: string; amountCents: number}[]): Promise<number> {
  if (invoices.length === 0) return 0;
  const total = invoices.reduce((t, i) => t + i.amountCents, 0);
  const names = invoices.slice(0, 3).map((i) => i.payerName).filter(Boolean).join(", ");
  const r = await deliverCenterNotice(db, deps, {
    centerId, event: "staff_pending_payments", uids: await managerUids(db, centerId),
    title: invoices.length === 1 ? "Pagamento sem confirmação há mais de 2h" : `${invoices.length} pagamentos sem confirmação há mais de 2h`,
    body: `${brlFromCents(total)} aguardando o provedor${names ? ` · ${names}${invoices.length > 3 ? "…" : ""}` : ""}. Confira no Financeiro.`,
    type: CENTER_STAFF_ALERT_TYPE, data: {centerId},
  });
  return r.sent + r.deferred;
}

// ---------------------------------------------------------------------------
// Enviar teste para mim
// ---------------------------------------------------------------------------

export const SAMPLE_NOTICES: Record<NotificationEventKey, {title: string; body: string}> = {
  class_reminder: {title: "Aula hoje às 19:00 · BT Intermediário B", body: "Local: Sede · Av. da Praia, 100"},
  session_cancelled: {title: "Aula cancelada · BT Intermediário B", body: "Qui 23 out 19:00 · chuva forte. Você ganhou 1 reposição."},
  session_changed: {title: "Local alterado · BT Intermediário B", body: "Qui 23 out 19:00 · novo local: Arena Pepê."},
  attendance_pending: {title: "Chamada não finalizada", body: "BT Intermediário B · Qui 23 out 19:00. Registre a presença."},
  student_absence: {title: "Caio Ramos não vai à aula", body: "BT Intermediário B · Qui 23 out 19:00 · avisou no prazo, vira reposição."},
  seat_offered: {title: "Abriu uma vaga para você", body: "BT Intermediário B · você tem 24h para confirmar."},
  enrollment_confirmed: {title: "Matrícula confirmada", body: "BT Intermediário B · bons treinos!"},
  makeup_expiring: {title: "Reposição vencendo", body: "Sua reposição vence em 3 dias."},
  billing_reminder: {title: "Mensalidade de novembro · R$ 320,00", body: "A mensalidade vence em 3 dias. Toque para pagar com Pix ou cartão."},
  billing_overdue: {title: "Mensalidade de novembro em aberto", body: "Ainda não identificamos o pagamento de R$ 320,00. Toque para pagar."},
  payment_confirmed: {title: "Pagamento confirmado · R$ 320,00", body: "Mensal 2x · nov. Obrigado!"},
  billing_block_warning: {title: "Check-in vai ser bloqueado", body: "A mensalidade de novembro segue em aberto. O check-in bloqueia em 25/11."},
  staff_pending_payments: {title: "2 pagamentos sem confirmação há mais de 2h", body: "R$ 640,00 aguardando o provedor. Confira no Financeiro."},
  enrollment_request: {title: "Carla Dias pediu pausa por lesão", body: "BT Feminino Manhã · 24/10 a 22/11 (30 dias) · revise o atestado"},
  enrollment_request_answered: {title: "Pausa por lesão aprovada", body: "BT Feminino Manhã pausada a partir de 24/10. Sua vaga fica reservada."},
  daily_summary: {title: "Resumo do dia", body: "12 aulas hoje · 3 cobranças pendentes · R$ 960 recebidos ontem."},
};

export async function sendTestNoticeCore(db: Firestore, deps: NotifyDeps, uid: string | undefined, raw: unknown): Promise<{sent: boolean}> {
  if (!uid) throw new HttpsError("unauthenticated", "Entre de novo.");
  const d = (raw && typeof raw === "object" ? raw : {}) as Data;
  const centerId = str(d["centerId"]);
  const event = str(d["event"]) as NotificationEventKey;
  if (!centerId || centerId.includes("/") || !(event in NOTIFICATION_EVENTS)) throw new HttpsError("invalid-argument", "Aviso inválido.");
  const member = (await centerRef(db, centerId).collection("centerMembers").doc(uid).get()).data();
  if (!canManageCenterBilling(member)) throw new HttpsError("permission-denied", "Só owner ou admin do centro envia teste.");
  const center = (await centerRef(db, centerId).get()).data() ?? {};
  const sample = SAMPLE_NOTICES[event];
  try {
    await deps.notify({
      userId: uid, title: `[Teste] ${sample.title}`, body: `${str(center["name"])} via NexaGO · ${sample.body}`,
      type: CENTER_TEST_NOTICE_TYPE, data: {centerId},
    });
  } catch (e) {
    logger.warn("sendTrainingCenterTestNotification falhou", e);
    return {sent: false};
  }
  return {sent: true};
}

export const sendTrainingCenterTestNotification = onCall({region: CLIENT_FACING_REGIONS, secrets: PUSH_SECRETS},
  async (request: CallableRequest) => sendTestNoticeCore(getFirestore(), defaultNotifyDeps, request.auth?.uid, request.data));
