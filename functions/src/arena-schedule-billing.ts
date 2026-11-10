/**
 * Planos de horário — mensalidades (baixa manual; a cobrança online fica em `arena-schedule-asaas.ts`),
 * atraso e o agendador diário.
 *
 * As mensalidades nascem 10 dias antes do vencimento (mesma régua das Aulas), uma por pagador do
 * rateio. Atraso além de `overdueReleaseDays` suspende a assinatura e libera a agenda; dar baixa
 * que zera as atrasadas reativa sozinho.
 */

import {onCall, HttpsError} from "firebase-functions/v2/https";
import {onSchedule} from "firebase-functions/v2/scheduler";
import {getFirestore, FieldValue, type Firestore, type Transaction} from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";
import {dayKeyFromEventDate} from "./event-timezone";
import {ARENA_RECURRING_BOOKINGS, addDaysToDateKey, isValidDateKey} from "./arena-recurring-booking";
import {dueDateFor, monthLabelPt, monthsToBill} from "./arena-class-billing";
import {monthKeyOf} from "./arena-class-ledger";
import {CLIENT_FACING_REGIONS} from "./function-regions";
import {
  ARENA_SCHEDULE_CHARGES,
  ARENA_SCHEDULE_CREDITS,
  ARENA_SCHEDULE_SUBSCRIPTIONS,
  AUTOPAY_WINDOW_STATES,
  LIVE_SUBSCRIPTION_STATUSES,
  SCHEDULE_PAYMENT_METHODS,
  autopayOf,
  daysBetween,
  str,
  type AutopayState,
} from "./arena-schedule-plan-constants";
import {notifyScheduleSafe, requireScheduleManager, requireUid, rethrowSchedule} from "./arena-schedule-plans";
import {
  buildPayerCharges,
  finalizeSubscriptionEndCore,
  canWriteCharge,
  materializeSubscriptionSeries,
  pendingRelease,
  releaseSubscriptionSeries,
  resumeSubscriptionCore,
  seriesIdsOf,
  subChargeOwner,
} from "./arena-schedule-subscriptions";

type Data = Record<string, unknown>;

/** Lembretes do atraso por push: no vencimento, +1 e +3 dias. */
export const REMINDER_OFFSETS = [0, 1, 3] as const;

export function overdueReleaseDaysOf(sub: Data): number {
  const snap = (sub["planSnapshot"] ?? {}) as Data;
  const days = Number(snap["overdueReleaseDays"] ?? 3);
  return Number.isFinite(days) && days > 0 ? days : 3;
}

/**
 * Mensalidade na janela do débito automático (`scheduled`/`retry`/`charging`): o cartão ainda será
 * (ou está sendo) debitado, então a régua de atraso espera. `failed`/`skipped` voltam à régua normal.
 */
export function inAutopayWindow(charge: Data): boolean {
  return AUTOPAY_WINDOW_STATES.has(str(autopayOf(charge)["state"]) as AutopayState);
}

/** Mensalidade aberta que já passou do prazo de liberação do horário. */
export function isPastRelease(charge: Data, releaseDays: number, todayKey: string): boolean {
  if (charge["status"] !== "open" || inAutopayWindow(charge)) return false;
  const due = str(charge["dueDate"]);
  return !!due && addDaysToDateKey(due, releaseDays) <= todayKey;
}

/** Próximo lembrete devido (o maior marco já alcançado e ainda não enviado), ou null. */
export function dueReminder(charge: Data, todayKey: string): number | null {
  if (charge["status"] !== "open" || inAutopayWindow(charge)) return null;
  const due = str(charge["dueDate"]);
  if (!due || due > todayKey) return null;
  const late = daysBetween(due, todayKey);
  const sent = new Set(Array.isArray(charge["remindersSent"]) ? (charge["remindersSent"] as unknown[]).map(Number) : []);
  const reached = REMINDER_OFFSETS.filter((o) => o <= late);
  const last = reached[reached.length - 1];
  return last != null && !sent.has(last) ? last : null;
}

