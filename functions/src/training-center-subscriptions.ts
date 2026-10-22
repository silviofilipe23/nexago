/**
 * Cobrança recorrente das mensalidades do Centro de Treinamento.
 *
 * - Gatilho da matrícula: matrícula MENSAL que fica ativa ganha uma assinatura
 *   (`trainingCenters/{c}/subscriptions/{enrollmentId}`) com o preço do contrato e o dia de
 *   vencimento da política; pausar/voltar/cancelar a matrícula espelha na assinatura.
 * - Rodada diária (06:00 no fuso de São Paulo), por centro ativo:
 *   1. matrícula pausada volta sozinha em `pausedUntil`;
 *   2. pacote vencido (validade) ou sem crédito é concluído e libera a vaga;
 *   3. assinatura "cancela no fim do ciclo" encerra a matrícula no vencimento;
 *   4. D−3: gera a cobrança do ciclo (id fixo por assinatura+ciclo — repetir não duplica), gera a
 *      fatura no Asaas quando o recebimento está conectado (multa/juros da política) e avisa;
 *   5. régua: D+1, D+7, aviso de bloqueio, check-in bloqueado (pendência) e suspensão (libera a
 *      vaga) — cada estágio avisa uma vez por cobrança;
 *   6. grava o resumo em `billingRuns/{dia}`.
 * - Gatilho da cobrança: pagou/baixou/cancelou uma cobrança do ciclo → recalcula o atraso (sai de
 *   "em atraso" e desbloqueia o check-in na hora, sem esperar a rodada).
 * - Callables: mudar de plano (agora com proporcional, ou no próximo ciclo) e "cobrar agora".
 *
 * Só "Pix mensal" por enquanto: cartão recorrente e Pix Automático dependem da autorização do
 * aluno no app.
 */
import * as logger from "firebase-functions/logger";
import {HttpsError, onCall, type CallableRequest} from "firebase-functions/v2/https";
import {onDocumentWritten} from "firebase-functions/v2/firestore";
import {onSchedule} from "firebase-functions/v2/scheduler";
import {Timestamp, getFirestore, type DocumentReference, type Firestore, type Transaction} from "firebase-admin/firestore";
import {asaasArenaSecrets} from "./asaas-client";
import {CLIENT_FACING_REGIONS} from "./function-regions";
import {WEB_PUSH_PRIVATE_KEY, WEB_PUSH_PUBLIC_KEY, WEB_PUSH_SUBJECT} from "./notification-delivery";
import {
  SYSTEM,
  asaasFailure,
  defaultCenterBillingDeps,
  issueCenterInvoiceAs,
  requireManager,
  type CenterBillingDeps,
} from "./training-center-billing";
import {TRAINING_CENTERS, TRAINING_CENTER_RECEIVING, brlFromCents} from "./training-center-billing-model";
import {
  GENERATE_DAYS_BEFORE,
  addDays,
  billingDayFor,
  cycleInvoiceId,
  cycleKey,
  cycleLabel,
  daysBetween,
  dunningNotice,
  dunningStage,
  firstChargeAfter,
  packFinished,
  planChangeProration,
  readBilling,
  shiftMonths,
  shortDay,
  type BillingPolicies,
  type DunningStage,
} from "./training-center-subscription-model";
import {billingEventForStage} from "./training-center-notification-settings-model";
import {deliverCenterNotice} from "./training-center-notify";
import {dayKeyIn, invoiceReference, payerName} from "./training-center-waitlist-model";

type Data = Record<string, unknown>;

export const CENTER_BILLING_NOTICE_TYPE = "training_center_billing_notice";
const SUBSCRIPTIONS = "subscriptions";
/** Assinatura que ainda cobra (as outras são histórico). */
const LIVE = ["active", "past_due", "paused", "canceling"];
const MAX_NOTICES = 30;
const STAGE_LABEL = ["Lembrete D−3", "Não pago (D+1)", "Lembrete (D+7)", "Aviso de bloqueio", "Check-in bloqueado", "Suspensão"];
const MAX_RUN_ITEMS = 200;
/** Multa de 2% + juros de 1% ao mês (o Asaas soma no pagamento atrasado). */
const LATE_FEES = {finePercent: 2, interestPercent: 1};

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function num(v: unknown, fallback = 0): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

const centerRef = (db: Firestore, centerId: string) => db.collection(TRAINING_CENTERS).doc(centerId);

function audit(at: Timestamp, actor: {uid: string; name: string}, action: string, entity: string, entityId: string, detail: string): Data {
  return {at, actorUid: actor.uid, actorName: actor.name, action, entity, entityId, detail, reason: ""};
}

function lateFeesFor(b: BillingPolicies): Data | null {
  return b.lateFees ? {...LATE_FEES} : null;
}

// ---------------------------------------------------------------------------
// Assinatura a partir da matrícula
// ---------------------------------------------------------------------------

/** Primeiro vencimento recorrente: o 1º mês (proporcional ou cheio) é a cobrança da matrícula. */
export function newSubscription(enrollmentId: string, enr: Data, student: Data | undefined, billing: BillingPolicies, today: string, at: Timestamp): Data {
  const contract = (enr["contract"] ?? {}) as Data;
  // Começa na data de início ou na contratação, a mais tarde (vaga da fila: o dia da oferta).
  const startDate = [str(enr["startDate"]), str(contract["contractedAt"])].filter(Boolean).sort().pop() || today;
  const billingDay = billingDayFor(billing, startDate);
  let next = firstChargeAfter(startDate, billingDay);
  // Ativada bem depois da contratação: começa no próximo vencimento, sem cobrar o mês que passou.
  while (next < today) next = shiftMonths(next, 1, billingDay);
  return {
    enrollmentId,
    studentId: str(enr["studentId"]),
    studentName: str(enr["studentName"]),
    payerName: payerName(student, str(enr["studentName"])),
    classId: str(enr["classId"]),
    className: str(enr["className"]),
    planId: str(enr["planId"]) || null,
    planName: str(contract["planName"]),
    priceCents: num(contract["priceCents"]),
    billingDay,
    method: "pix_manual",
    status: "active",
    startDate,
    nextChargeDate: next,
    lastDueDate: null,
    pausedUntil: null,
    cancelAt: null,
    pendingPlanChange: null,
    lateFees: lateFeesFor(billing),
    dunningInvoiceId: "",
    dunningStage: 0,
    overdueSince: null,
    checkinBlocked: false,
    skippedCycles: [],
    notices: [],
    createdAt: at,
    updatedAt: at,
    endedAt: null,
    endReason: "",
  };
}