/** Link vivo da fatura online (espelho `asaas` aberto), ou "" — o lembrete manda pagar por ele. */
export function onlineInvoiceUrlOf(charge: Data): string {
  const asaas = (charge["asaas"] ?? {}) as Data;
  return charge["billingMode"] === "asaas" && asaas["state"] === "open" ? str(asaas["invoiceUrl"]) : "";
}

// ---------------------------------------------------------------------------
// Suspender / reativar
// ---------------------------------------------------------------------------

export async function suspendForOverdueCore(db: Firestore, subscriptionId: string): Promise<boolean> {
  const ref = db.collection(ARENA_SCHEDULE_SUBSCRIPTIONS).doc(subscriptionId);
  const sub = await db.runTransaction(async (tx: Transaction) => {
    const snap = await tx.get(ref);
    const data = (snap.data() ?? {}) as Data;
    if (data["status"] !== "active") return null;
    for (const seriesId of seriesIdsOf(data)) {
      tx.set(db.collection(ARENA_RECURRING_BOOKINGS).doc(seriesId), {status: "paused", pausedAt: FieldValue.serverTimestamp()}, {merge: true});
    }
    tx.set(ref, {
      status: "suspended", suspendedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
      ...pendingRelease(seriesIdsOf(data), "schedule_subscription_overdue"),
    }, {merge: true});
    return data;
  });
  if (!sub) return false;
  await releaseSubscriptionSeries(db, seriesIdsOf(sub), "schedule_subscription_overdue", subscriptionId);
  await notifyScheduleSafe(str(sub["holderAthleteId"]), {
    title: "Plano suspenso por atraso",
    body: `Seus horários do plano ${str(sub["planName"])} em ${str(sub["arenaName"]) || "Arena"} foram liberados ` +
      "por mensalidade em atraso. Acertando com a arena, eles voltam.",
    type: "schedule_plan_suspended",
    data: {subscriptionId, arenaId: str(sub["arenaId"])},
  });
  return true;
}

/** Suspensa e sem nenhuma mensalidade além do prazo → volta a ativa e rematerializa. */
export async function reactivateIfClearCore(
  db: Firestore,
  subscriptionId: string,
  todayKey: string,
  nowMs: number = Date.now(),
): Promise<boolean> {
  const ref = db.collection(ARENA_SCHEDULE_SUBSCRIPTIONS).doc(subscriptionId);
  const sub = await db.runTransaction(async (tx: Transaction) => {
    const snap = await tx.get(ref);
    const data = (snap.data() ?? {}) as Data;
    if (data["status"] !== "suspended") return null;
    const charges = await tx.get(db.collection(ARENA_SCHEDULE_CHARGES).where("subscriptionId", "==", subscriptionId));
    const releaseDays = overdueReleaseDaysOf(data);
    if (charges.docs.some((c) => isPastRelease(c.data() as Data, releaseDays, todayKey))) return null;
    for (const seriesId of seriesIdsOf(data)) {
      tx.set(db.collection(ARENA_RECURRING_BOOKINGS).doc(seriesId), {status: "active", pausedAt: null}, {merge: true});
    }
    tx.set(ref, {
      status: "active", suspendedAt: null, releasePending: false, pendingReleaseSeriesIds: [],
      updatedAt: FieldValue.serverTimestamp(),
    }, {merge: true});
    return data;
  });
  if (!sub) return false;
  await materializeSubscriptionSeries(db, seriesIdsOf(sub), todayKey, false, nowMs);
  await notifyScheduleSafe(str(sub["holderAthleteId"]), {
    title: "Plano reativado",
    body: `Pagamento registrado. Seus horários do plano ${str(sub["planName"])} estão de volta na agenda.`,
    type: "schedule_plan_reactivated",
    data: {subscriptionId, arenaId: str(sub["arenaId"])},
  });
  return true;
}

// ---------------------------------------------------------------------------
// Baixa manual
// ---------------------------------------------------------------------------

async function loadChargeForManager(db: Firestore, chargeId: string, uid: string) {
  if (!chargeId) throw new HttpsError("invalid-argument", "Mensalidade inválida.");
  const ref = db.collection(ARENA_SCHEDULE_CHARGES).doc(chargeId);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError("not-found", "Mensalidade não encontrada.");
  const data = snap.data() as Data;
  await requireScheduleManager(db, str(data["arenaId"]), uid);
  return {ref, data};
}

export async function registerSchedulePaymentCore(
  db: Firestore,
  uid: string,
  chargeId: string,
  methodRaw: unknown,
  paidOnRaw: unknown,
  todayKey: string,
): Promise<{status: string; reactivated: boolean}> {
  const {ref, data} = await loadChargeForManager(db, chargeId, uid);
  const method = str(methodRaw);
  if (!(SCHEDULE_PAYMENT_METHODS as readonly string[]).includes(method)) {
    throw new HttpsError("invalid-argument", "Forma de pagamento inválida.");
  }
  const paidOn = str(paidOnRaw) || todayKey;
  if (!isValidDateKey(paidOn) || paidOn > todayKey) throw new HttpsError("invalid-argument", "Data do pagamento inválida.");
  await db.runTransaction(async (tx: Transaction) => {
    const snap = await tx.get(ref);
    const status = snap.data()?.["status"];
    if (status === "paid") return;
    if (status === "canceled") throw new HttpsError("failed-precondition", "Esta mensalidade foi cancelada.");
    tx.set(ref, {
      status: "paid", paidOn, paidAt: FieldValue.serverTimestamp(), paymentMethod: method, registeredByUid: uid,
    }, {merge: true});
  });
  const reactivated = await reactivateIfClearCore(db, str(data["subscriptionId"]), todayKey);
  return {status: "paid", reactivated};
}

export async function cancelScheduleChargeCore(
  db: Firestore,
  uid: string,
  chargeId: string,
  todayKey: string,
): Promise<{status: string}> {
  const {ref, data} = await loadChargeForManager(db, chargeId, uid);
  // Checagem e escrita na mesma transação: uma baixa concorrente não vira "cancelada".
  await db.runTransaction(async (tx: Transaction) => {
    const snap = await tx.get(ref);
    const status = snap.data()?.["status"];
    if (status === "paid") throw new HttpsError("failed-precondition", "Mensalidade já paga não pode ser cancelada.");
    if (status === "canceled") return;
    tx.set(ref, {status: "canceled", canceledAt: FieldValue.serverTimestamp(), registeredByUid: uid}, {merge: true});
  });
  // Perdoar a atrasada também destrava a assinatura suspensa.
  await reactivateIfClearCore(db, str(data["subscriptionId"]), todayKey);
  return {status: "canceled"};
}

// ---------------------------------------------------------------------------
// Agendador diário
// ---------------------------------------------------------------------------

export interface DailyResult {
  charges: number;
  reminders: number;
  suspended: number;
  resumed: number;
  ended: number;
  expiredCredits: number;
  released: number;
}

/** Último mês a faturar de quem tem saída marcada (o mês do último dia de jogo). */
function lastBillableMonth(sub: Data): string | null {
  const endsOn = typeof sub["endsOn"] === "string" ? sub["endsOn"] : null;
  return endsOn ? monthKeyOf(addDaysToDateKey(endsOn, -1)) : null;
}

export async function generateMonthlyChargesFor(db: Firestore, subId: string, sub: Data, todayKey: string): Promise<number> {
  const dueDay = Number(sub["dueDay"] ?? 5);
  const lastMonth = lastBillableMonth(sub);
  const months = monthsToBill(
    typeof sub["billedThrough"] === "string" ? sub["billedThrough"] : null,
    str(sub["startDate"]) || todayKey, dueDay, todayKey,
  ).filter((m) => !lastMonth || m <= lastMonth);
  let created = 0;
  for (const month of months) {
    const planned = buildPayerCharges(
      subChargeOwner(subId, sub), month, "monthly", Number(sub["monthlyPriceReais"] ?? 0), dueDateFor(month, dueDay),
    );
    const batch = db.batch();
    for (const c of planned) {
      const ref = db.collection(ARENA_SCHEDULE_CHARGES).doc(c.id);
      if (!canWriteCharge(await ref.get())) continue;
      batch.set(ref, c.data);
      created += 1;
    }
    batch.set(db.collection(ARENA_SCHEDULE_SUBSCRIPTIONS).doc(subId), {billedThrough: month}, {merge: true});
    await batch.commit();
  }
  return created;
}