/** O que muda na assinatura quando a matrícula muda (null = nada). */
export function subscriptionPatch(enr: Data, sub: Data, at: Timestamp): Data | null {
  const cur = str(sub["status"]);
  if (!LIVE.includes(cur)) return null;
  const st = str(enr["status"]);
  if (st === "paused" && cur !== "paused") {
    return {status: "paused", pausedUntil: str(enr["pausedUntil"]) || null, updatedAt: at};
  }
  if (st === "active" && cur === "paused") {
    return {status: sub["overdueSince"] ? "past_due" : "active", pausedUntil: null, updatedAt: at};
  }
  if (st === "cancelled" || st === "completed") {
    return {status: "cancelled", cancelAt: null, endedAt: at, endReason: str(enr["cancelReason"]) || st, updatedAt: at};
  }
  return null;
}

export async function syncSubscriptionFromEnrollment(db: Firestore, centerId: string, enrollmentId: string, now: Date): Promise<string> {
  const center = centerRef(db, centerId);
  const enrRef = center.collection("enrollments").doc(enrollmentId);
  const subRef = center.collection(SUBSCRIPTIONS).doc(enrollmentId);
  const at = Timestamp.fromDate(now);
  return db.runTransaction(async (tx: Transaction) => {
    const enr = (await tx.get(enrRef)).data();
    if (!enr) return "none";
    const subSnap = await tx.get(subRef);
    const sub = subSnap.data();
    const contract = (enr["contract"] ?? {}) as Data;
    if (!sub) {
      if (contract["planType"] !== "monthly" || enr["status"] !== "active") return "none";
      const c = (await tx.get(center)).data() ?? {};
      const studentId = str(enr["studentId"]);
      const student = studentId ? (await tx.get(center.collection("students").doc(studentId))).data() : undefined;
      const today = dayKeyIn(now, str(c["timezone"]));
      const data = newSubscription(enrollmentId, enr, student, readBilling(c["billing"]), today, at);
      tx.set(subRef, data);
      tx.set(center.collection("auditLogs").doc(), audit(at, SYSTEM, "subscription.created", "subscription", enrollmentId,
        `${data["payerName"]} · ${data["planName"]} · ${brlFromCents(num(data["priceCents"]))}/mês · 1º vencimento ${shortDay(str(data["nextChargeDate"]))}`));
      return "created";
    }
    const patch = subscriptionPatch(enr, sub, at);
    if (!patch) return "same";
    if (patch["status"] === "cancelled") {
      // Ciclos ainda não vencidos deixam de valer; o que já venceu segue em aberto.
      const c = (await tx.get(center)).data() ?? {};
      const today = dayKeyIn(now, str(c["timezone"]));
      const open = await tx.get(center.collection("invoices").where("subscriptionId", "==", enrollmentId).where("status", "==", "pending")) as unknown as {docs: FirebaseFirestore.QueryDocumentSnapshot[]};
      for (const doc of open.docs) {
        if (str(doc.data()["dueDate"]) <= today) continue;
        tx.update(doc.ref, {
          status: "cancelled",
          providerCheckAt: null,
          events: [...(Array.isArray(doc.data()["events"]) ? doc.data()["events"] as unknown[] : []),
            {at, type: "cancel", title: "Cobrança cancelada", detail: "Assinatura encerrada antes do vencimento", byName: SYSTEM.name}],
        });
      }
    }
    tx.update(subRef, patch);
    return String(patch["status"]);
  });
}

export const onTrainingCenterEnrollmentBilling = onDocumentWritten(`${TRAINING_CENTERS}/{centerId}/enrollments/{enrollmentId}`, async (event) => {
  const before = event.data?.before?.data();
  const after = event.data?.after?.data();
  if (!after) return;
  if (before && before["status"] === after["status"] && before["pausedUntil"] === after["pausedUntil"]) return;
  await syncSubscriptionFromEnrollment(getFirestore(), event.params.centerId, event.params.enrollmentId, new Date());
});

// ---------------------------------------------------------------------------
// Backfill: matrículas mensais que já estavam ativas antes da recorrência
// ---------------------------------------------------------------------------

export interface BackfillRow {
  centerId: string;
  enrollmentId: string;
  name: string;
  status: string;
  priceCents: number;
  nextChargeDate: string;
  /** Ciclo pulado porque o centro já tinha uma cobrança da matrícula naquele mês. */
  skippedCycle: string | null;
  result: "created" | "would_create" | "exists";
}

/**
 * O gatilho só cria a assinatura quando a matrícula MUDA de status; quem já estava ativo (ou
 * pausado) antes do deploy fica sem. Cria com a mesma regra do gatilho e, para não cobrar duas
 * vezes, pula o ciclo do 1º vencimento se o centro já tem uma cobrança dessa matrícula naquele mês
 * (cobrança feita à mão antes da recorrência). Sem `apply` só relata.
 */