export async function runScheduleSubscriptionsDaily(db: Firestore, todayKey: string, nowMs: number): Promise<DailyResult> {
  const result: DailyResult = {charges: 0, reminders: 0, suspended: 0, resumed: 0, ended: 0, expiredCredits: 0, released: 0};

  // 1. Saídas marcadas que chegaram.
  for (const status of LIVE_SUBSCRIPTION_STATUSES) {
    const snap = await db.collection(ARENA_SCHEDULE_SUBSCRIPTIONS).where("status", "==", status).get();
    for (const doc of snap.docs) {
      const endsOn = doc.data()["endsOn"];
      if (typeof endsOn === "string" && endsOn <= todayKey) {
        try {
          await finalizeSubscriptionEndCore(db, doc.id, todayKey, nowMs, null);
          result.ended += 1;
        } catch (e) {
          logger.error("runArenaScheduleSubscriptionsDaily: encerrar falhou", {subscriptionId: doc.id, error: e});
        }
      }
    }
  }

  // 1b. Liberação de agenda que ficou pela metade (queda entre a mudança de status e a liberação).
  const pending = await db.collection(ARENA_SCHEDULE_SUBSCRIPTIONS).where("releasePending", "==", true).get();
  for (const doc of pending.docs) {
    const ids = Array.isArray(doc.data()["pendingReleaseSeriesIds"]) ?
      (doc.data()["pendingReleaseSeriesIds"] as unknown[]).map(String) :
      [];
    try {
      result.released += await releaseSubscriptionSeries(
        db, ids, str(doc.data()["pendingReleaseReason"]) || "schedule_release_sweep", doc.id,
      );
    } catch (e) {
      logger.error("runArenaScheduleSubscriptionsDaily: liberar agenda falhou", {subscriptionId: doc.id, error: e});
    }
  }

  // 2. Volta da pausa.
  const paused = await db.collection(ARENA_SCHEDULE_SUBSCRIPTIONS).where("status", "==", "paused").get();
  for (const doc of paused.docs) {
    const until = doc.data()["pausedUntil"];
    if (typeof until === "string" && until <= todayKey) {
      try {
        await resumeSubscriptionCore(db, null, doc.id, todayKey, nowMs);
        result.resumed += 1;
      } catch (e) {
        logger.error("runArenaScheduleSubscriptionsDaily: retomar falhou", {subscriptionId: doc.id, error: e});
      }
    }
  }

  // 3. Mensalidades do mês (e do próximo, a 10 dias do vencimento). Pausada não fatura; suspensa
  // segura a vaga e segue faturando (a dívida é dela).
  for (const status of ["active", "suspended"]) {
    const snap = await db.collection(ARENA_SCHEDULE_SUBSCRIPTIONS).where("status", "==", status).get();
    for (const doc of snap.docs) {
      try {
        result.charges += await generateMonthlyChargesFor(db, doc.id, doc.data() as Data, todayKey);
      } catch (e) {
        logger.error("runArenaScheduleSubscriptionsDaily: mensalidade falhou", {subscriptionId: doc.id, error: e});
      }
    }
  }

  // 4. Atraso: lembretes e suspensão.
  const open = await db.collection(ARENA_SCHEDULE_CHARGES).where("status", "==", "open").where("dueDate", "<=", todayKey).get();
  const subCache = new Map<string, Data | null>();
  const toSuspend = new Set<string>();
  for (const doc of open.docs) {
    const charge = doc.data() as Data;
    const subId = str(charge["subscriptionId"]);
    if (!subCache.has(subId)) {
      const s = await db.collection(ARENA_SCHEDULE_SUBSCRIPTIONS).doc(subId).get();
      subCache.set(subId, s.exists ? s.data() as Data : null);
    }
    const sub = subCache.get(subId);
    if (!sub || !(LIVE_SUBSCRIPTION_STATUSES as readonly string[]).includes(String(sub["status"]))) continue;
    const reminder = dueReminder(charge, todayKey);
    if (reminder != null) {
      const late = daysBetween(str(charge["dueDate"]), todayKey);
      const invoiceUrl = onlineInvoiceUrlOf(charge);
      await doc.ref.set({remindersSent: [...REMINDER_OFFSETS.filter((o) => o <= reminder)]}, {merge: true});
      await notifyScheduleSafe(str(charge["payerAthleteId"]), {
        title: late === 0 ? "Mensalidade vence hoje" : `Mensalidade atrasada há ${late} dia(s)`,
        body: `${str(charge["planName"])} · ${monthLabelPt(str(charge["period"]))} · ` +
          `R$ ${Number(charge["amountReais"] ?? 0).toFixed(2).replace(".", ",")}. ` +
          (invoiceUrl ? "Toque para pagar com Pix ou cartão." : "Acerte com a arena."),
        type: "schedule_plan_charge_reminder",
        data: {chargeId: doc.id, subscriptionId: subId, ...(invoiceUrl ? {invoiceUrl, webUrl: invoiceUrl} : {})},
      });
      result.reminders += 1;
    }
    if (sub["status"] === "active" && isPastRelease(charge, overdueReleaseDaysOf(sub), todayKey)) toSuspend.add(subId);
  }
  for (const subId of toSuspend) {
    try {
      if (await suspendForOverdueCore(db, subId)) result.suspended += 1;
    } catch (e) {
      logger.error("runArenaScheduleSubscriptionsDaily: suspender falhou", {subscriptionId: subId, error: e});
    }
  }

  // 5. Créditos de reposição vencidos.
  const credits = await db.collection(ARENA_SCHEDULE_CREDITS)
    .where("status", "==", "available")
    .where("expiresOn", "<", todayKey)
    .get();
  for (const doc of credits.docs) {
    const subRef = db.collection(ARENA_SCHEDULE_SUBSCRIPTIONS).doc(str(doc.data()["subscriptionId"]));
    await db.runTransaction(async (tx: Transaction) => {
      const credit = await tx.get(doc.ref);
      const subSnap = await tx.get(subRef);
      if (credit.data()?.["status"] !== "available") return;
      tx.set(doc.ref, {status: "expired", updatedAt: FieldValue.serverTimestamp()}, {merge: true});
      if (subSnap.exists) {
        tx.set(subRef, {makeupBalance: Math.max(0, Number(subSnap.data()?.["makeupBalance"] ?? 0) - 1)}, {merge: true});
      }
    });
    result.expiredCredits += 1;
  }
  return result;
}