export async function backfillSubscriptionsCore(
  db: Firestore,
  now: Date,
  opts: {centerId?: string; apply: boolean},
): Promise<BackfillRow[]> {
  const centers = opts.centerId ?
    [await centerRef(db, opts.centerId).get()] :
    (await db.collection(TRAINING_CENTERS).get()).docs;
  const rows: BackfillRow[] = [];
  const at = Timestamp.fromDate(now);
  for (const cSnap of centers) {
    const c = cSnap.data();
    if (!c) continue;
    const center = cSnap.ref;
    const today = dayKeyIn(now, str(c["timezone"]));
    const billing = readBilling(c["billing"]);
    const enrollments = (await center.collection("enrollments").get()).docs.filter((d) => {
      const e = d.data();
      return ["active", "paused"].includes(str(e["status"])) && (e["contract"] as Data | undefined)?.["planType"] === "monthly";
    });
    for (const doc of enrollments) {
      const subRef = center.collection(SUBSCRIPTIONS).doc(doc.id);
      const row = await db.runTransaction(async (tx: Transaction): Promise<BackfillRow | null> => {
        const enr = (await tx.get(doc.ref)).data();
        if (!enr || !["active", "paused"].includes(str(enr["status"]))) return null;
        const existing = await tx.get(subRef);
        const name = str(enr["studentName"]);
        if (existing.exists) {
          const cur = existing.data() ?? {};
          return {centerId: center.id, enrollmentId: doc.id, name, status: str(cur["status"]), priceCents: num(cur["priceCents"]),
            nextChargeDate: str(cur["nextChargeDate"]), skippedCycle: null, result: "exists"};
        }
        const studentId = str(enr["studentId"]);
        const student = studentId ? (await tx.get(center.collection("students").doc(studentId))).data() : undefined;
        const invoices = await tx.get(center.collection("invoices").where("enrollmentId", "==", doc.id)) as unknown as {docs: FirebaseFirestore.QueryDocumentSnapshot[]};
        const data = newSubscription(doc.id, enr, student, billing, today, at);
        const billedMonths = new Set(invoices.docs
          .filter((i) => str(i.data()["status"]) !== "cancelled")
          .map((i) => cycleKey(str(i.data()["dueDate"]))));
        let skippedCycle: string | null = null;
        const first = str(data["nextChargeDate"]);
        if (billedMonths.has(cycleKey(first))) {
          skippedCycle = cycleKey(first);
          data["nextChargeDate"] = shiftMonths(first, 1, num(data["billingDay"], billing.billingDay));
        }
        if (enr["status"] === "paused") {
          data["status"] = "paused";
          data["pausedUntil"] = str(enr["pausedUntil"]) || null;
        }
        if (opts.apply) {
          tx.set(subRef, data);
          tx.set(center.collection("auditLogs").doc(), audit(at, SYSTEM, "subscription.backfilled", "subscription", doc.id,
            `${data["payerName"]} · ${data["planName"]} · ${brlFromCents(num(data["priceCents"]))}/mês · 1º vencimento ${shortDay(str(data["nextChargeDate"]))}` +
            (skippedCycle ? ` · ${cycleLabel(skippedCycle)} já cobrado` : "")));
        }
        return {centerId: center.id, enrollmentId: doc.id, name, status: str(data["status"]), priceCents: num(data["priceCents"]),
          nextChargeDate: str(data["nextChargeDate"]), skippedCycle, result: opts.apply ? "created" : "would_create"};
      });
      if (row) rows.push(row);
    }
  }
  return rows;
}

// ---------------------------------------------------------------------------
// Encerrar matrícula (pacote, fim do ciclo, suspensão) devolvendo a vaga
// ---------------------------------------------------------------------------

async function endEnrollment(
  db: Firestore,
  center: DocumentReference,
  enrollmentId: string,
  to: "cancelled" | "completed",
  reason: string,
  detail: string,
  at: Timestamp,
  also?: (tx: Transaction, enr: Data) => Promise<() => void>,
): Promise<boolean> {
  const enrRef = center.collection("enrollments").doc(enrollmentId);
  return db.runTransaction(async (tx: Transaction) => {
    const enr = (await tx.get(enrRef)).data();
    if (!enr || !["active", "paused"].includes(str(enr["status"]))) return false;
    const classRef = str(enr["classId"]) ? center.collection("classes").doc(str(enr["classId"])) : null;
    const cls = classRef ? await tx.get(classRef) : null;
    const extra = also ? await also(tx, enr) : null;
    if (classRef && cls?.exists) {
      const roster = cls.data()?.["rosterStudentIds"];
      tx.update(classRef, {
        seatsTaken: Math.max(0, num(cls.data()?.["seatsTaken"]) - 1),
        ...(Array.isArray(roster) ? {rosterStudentIds: roster.filter((id) => id !== str(enr["studentId"]))} : {}),
      });
    }
    tx.update(enrRef, {status: to, endedAt: at, cancelReason: reason, holdUntil: null, pausedUntil: null});
    tx.set(center.collection("auditLogs").doc(), audit(at, SYSTEM, `enrollment.${reason}`, "enrollment", enrollmentId,
      `${str(enr["studentName"])} → ${str(enr["className"])} · ${detail}`));
    extra?.();
    return true;
  });
}

// ---------------------------------------------------------------------------
// Avisos ao pagador
// ---------------------------------------------------------------------------

interface CenterRun {
  id: string;
  ref: DocumentReference;
  name: string;
  today: string;
  billing: BillingPolicies;
  /** Recebimento conectado: dá para gerar fatura no Asaas. */
  online: boolean;
}

async function sendNotice(
  db: Firestore,
  c: CenterRun,
  subRef: DocumentReference,
  sub: Data,
  stage: DunningStage,
  inv: {id: string; cycle: string; amountCents: number; dueDate: string; url: string},
  deps: CenterBillingDeps,
): Promise<boolean> {
  const studentId = str(sub["studentId"]);
  const student = studentId ? (await c.ref.collection("students").doc(studentId).get()).data() : undefined;
  const uid = str(student?.["uid"]);
  const blockDay = c.billing.blockAfterDays > 0 ? shortDay(addDays(inv.dueDate, c.billing.blockAfterDays)) : null;
  const text = dunningNotice(stage, {
    centerName: c.name, cycle: inv.cycle, amount: brlFromCents(inv.amountCents), blockDay,
    dueIn: daysBetween(c.today, inv.dueDate), link: Boolean(inv.url),
  });
  // Preferências do centro: evento desligado não sai; no silêncio, sai quando ele acaba.
  const r = await deliverCenterNotice(db, deps, {
    centerId: c.id, event: billingEventForStage(stage), uids: uid ? [uid] : [], title: text.title, body: text.body,
    type: CENTER_BILLING_NOTICE_TYPE, data: {centerId: c.id, invoiceId: inv.id, ...(inv.url ? {invoiceUrl: inv.url, webUrl: inv.url} : {})},
  });
  const delivered = r.sent > 0 || r.deferred > 0;
  const channel = r.deferred ? "push (após o silêncio)" : r.skipped === "disabled" ? "desligado" : "push";
  const notice = {at: Timestamp.fromDate(deps.now()), stage, cycle: inv.cycle, invoiceId: inv.id, title: text.title, channel, delivered};
  await db.runTransaction(async (tx: Transaction) => {
    const cur = (await tx.get(subRef)).data();
    if (!cur) return;
    const list = Array.isArray(cur["notices"]) ? cur["notices"] as unknown[] : [];
    tx.update(subRef, {notices: [...list, notice].slice(-MAX_NOTICES)});
  });
  return delivered;
}

// ---------------------------------------------------------------------------
// Atraso e régua
// ---------------------------------------------------------------------------

interface OpenInvoice {
  id: string;
  dueDate: string;
  amountCents: number;
  cycle: string;
  url: string;
}

async function openInvoices(c: {ref: DocumentReference}, subId: string): Promise<OpenInvoice[]> {
  const snap = await c.ref.collection("invoices").where("subscriptionId", "==", subId).where("status", "==", "pending").get();
  return snap.docs
    .map((d) => ({
      id: d.id,
      dueDate: str(d.data()["dueDate"]),
      amountCents: num(d.data()["amountCents"]),
      cycle: str(d.data()["cycle"]) || cycleKey(str(d.data()["dueDate"])),
      url: str(d.data()["providerUrl"]),
    }))
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}

export interface DebtResult {
  stage: DunningStage;
  notified: DunningStage | null;
  suspended: boolean;
  blocked: boolean;
}

/**
 * Recalcula atraso, bloqueio e estágio da régua da assinatura. `dun` = rodada diária (avisa e
 * suspende); sem ele (gatilho da cobrança) só limpa o que o pagamento resolveu.
 */
export async function refreshSubscriptionDebt(
  db: Firestore,
  c: CenterRun,
  subId: string,
  deps: CenterBillingDeps,
  dun: boolean,
): Promise<DebtResult> {
  const subRef = c.ref.collection(SUBSCRIPTIONS).doc(subId);
  const overdue = (await openInvoices(c, subId)).filter((i) => i.dueDate < c.today);
  const oldest = overdue[0] ?? null;
  const stage: DunningStage = oldest ? dunningStage(daysBetween(oldest.dueDate, c.today), c.billing) : 0;
  const at = Timestamp.fromDate(deps.now());

  const decided = await db.runTransaction(async (tx: Transaction) => {
    const sub = (await tx.get(subRef)).data();
    if (!sub) return null;
    const status = str(sub["status"]);
    const studentId = str(sub["studentId"]);
    const studentRef = studentId ? c.ref.collection("students").doc(studentId) : null;
    const student = studentRef ? (await tx.get(studentRef)).data() : undefined;
    const live = LIVE.includes(status);
    const sameInvoice = oldest !== null && str(sub["dunningInvoiceId"]) === oldest.id;
    const prev = (sameInvoice ? num(sub["dunningStage"]) : 0) as DunningStage;
    const notify = dun && live && oldest !== null && stage > prev;
    const blocked = live && stage >= 4;
    const suspend = dun && live && stage === 5 && c.billing.suspendAction === "suspend";

    const patch: Data = {
      overdueSince: oldest?.dueDate ?? null,
      dunningInvoiceId: oldest?.id ?? "",
      dunningStage: oldest ? (dun ? stage : prev) : 0,
      checkinBlocked: blocked,
      updatedAt: at,
    };
    if (status === "active" || status === "past_due") patch["status"] = oldest ? "past_due" : "active";
    const changed = Object.keys(patch).some((k) => k !== "updatedAt" && JSON.stringify(patch[k]) !== JSON.stringify(sub[k] ?? null));
    if (changed) tx.update(subRef, patch);

    // Pendência no check-in: lista das assinaturas bloqueadas do aluno (pode ter mais de uma turma).
    if (studentRef && student) {
      const holds = Array.isArray(student["billingHoldBy"]) ? (student["billingHoldBy"] as string[]) : [];
      const want = blocked && !suspend ? [...new Set([...holds, subId])] : holds.filter((id) => id !== subId);
      if (want.length !== holds.length) tx.update(studentRef, {billingHoldBy: want, billingHold: want.length > 0});
    }
    return {sub, notify, suspend, blocked: blocked && !suspend};
  });
  if (!decided) return {stage, notified: null, suspended: false, blocked: false};

  let suspended = false;
  if (decided.suspend && oldest) {
    suspended = await endEnrollment(db, c.ref, subId, "cancelled", "nonpayment",
      `suspensa por falta de pagamento (${cycleLabel(oldest.cycle)}, ${daysBetween(oldest.dueDate, c.today)} dias) · vaga liberada`, at);
    if (suspended) await db.runTransaction(async (tx: Transaction) => {
      const cur = (await tx.get(subRef)).data();
      if (!cur) return;
      tx.update(subRef, {status: "suspended", endedAt: at, endReason: "nonpayment", checkinBlocked: false, cancelAt: null, updatedAt: at});
    });
  }
  if (decided.notify && oldest) {
    await sendNotice(db, c, subRef, decided.sub, stage, oldest, deps);
  }
  return {stage, notified: decided.notify ? stage : null, suspended, blocked: decided.blocked};
}

export const onTrainingCenterSubscriptionInvoiceWritten = onDocumentWritten(`${TRAINING_CENTERS}/{centerId}/invoices/{invoiceId}`, async (event) => {
  const before = event.data?.before?.data();
  const after = event.data?.after?.data();
  const subId = str(after?.["subscriptionId"]) || str(before?.["subscriptionId"]);
  if (!subId || before?.["status"] === after?.["status"]) return;
  const db = getFirestore();
  const c = await loadCenter(db, event.params.centerId, new Date());
  if (c) await refreshSubscriptionDebt(db, c, subId, defaultCenterBillingDeps, false);
});

// ---------------------------------------------------------------------------
// Gerar o ciclo
// ---------------------------------------------------------------------------

export interface Generated {
  kind: "generated" | "skipped";
  invoiceId: string;
  cycle: string;
  dueDate: string;
  amountCents: number;
}

/** Contrato depois de uma troca de plano (o snapshot da matrícula acompanha o que se cobra). */
function contractWith(contract: unknown, change: Data): Data {
  const base = contract && typeof contract === "object" ? (contract as Data) : {};
  return {
    ...base,
    planName: str(change["planName"]),
    priceCents: num(change["priceCents"]),
    classesPerWeek: change["classesPerWeek"] ?? base["classesPerWeek"] ?? null,
    makeupsPerMonth: change["makeupsPerMonth"] ?? base["makeupsPerMonth"] ?? null,
  };
}

/**
 * Gera a cobrança do próximo ciclo se já está na janela (D−3) — ou agora, com `force`. Pausada
 * no vencimento pula o ciclo; "cancela no fim do ciclo" não gera o ciclo do cancelamento.
 */