export const runArenaScheduleSubscriptionsDaily = onSchedule({
  schedule: "every day 04:10",
  timeZone: "America/Sao_Paulo",
  timeoutSeconds: 540,
}, async () => {
  const result = await runScheduleSubscriptionsDaily(getFirestore(), dayKeyFromEventDate(new Date()), Date.now());
  logger.info("runArenaScheduleSubscriptionsDaily", result);
});

// ---------------------------------------------------------------------------
// Callables
// ---------------------------------------------------------------------------

export const registerArenaSchedulePayment = onCall({region: CLIENT_FACING_REGIONS, timeoutSeconds: 120}, async (request) => {
  const uid = requireUid(request.auth);
  const input = (request.data ?? {}) as Data;
  try {
    return await registerSchedulePaymentCore(
      getFirestore(), uid, str(input["chargeId"]), input["paymentMethod"], input["paidOn"], dayKeyFromEventDate(new Date()),
    );
  } catch (e) {
    return rethrowSchedule("registerArenaSchedulePayment", e);
  }
});

export const cancelArenaScheduleCharge = onCall({region: CLIENT_FACING_REGIONS, timeoutSeconds: 120}, async (request) => {
  const uid = requireUid(request.auth);
  const input = (request.data ?? {}) as Data;
  try {
    return await cancelScheduleChargeCore(getFirestore(), uid, str(input["chargeId"]), dayKeyFromEventDate(new Date()));
  } catch (e) {
    return rethrowSchedule("cancelArenaScheduleCharge", e);
  }
});