export async function generateNextCycle(
  db: Firestore,
  c: CenterRun,
  subId: string,
  at: Timestamp,
  actorName: string,
  force = false,
): Promise<Generated | null> {
  const subRef = c.ref.collection(SUBSCRIPTIONS).doc(subId);
  return db.runTransaction(async (tx: Transaction) => {
    const sub = (await tx.get(subRef)).data();
    if (!sub || !LIVE.includes(str(sub["status"]))) return null;
    const next = str(sub["nextChargeDate"]);
    if (!next || (!force && addDays(next, -GENERATE_DAYS_BEFORE) > c.today)) return null;
    const status = str(sub["status"]);
    const cancelAt = str(sub["cancelAt"]);
    if (status === "canceling" && cancelAt && next >= cancelAt) return null;
    const billingDay = num(sub["billingDay"], c.billing.billingDay);
    const cycle = cycleKey(next);
    const following = shiftMonths(next, 1, billingDay);
    const pausedUntil = str(sub["pausedUntil"]);
    if (status === "paused" && (!pausedUntil || pausedUntil >= next)) {
      const skipped = Array.isArray(sub["skippedCycles"]) ? sub["skippedCycles"] as string[] : [];
      tx.update(subRef, {nextChargeDate: following, skippedCycles: [...skipped, cycle].slice(-24), updatedAt: at});
      return {kind: "skipped", invoiceId: "", cycle, dueDate: next, amountCents: 0};
    }

    const invoiceId = cycleInvoiceId(subId, cycle);
    const invRef = c.ref.collection("invoices").doc(invoiceId);
    const existing = await tx.get(invRef);
    const change = sub["pendingPlanChange"] && typeof sub["pendingPlanChange"] === "object" ? sub["pendingPlanChange"] as Data : null;
    const enrRef = c.ref.collection("enrollments").doc(subId);
    const enr = change ? (await tx.get(enrRef)).data() : undefined;
    const planName = change ? str(change["planName"]) : str(sub["planName"]);
    const amountCents = change ? num(change["priceCents"]) : num(sub["priceCents"]);

    if (!existing.exists) {
      const reference = invoiceReference({planName, planType: "monthly"}, next);
      tx.set(invRef, {
        studentId: str(sub["studentId"]) || null,
        enrollmentId: subId,
        subscriptionId: subId,
        cycle,
        payerName: str(sub["payerName"]),
        reference,
        amountCents,
        dueDate: next,
        status: "pending",
        method: null,
        providerRef: "",
        lateFees: sub["lateFees"] ?? null,
        events: [{
          at, type: "created", title: "Cobrança do ciclo gerada",
          detail: `${brlFromCents(amountCents)} · ${reference} · vence ${shortDay(next)} · assinatura`, byName: actorName,
        }],
        approvedAt: null,
        refundedCents: 0,
        createdAt: at,
      });
    }
    tx.update(subRef, {
      nextChargeDate: following,
      lastDueDate: next,
      ...(change ? {planId: change["planId"] ?? null, planName, priceCents: amountCents, pendingPlanChange: null} : {}),
      updatedAt: at,
    });
    if (change && enr) {
      tx.update(enrRef, {planId: change["planId"] ?? null, contract: contractWith(enr["contract"], change)});
      tx.set(c.ref.collection("auditLogs").doc(), audit(at, SYSTEM, "subscription.plan_changed", "subscription", subId,
        `${str(sub["payerName"])} · ${str(sub["planName"])} → ${planName} · vale a partir de ${shortDay(next)}`));
    }
    return {kind: "generated", invoiceId, cycle, dueDate: next, amountCents};
  });
}

/** Fatura no Asaas para a cobrança do ciclo (silenciosa — o aviso é o da régua). */
async function issueOnline(db: Firestore, c: CenterRun, invoiceId: string, amountCents: number, deps: CenterBillingDeps, actor = SYSTEM): Promise<{url: string; error: string}> {
  if (!c.online) return {url: "", error: ""};
  if (amountCents < 500) return {url: "", error: "abaixo de R$ 5,00"};
  try {
    const r = await issueCenterInvoiceAs(db, actor, {centerId: c.id, invoiceId, cpfCnpj: null}, deps, {silent: true});
    return {url: r.invoiceUrl, error: ""};
  } catch (e) {
    const reason = e instanceof HttpsError && (e.details as Data | undefined)?.["reason"] === "needs_cpf" ? "sem CPF do pagador" :
      e instanceof Error ? e.message : String(e);
    logger.warn(`subscription ${c.id}/${invoiceId}: fatura não gerada`, e);
    return {url: "", error: reason.slice(0, 160)};
  }
}

// ---------------------------------------------------------------------------
// Rodada diária
// ---------------------------------------------------------------------------

async function loadCenter(db: Firestore, centerId: string, now: Date): Promise<CenterRun | null> {
  const ref = centerRef(db, centerId);
  const data = (await ref.get()).data();
  if (!data) return null;
  const receiving = (await db.collection(TRAINING_CENTER_RECEIVING).doc(centerId).get()).data();
  return {
    id: centerId,
    ref,
    name: str(data["name"]),
    today: dayKeyIn(now, str(data["timezone"])),
    billing: readBilling(data["billing"]),
    online: data["status"] === "active" && data["receivingConnected"] === true && Boolean(str(receiving?.["walletId"])),
  };
}

export interface RunItem {
  subscriptionId: string;
  name: string;
  kind: "generated" | "skipped" | "issued" | "issue_failed" | "reminder" | "notice" | "blocked" | "suspended" | "resumed" | "pack_completed" | "cancelled";
  detail: string;
  cents: number;
}

export interface RunSummary {
  generated: number;
  generatedCents: number;
  issued: number;
  issueFailed: number;
  skippedPaused: number;
  reminders: number;
  notices: number;
  blocked: number;
  suspended: number;
  resumed: number;
  packsCompleted: number;
  cancelledAtCycleEnd: number;
  errors: number;
}

const emptySummary = (): RunSummary => ({
  generated: 0, generatedCents: 0, issued: 0, issueFailed: 0, skippedPaused: 0, reminders: 0, notices: 0,
  blocked: 0, suspended: 0, resumed: 0, packsCompleted: 0, cancelledAtCycleEnd: 0, errors: 0,
});

export async function runCenterBilling(db: Firestore, c: CenterRun, deps: CenterBillingDeps): Promise<{summary: RunSummary; items: RunItem[]}> {
  const at = Timestamp.fromDate(deps.now());
  const summary = emptySummary();
  const items: RunItem[] = [];
  const push = (item: RunItem) => {
    if (items.length < MAX_RUN_ITEMS) items.push(item);
  };

  // 1) Pausa vencida volta sozinha.
  const paused = await c.ref.collection("enrollments").where("status", "==", "paused").get();
  for (const doc of paused.docs) {
    const until = str(doc.data()["pausedUntil"]);
    if (!until || until > c.today) continue;
    try {
      const resumed = await db.runTransaction(async (tx: Transaction) => {
        const cur = (await tx.get(doc.ref)).data();
        if (!cur || cur["status"] !== "paused" || str(cur["pausedUntil"]) !== until) return false;
        tx.update(doc.ref, {status: "active", pausedUntil: null, pauseReason: ""});
        tx.set(c.ref.collection("auditLogs").doc(), audit(at, SYSTEM, "enrollment.resumed", "enrollment", doc.id,
          `${str(cur["studentName"])} → ${str(cur["className"])} · pausa terminou em ${shortDay(until)}`));
        return true;
      });
      if (resumed) {
        summary.resumed += 1;
        push({subscriptionId: doc.id, name: str(doc.data()["studentName"]), kind: "resumed", detail: `pausa até ${shortDay(until)}`, cents: 0});
        // Mesmo efeito do gatilho, já, para o ciclo de hoje não ser pulado como pausado.
        await syncSubscriptionFromEnrollment(db, c.id, doc.id, deps.now());
      }
    } catch (e) {
      summary.errors += 1;
      logger.warn(`runCenterBilling ${c.id}: retomar ${doc.id} falhou`, e);
    }
  }

  // 2) Pacote vencido ou sem crédito.
  const active = await c.ref.collection("enrollments").where("status", "==", "active").get();
  for (const doc of active.docs) {
    const d = doc.data();
    const why = packFinished(d["contract"] as Data | undefined, d["creditsLeft"], c.today);
    if (!why) continue;
    try {
      const done = await endEnrollment(db, c.ref, doc.id, "completed", why === "expired" ? "pack_expired" : "pack_used",
        why === "expired" ? "pacote venceu · vaga liberada" : "créditos do pacote acabaram · vaga liberada", at);
      if (done) {
        summary.packsCompleted += 1;
        push({subscriptionId: doc.id, name: str(d["studentName"]), kind: "pack_completed", detail: why === "expired" ? "validade" : "sem crédito", cents: 0});
      }
    } catch (e) {
      summary.errors += 1;
      logger.warn(`runCenterBilling ${c.id}: concluir pacote ${doc.id} falhou`, e);
    }
  }

  // 3–5) Assinaturas.
  const subs = await c.ref.collection(SUBSCRIPTIONS).get();
  for (const doc of subs.docs) {
    const sub = doc.data();
    if (!LIVE.includes(str(sub["status"]))) continue;
    const name = str(sub["payerName"]) || str(sub["studentName"]);
    try {
      // 3) Cancela no fim do ciclo.
      const cancelAt = str(sub["cancelAt"]);
      if (sub["status"] === "canceling" && cancelAt && cancelAt <= c.today) {
        const done = await endEnrollment(db, c.ref, doc.id, "cancelled", "end_of_cycle", "cancelada no fim do ciclo · vaga liberada", at);
        await syncSubscriptionFromEnrollment(db, c.id, doc.id, deps.now());
        if (done) {
          summary.cancelledAtCycleEnd += 1;
          push({subscriptionId: doc.id, name, kind: "cancelled", detail: `fim do ciclo ${shortDay(cancelAt)}`, cents: 0});
        }
        continue;
      }
      // 4) D−3: ciclo(s) na janela (no máximo 2 por rodada — rodada perdida não empilha meses).
      for (let i = 0; i < 2; i++) {
        const g = await generateNextCycle(db, c, doc.id, at, SYSTEM.name);
        if (!g) break;
        if (g.kind === "skipped") {
          summary.skippedPaused += 1;
          push({subscriptionId: doc.id, name, kind: "skipped", detail: `${cycleLabel(g.cycle)} · pausada`, cents: 0});
          continue;
        }
        summary.generated += 1;
        summary.generatedCents += g.amountCents;
        push({subscriptionId: doc.id, name, kind: "generated", detail: `${cycleLabel(g.cycle)} · vence ${shortDay(g.dueDate)}`, cents: g.amountCents});
        const online = await issueOnline(db, c, g.invoiceId, g.amountCents, deps);
        if (online.url) summary.issued += 1;
        if (online.error) {
          summary.issueFailed += 1;
          push({subscriptionId: doc.id, name, kind: "issue_failed", detail: online.error, cents: g.amountCents});
        }
        if (g.dueDate >= c.today) {
          await sendNotice(db, c, doc.ref, sub, 0, {id: g.invoiceId, cycle: g.cycle, amountCents: g.amountCents, dueDate: g.dueDate, url: online.url}, deps);
          summary.reminders += 1;
        }
      }
      // 5) Régua.
      const debt = await refreshSubscriptionDebt(db, c, doc.id, deps, true);
      if (debt.notified !== null) {
        summary.notices += 1;
        push({subscriptionId: doc.id, name, kind: "notice", detail: STAGE_LABEL[debt.notified] ?? `estágio ${debt.notified}`, cents: 0});
      }
      if (debt.blocked && debt.notified === 4) {
        summary.blocked += 1;
        push({subscriptionId: doc.id, name, kind: "blocked", detail: "check-in com pendência", cents: 0});
      }
      if (debt.suspended) {
        summary.suspended += 1;
        push({subscriptionId: doc.id, name, kind: "suspended", detail: "vaga liberada", cents: 0});
      }
    } catch (e) {
      summary.errors += 1;
      logger.warn(`runCenterBilling ${c.id}: assinatura ${doc.id} falhou`, e);
    }
  }

  // 6) Resumo do dia (rodar de novo no mesmo dia soma o que fez a mais).
  const runRef = c.ref.collection("billingRuns").doc(c.today);
  await db.runTransaction(async (tx: Transaction) => {
    const prev = (await tx.get(runRef)).data();
    const prevSummary = (prev?.["summary"] ?? {}) as Data;
    const merged = Object.fromEntries(Object.entries(summary).map(([k, v]) => [k, num(prevSummary[k]) + v]));
    const prevItems = Array.isArray(prev?.["items"]) ? prev["items"] as unknown[] : [];
    tx.set(runRef, {
      date: c.today,
      ranAt: at,
      runs: num(prev?.["runs"]) + 1,
      online: c.online,
      summary: merged,
      items: [...prevItems, ...items].slice(-MAX_RUN_ITEMS),
    });
  });
  return {summary, items};
}

export async function runTrainingCenterBillingCore(db: Firestore, deps: CenterBillingDeps = defaultCenterBillingDeps): Promise<number> {
  const centers = await db.collection(TRAINING_CENTERS).where("status", "==", "active").get();
  let ran = 0;
  for (const doc of centers.docs) {
    try {
      const c = await loadCenter(db, doc.id, deps.now());
      if (!c) continue;
      const {summary} = await runCenterBilling(db, c, deps);
      ran += 1;
      if (summary.generated || summary.notices || summary.suspended || summary.errors) logger.info(`runTrainingCenterBilling ${doc.id}`, summary);
    } catch (e) {
      logger.error(`runTrainingCenterBilling ${doc.id} falhou`, e);
    }
  }
  return ran;
}

export const runTrainingCenterBilling = onSchedule({
  schedule: "0 6 * * *",
  timeZone: "America/Sao_Paulo",
  timeoutSeconds: 540,
  secrets: [...asaasArenaSecrets, WEB_PUSH_PUBLIC_KEY, WEB_PUSH_PRIVATE_KEY, WEB_PUSH_SUBJECT],
}, async () => {
  await runTrainingCenterBillingCore(getFirestore());
});

// ---------------------------------------------------------------------------
// Callables do portal
// ---------------------------------------------------------------------------

function parseSubInput(raw: unknown): {centerId: string; subscriptionId: string; d: Data} {
  const d = (raw && typeof raw === "object" ? raw : {}) as Data;
  const centerId = str(d["centerId"]);
  const subscriptionId = str(d["subscriptionId"]);
  if (!centerId || !subscriptionId || centerId.includes("/") || subscriptionId.includes("/")) {
    throw new HttpsError("invalid-argument", "Assinatura inválida.");
  }
  return {centerId, subscriptionId, d};
}

async function liveSub(db: Firestore, c: CenterRun, subId: string): Promise<Data> {
  const sub = (await c.ref.collection(SUBSCRIPTIONS).doc(subId).get()).data();
  if (!sub) throw new HttpsError("not-found", "Assinatura não encontrada.");
  if (!LIVE.includes(str(sub["status"]))) throw new HttpsError("failed-precondition", "Esta assinatura está encerrada.");
  return sub;
}

export interface ChangePlanResult {
  when: "now" | "next_cycle";
  chargedCents: number;
  invoiceId: string | null;
  invoiceUrl: string;
  effectiveFrom: string;
}

/**
 * Mudar de plano. `now`: o contrato muda hoje e a diferença dos dias que faltam no ciclo vira uma
 * cobrança avulsa (downgrade não devolve). `next_cycle`: agenda — a cobrança do próximo ciclo sai
 * com o preço novo. Com mensalidade vencida em aberto, só no próximo ciclo.
 */
export async function changeSubscriptionPlanCore(db: Firestore, uid: string | undefined, raw: unknown, deps: CenterBillingDeps = defaultCenterBillingDeps): Promise<ChangePlanResult> {
  const {centerId, subscriptionId, d} = parseSubInput(raw);
  const actor = await requireManager(db, uid, centerId);
  const c = await loadCenter(db, centerId, deps.now());
  if (!c) throw new HttpsError("not-found", "Centro não encontrado.");
  const when = d["when"] === "next_cycle" ? "next_cycle" : "now";
  const planId = str(d["planId"]);
  const sub = await liveSub(db, c, subscriptionId);
  const plan = planId ? (await c.ref.collection("plans").doc(planId).get()).data() : undefined;
  if (!plan || plan["status"] !== "active" || plan["type"] !== "monthly") {
    throw new HttpsError("failed-precondition", "Escolha um plano mensal ativo.");
  }
  const at = Timestamp.fromDate(deps.now());
  const change = {
    planId,
    planName: str(plan["name"]),
    priceCents: num(plan["priceCents"]),
    classesPerWeek: plan["classesPerWeek"] ?? null,
    makeupsPerMonth: plan["makeupsPerMonth"] ?? null,
    requestedAt: at,
    byName: actor.name,
  };
  const subRef = c.ref.collection(SUBSCRIPTIONS).doc(subscriptionId);

  if (when === "next_cycle") {
    const same = planId === str(sub["planId"]);
    await subRef.update({pendingPlanChange: same ? null : change, updatedAt: at});
    await c.ref.collection("auditLogs").add(audit(at, actor, same ? "subscription.plan_change_cleared" : "subscription.plan_change_scheduled", "subscription", subscriptionId,
      same ? `${str(sub["payerName"])} · mudança de plano desfeita` :
        `${str(sub["payerName"])} · ${str(sub["planName"])} → ${change.planName} a partir de ${shortDay(str(sub["nextChargeDate"]))}`));
    return {when, chargedCents: 0, invoiceId: null, invoiceUrl: "", effectiveFrom: str(sub["nextChargeDate"])};
  }

  if (planId === str(sub["planId"])) throw new HttpsError("failed-precondition", "A assinatura já está neste plano.");
  const open = await openInvoices(c, subscriptionId);
  const late = open.find((i) => i.dueDate < c.today);
  if (late) {
    throw new HttpsError("failed-precondition",
      `A mensalidade de ${cycleLabel(late.cycle)} está em aberto. Mude no próximo ciclo ou depois que ela for paga.`);
  }
  // Ciclo já gerado e ainda não vencido: ajusta o valor se ainda não saiu fatura no provedor.
  const upcoming = open.find((i) => i.dueDate >= c.today) ?? null;
  if (upcoming?.url) {
    throw new HttpsError("failed-precondition",
      `A cobrança de ${cycleLabel(upcoming.cycle)} já foi enviada ao aluno. Mude no próximo ciclo ou cancele essa cobrança antes.`);
  }
  const billingDay = num(sub["billingDay"], c.billing.billingDay);
  const periodEnd = upcoming ? upcoming.dueDate : str(sub["nextChargeDate"]);
  const pr = planChangeProration(num(sub["priceCents"]), change.priceCents, c.today, periodEnd, billingDay);
  const chargeId = `${subscriptionId}_plano_${c.today}`;
  const enrRef = c.ref.collection("enrollments").doc(subscriptionId);

  await db.runTransaction(async (tx: Transaction) => {
    const cur = (await tx.get(subRef)).data();
    const enr = (await tx.get(enrRef)).data();
    const chargeRef = c.ref.collection("invoices").doc(chargeId);
    const chargeSnap = await tx.get(chargeRef);
    const upRef = upcoming ? c.ref.collection("invoices").doc(upcoming.id) : null;
    const up = upRef ? (await tx.get(upRef)).data() : undefined;
    if (!cur || !LIVE.includes(str(cur["status"])) || !enr) throw new HttpsError("failed-precondition", "A assinatura mudou. Recarregue e tente de novo.");
    if (chargeSnap.exists) throw new HttpsError("already-exists", "Já houve uma mudança de plano hoje nesta assinatura.");
    const reference = `Diferença de plano · ${str(cur["planName"])} → ${change.planName}`;
    if (pr.cents > 0) {
      tx.set(chargeRef, {
        studentId: str(cur["studentId"]) || null,
        enrollmentId: subscriptionId,
        subscriptionId,
        cycle: cycleKey(c.today),
        payerName: str(cur["payerName"]),
        reference,
        amountCents: pr.cents,
        dueDate: c.today,
        status: "pending",
        method: null,
        providerRef: "",
        lateFees: null,
        events: [{at, type: "created", title: "Cobrança criada", byName: actor.name,
          detail: `${brlFromCents(pr.cents)} · (${brlFromCents(num(cur["priceCents"]))} → ${brlFromCents(change.priceCents)}) × ${pr.days}/${pr.cycleDays} dias`}],
        approvedAt: null,
        refundedCents: 0,
        createdAt: at,
      });
    }
    if (upRef && up && up["status"] === "pending" && !str(up["providerRef"])) {
      tx.update(upRef, {
        amountCents: change.priceCents,
        reference: invoiceReference({planName: change.planName, planType: "monthly"}, str(up["dueDate"])),
        events: [...(Array.isArray(up["events"]) ? up["events"] as unknown[] : []),
          {at, type: "note", title: "Valor ajustado", detail: `Plano mudou para ${change.planName} · ${brlFromCents(change.priceCents)}`, byName: actor.name}],
      });
    }
    tx.update(subRef, {planId, planName: change.planName, priceCents: change.priceCents, pendingPlanChange: null, updatedAt: at});
    tx.update(enrRef, {planId, contract: contractWith(enr["contract"], change)});
    tx.set(c.ref.collection("auditLogs").doc(), audit(at, actor, "subscription.plan_changed", "subscription", subscriptionId,
      `${str(cur["payerName"])} · ${str(cur["planName"])} → ${change.planName} · agora` + (pr.cents > 0 ? ` · proporcional ${brlFromCents(pr.cents)} (${pr.days}/${pr.cycleDays} dias)` : "")));
  });

  let invoiceUrl = "";
  if (pr.cents > 0) {
    const online = await issueOnline(db, c, chargeId, pr.cents, deps, actor);
    invoiceUrl = online.url;
  }
  return {when, chargedCents: pr.cents, invoiceId: pr.cents > 0 ? chargeId : null, invoiceUrl, effectiveFrom: c.today};
}

export interface ChargeNowResult {
  invoiceId: string;
  invoiceUrl: string;
  generated: boolean;
  /** Por que não saiu fatura no provedor (vazio = saiu, ou recebimento desconectado). */
  issueError: string;
}

/**
 * "Cobrar agora": a cobrança em aberto mais antiga vai para o provedor e o aluno recebe o aviso;
 * sem nada em aberto, antecipa a cobrança do próximo ciclo.
 */
export async function chargeSubscriptionNowCore(db: Firestore, uid: string | undefined, raw: unknown, deps: CenterBillingDeps = defaultCenterBillingDeps): Promise<ChargeNowResult> {
  const {centerId, subscriptionId} = parseSubInput(raw);
  const actor = await requireManager(db, uid, centerId);
  const c = await loadCenter(db, centerId, deps.now());
  if (!c) throw new HttpsError("not-found", "Centro não encontrado.");
  const sub = await liveSub(db, c, subscriptionId);
  if (sub["status"] === "paused") throw new HttpsError("failed-precondition", "A assinatura está pausada.");
  const at = Timestamp.fromDate(deps.now());

  let open = (await openInvoices(c, subscriptionId))[0] ?? null;
  let generated = false;
  if (!open) {
    const g = await generateNextCycle(db, c, subscriptionId, at, actor.name, true);
    if (!g || g.kind !== "generated") throw new HttpsError("failed-precondition", "Não há ciclo a cobrar nesta assinatura.");
    generated = true;
    open = {id: g.invoiceId, dueDate: g.dueDate, amountCents: g.amountCents, cycle: g.cycle, url: ""};
  }
  let url = open.url;
  let issueError = "";
  if (!url) {
    try {
      const online = await issueOnline(db, c, open.id, open.amountCents, deps, actor);
      url = online.url;
      issueError = online.error;
    } catch (e) {
      throw asaasFailure(e, "Não foi possível gerar a cobrança online. Tente de novo.");
    }
  }
  const late = open.dueDate < c.today;
  const stage: DunningStage = late ? Math.max(1, dunningStage(daysBetween(open.dueDate, c.today), c.billing)) as DunningStage : 0;
  await sendNotice(db, c, c.ref.collection(SUBSCRIPTIONS).doc(subscriptionId), sub, stage, {...open, url}, deps);
  await c.ref.collection("auditLogs").add(audit(at, actor, "subscription.charge_now", "subscription", subscriptionId,
    `${str(sub["payerName"])} · ${cycleLabel(open.cycle)} · ${brlFromCents(open.amountCents)}` + (generated ? " · ciclo antecipado" : "") + (url ? " · link enviado" : "")));
  return {invoiceId: open.id, invoiceUrl: url, generated, issueError};
}

const CALL_OPTS = {
  region: CLIENT_FACING_REGIONS,
  secrets: [...asaasArenaSecrets, WEB_PUSH_PUBLIC_KEY, WEB_PUSH_PRIVATE_KEY, WEB_PUSH_SUBJECT],
};

export const changeTrainingCenterSubscriptionPlan = onCall(CALL_OPTS, async (request: CallableRequest) =>
  changeSubscriptionPlanCore(getFirestore(), request.auth?.uid, request.data));

export const chargeTrainingCenterSubscriptionNow = onCall(CALL_OPTS, async (request: CallableRequest) =>
  chargeSubscriptionNowCore(getFirestore(), request.auth?.uid, request.data));
