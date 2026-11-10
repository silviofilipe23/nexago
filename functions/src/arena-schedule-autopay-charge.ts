/**
 * Planos de horário — débito automático no cartão salvo (parte 2: a cobrança com token).
 * Spec: `docs/superpowers/specs/2026-11-09-arena-planos-debito-automatico-cartao-design.md`.
 *
 * - `runScheduleTokenCharge`: reivindica a tentativa numa transação, cobra o token fora dela e fecha
 *   pelo caminho do webhook. 1ª recusa → `retry` amanhã; 2ª → `failed` + link.
 * - `chargeArenaScheduleAutopay` (06:00): aviso D-3 + débito das vencidas.
 * - `recoverScheduleAutopay` (varredura de 30 min): destrava `charging`, põe o link nas esquecidas e
 *   repara mensalidade que saiu do débito sem ganhar o link.
 *
 * Toda escrita em `autopay.*` da mensalidade confere `autopay.attemptId`: a pausa regrava a
 * mensalidade no mesmo id, e uma tentativa velha não pode mexer no doc novo.
 * Número e CVV nunca passam por aqui: só o token (via `asaas-saved-card.ts`).
 */
import {randomUUID} from "node:crypto";
import * as logger from "firebase-functions/logger";
import {onSchedule} from "firebase-functions/v2/scheduler";
import {FieldValue, getFirestore, Timestamp, type Firestore, type Transaction} from "firebase-admin/firestore";
import {
  ARENA_SCHEDULE_ASAAS_PAYMENTS,
  ARENA_SCHEDULE_CHARGES,
  ARENA_SCHEDULE_SUBSCRIPTIONS,
  ATHLETE_PLANS_URL,
  AUTOPAY_WINDOW_STATES,
  SCHEDULE_PAYMENT_REF_PREFIX,
  autopayOf,
  parseScheduleSettings,
  str,
  type AutopayState,
} from "./arena-schedule-plan-constants";
import {scheduleOnlineBillingOn, scheduleSettingsRef} from "./arena-schedule-plans";
import {assertAsaasAllowed, ensureScheduleChargeLinkGroup, scheduleAsaasGroupData} from "./arena-schedule-asaas";
import {scheduleAutopayFlagOn} from "./arena-schedule-autopay";
import {chargeAsaasMirror} from "./arena-class-asaas-model";
import {monthLabelPt} from "./arena-class-billing";
import {addDaysToDateKey} from "./arena-recurring-booking";
import {AsaasApiError, asaasArenaSecrets, getAsaasEnvTag} from "./asaas-client";
import {createAsaasTokenCardCharge, getAsaasPayment, type AsaasPaymentDetails} from "./asaas-booking-payment";
import {processArenaScheduleAsaasNotification} from "./asaas-arena-schedule-webhook";
import {cardSurcharge, loadCardFeeTerms, type CardFeeTerms} from "./card-anticipation-fee";
import {cardValidForDueDate, readSavedCardTx, resolveScheduleCustomer, type SavedCard} from "./asaas-saved-card";
import {dayKeyFromEventDate} from "./event-timezone";
import {getFirebaseProjectId} from "./firebase-paths";
import {deliverNotificationToUser, WEB_PUSH_PRIVATE_KEY, WEB_PUSH_PUBLIC_KEY, WEB_PUSH_SUBJECT} from "./notification-delivery";

type Data = Record<string, unknown>;
type AsaasEnv = "sandbox" | "production";

export interface AutopayDeps {
  /** Cliente Asaas do atleta (só se o cartão salvo não trouxer o dele). */
  resolveCustomer(uid: string): Promise<string | null>;
  cardFeeTerms(): Promise<CardFeeTerms>;
  createTokenCharge(input: {
    groupId: string; attemptId: string; customerId: string; valueReais: number; description: string;
    creditCardToken: string; remoteIp: string;
  }): Promise<{paymentId: string; status: string}>;
  getPayment(paymentId: string): Promise<AsaasPaymentDetails>;
  /** Fecha o pagamento pelo caminho do webhook (paga a mensalidade ou estorna). */
  settle(db: Firestore, paymentId: string, payment: AsaasPaymentDetails): Promise<void>;
  notify(input: {userId: string; title: string; body: string; type: string; data: Record<string, string>}): Promise<void>;
  now(): Date;
  envTag(): AsaasEnv;
  newAttemptId(): string;
}

export type TokenChargeOutcome =
  | {outcome: "paid"}
  | {outcome: "refused"; message: string}
  | {outcome: "skipped"; reason: string}
  | {outcome: "busy"};

/** Doc de processados do webhook para um pagamento (o mesmo do roteador `asaas-webhook.ts`). */
export function scheduleProcessedRef(db: Firestore, paymentId: string) {
  return db.doc(`artifacts/${getFirebaseProjectId()}/public/data/asaas_processed_payments/${paymentId}`);
}

export const defaultAutopayDeps: AutopayDeps = {
  resolveCustomer: (uid) => resolveScheduleCustomer(uid),
  cardFeeTerms: () => loadCardFeeTerms(),
  createTokenCharge: async (input) => {
    assertAsaasAllowed();
    return createAsaasTokenCardCharge({
      customerId: input.customerId,
      valueReais: input.valueReais,
      description: input.description,
      externalReference: `${SCHEDULE_PAYMENT_REF_PREFIX}${input.groupId}:t${input.attemptId}`,
      // Única por tentativa: repetir a MESMA tentativa (travada) devolve a mesma cobrança.
      idempotencyKey: `schedule-token-${getAsaasEnvTag()}-${input.attemptId}`,
      creditCardToken: input.creditCardToken,
      remoteIp: input.remoteIp,
    });
  },
  getPayment: (paymentId) => {
    assertAsaasAllowed();
    return getAsaasPayment(paymentId);
  },
  settle: (db, paymentId, payment) =>
    processArenaScheduleAsaasNotification(db, paymentId, payment, scheduleProcessedRef(db, paymentId)),
  notify: async (input) => {
    await deliverNotificationToUser({...input, requireInteraction: false});
  },
  now: () => new Date(),
  envTag: () => getAsaasEnvTag(),
  newAttemptId: () => randomUUID().replace(/-/g, "").slice(0, 20),
};

/** Grupo em que a cobrança com token pode entrar (o do espelho, se ainda cobra a mensalidade). */
const LIVE_GROUP_STATES = new Set(["pending", "creating", "open", "failed", "autopay"]);
const PAID_STATUSES = new Set(["CONFIRMED", "RECEIVED"]);
/** Cobrança com token que não foi capturada: removida ou vencida (vence no próprio dia). */
const NOT_CAPTURED_STATUSES = new Set(["OVERDUE"]);
/** `charging` mais velho que isso é retomado pela varredura; tentativa mais nova que isso está em voo. */
const STUCK_CHARGING_MS = 15 * 60_000;
/** Tentativa sem desfecho depois disso vira recusa (cai no `retry`/`failed` + link). */
const MAX_ATTEMPT_AGE_MS = 24 * 60 * 60_000;
const DUE_BATCH = 300;
const STUCK_MESSAGE = "Pagamento não confirmado.";
const NOT_CAPTURED_MESSAGE = "Pagamento não aprovado.";

/** O que a tentativa precisa depois da transação (e a recuperação remonta a partir do grupo). */
interface Attempt {
  chargeId: string;
  groupId: string;
  attemptId: string;
  source: "autopay" | "manual";
  payer: string;
  last4: string;
  chargedReais: number;
}

type Claim =
  | {kind: "go"; attempt: Attempt; card: SavedCard; description: string}
  | {kind: "skip"; reason: string; link: boolean}
  | {kind: "busy"};

function groupsCol(db: Firestore) {
  return db.collection(ARENA_SCHEDULE_ASAAS_PAYMENTS);
}

function chargeRefOf(db: Firestore, chargeId: string) {
  return db.collection(ARENA_SCHEDULE_CHARGES).doc(chargeId);
}

function mapOf(v: unknown): Data {
  return v != null && typeof v === "object" ? v as Data : {};
}

function millisOf(v: unknown): number {
  if (v instanceof Timestamp) return v.toMillis();
  if (v instanceof Date) return v.getTime();
  return 0;
}

function brlPlain(value: number): string {
  return value.toFixed(2).replace(".", ",");
}

function inWindow(charge: Data | undefined): boolean {
  return AUTOPAY_WINDOW_STATES.has(str(autopayOf(charge)["state"]) as AutopayState);
}

/** O `autopay` da mensalidade é desta tentativa (e não de um doc regravado pela pausa)? */
function ownsAutopay(charge: Data | undefined, attemptId: string): boolean {
  const ap = autopayOf(charge);
  return ap["state"] === "charging" && str(ap["attemptId"]) === attemptId;
}

/** Outra tentativa (manual) ainda em voo no grupo. */
function attemptInFlight(group: Data | undefined, nowMs: number, except?: string): boolean {
  return Object.entries(mapOf(group?.["tokenCharges"])).some(([id, t]) =>
    id !== except && mapOf(t)["status"] === "charging" && nowMs - millisOf(mapOf(t)["at"]) < STUCK_CHARGING_MS);
}

function chargedFor(baseReais: number, terms: CardFeeTerms) {
  const surcharge = cardSurcharge(baseReais, terms);
  return {
    feeCents: surcharge.totalCents,
    processingCents: surcharge.processingCents,
    chargedReais: (Math.round(baseReais * 100) + surcharge.totalCents) / 100,
  };
}

/** O link não pode derrubar quem chamou: falhou, a rede de segurança da varredura repara. */
async function ensureLinkQuietly(db: Firestore, chargeId: string): Promise<boolean> {
  try {
    await ensureScheduleChargeLinkGroup(db, chargeId);
    return true;
  } catch (e) {
    logger.error(`débito automático ${chargeId}: link de pagamento não foi gerado — a varredura tenta de novo`, e);
    return false;
  }
}

/** Por que a tentativa não pode sair (null = pode). */
function ineligibleReason(source: "autopay" | "manual", input: {
  charge: Data; sub: Data; payer: string; card: SavedCard | null; flagOn: boolean; arenaOnline: boolean;
}): string | null {
  const {charge, card} = input;
  if (charge["status"] !== "open" || charge["billingMode"] !== "asaas") return "charge_resolved";
  if (source === "autopay" && mapOf(mapOf(input.sub["autopay"])[input.payer])["enabled"] !== true) return "autopay_off";
  // Sem o IP de quando o cartão foi salvo o Asaas não aceita a cobrança: conta como sem cartão.
  if (!card || !card.remoteIp) return "no_card";
  if (source === "autopay" && !cardValidForDueDate(card, str(charge["dueDate"]))) return "card_expired";
  if (!input.flagOn) return "flag_off";
  if (source === "autopay" && !input.arenaOnline) return "arena_offline";
  return null;
}

/** Passo 1: reivindica a tentativa (ou a retoma) numa transação. Nunca chama o Asaas. */
async function claimTokenCharge(
  db: Firestore,
  chargeId: string,
  source: "autopay" | "manual",
  deps: AutopayDeps,
  terms: CardFeeTerms,
  opts: {uid?: string; resumeAttemptId?: string},
): Promise<Claim> {
  const chargeRef = chargeRefOf(db, chargeId);
  const now = deps.now();
  const today = dayKeyFromEventDate(now);
  const resumeId = source === "autopay" ? opts.resumeAttemptId : undefined;
  return db.runTransaction(async (tx: Transaction): Promise<Claim> => {
    const snap = await tx.get(chargeRef);
    const charge = snap.data() as Data | undefined;
    if (!snap.exists || !charge) return {kind: "skip", reason: "charge_missing", link: false};
    const ap = autopayOf(charge);
    const state = str(ap["state"]);
    if (resumeId) {
      if (!ownsAutopay(charge, resumeId)) return {kind: "skip", reason: "not_charging", link: false};
    } else if (state === "charging") {
      return {kind: "busy"};
    } else if (source === "autopay") {
      if (state !== "scheduled" && state !== "retry") return {kind: "skip", reason: `state_${state || "none"}`, link: false};
      if (str(ap["scheduledFor"]) > today) return {kind: "skip", reason: "not_due", link: false};
    }

    const payer = (source === "manual" ? opts.uid : undefined) ?? str(charge["payerAthleteId"]);
    const arenaId = str(charge["arenaId"]) || "_";
    const currentGroupId = str(mapOf(charge["asaas"])["groupId"]);
    const [subSnap, arenaSnap, settingsSnap, groupSnap] = await Promise.all([
      tx.get(db.collection(ARENA_SCHEDULE_SUBSCRIPTIONS).doc(str(charge["subscriptionId"]) || "_")),
      tx.get(db.collection("arenas").doc(arenaId)),
      tx.get(scheduleSettingsRef(db, arenaId)),
      tx.get(groupsCol(db).doc(currentGroupId || "_")),
    ]);
    const flagOn = await scheduleAutopayFlagOn(db, tx);
    const card = payer ? await readSavedCardTx(tx, db, payer, deps.envTag()) : null;
    const sub = (subSnap.data() ?? {}) as Data;
    const settings = parseScheduleSettings(settingsSnap.exists ? settingsSnap.data() as Data : undefined);
    const group = currentGroupId && groupSnap.exists ? groupSnap.data() as Data : undefined;
    const live = group != null && LIVE_GROUP_STATES.has(str(group["state"]));

    // Pagamento na mão em voo neste grupo: o débito espera a próxima rodada (sem gravar nada).
    if (source === "autopay" && live && attemptInFlight(group, now.getTime(), resumeId)) return {kind: "busy"};
    const resumed = resumeId ? mapOf(mapOf(group?.["tokenCharges"])[resumeId]) : undefined;
    if (resumed && (resumed["status"] !== "charging" || str(resumed["paymentId"]))) {
      return {kind: "skip", reason: "not_charging", link: false};
    }
    const reason = ineligibleReason(source, {
      charge, sub, payer, card, flagOn,
      arenaOnline: scheduleOnlineBillingOn(settings, (arenaSnap.data() ?? {}) as Data),
    }) ?? (resumeId && !live ? "charge_resolved" : null);
    if (reason) {
      if (source === "manual") return {kind: "skip", reason, link: false};
      tx.set(chargeRef, {autopay: {state: "skipped", lastError: reason}}, {merge: true});
      if (resumeId && group) {
        tx.set(groupsCol(db).doc(currentGroupId), {
          tokenCharges: {[resumeId]: {status: "abandoned", error: reason}}, updatedAt: FieldValue.serverTimestamp(),
        }, {merge: true});
      }
      return {kind: "skip", reason, link: true};
    }

    let groupId = currentGroupId;
    let groupData = group ?? {};
    if (!live) {
      const ref = groupsCol(db).doc();
      groupId = ref.id;
      groupData = {
        ...scheduleAsaasGroupData(chargeId, charge, {customerAthleteId: payer, arenaName: str(sub["arenaName"])}),
        state: "autopay",
      };
      tx.set(ref, groupData);
      tx.set(chargeRef, {asaas: chargeAsaasMirror(groupId, "autopay")}, {merge: true});
    }
    const attemptId = resumeId ?? deps.newAttemptId();
    // Retomada: mesmo corpo da 1ª ida (a chave de idempotência do Asaas é a mesma); o `at` não muda.
    const amounts = resumed ?
      {chargedReais: Number(resumed["chargedReais"] ?? 0)} :
      chargedFor(Number(groupData["amountReais"] ?? charge["amountReais"] ?? 0), terms);
    if (!resumed) {
      tx.set(groupsCol(db).doc(groupId), {
        tokenCharges: {[attemptId]: {
          paymentId: null, source, status: "charging", error: null, ...amounts, at: Timestamp.fromDate(now),
        }},
        updatedAt: FieldValue.serverTimestamp(),
      }, {merge: true});
    }
    if (source === "autopay") {
      tx.set(chargeRef, {autopay: {
        state: "charging", attemptId, attempts: Number(ap["attempts"] ?? 0) + (resumed ? 0 : 1),
        lastAttemptAt: Timestamp.fromDate(now), chargedReais: amounts.chargedReais,
      }}, {merge: true});
    }
    return {
      kind: "go",
      card: card!,
      description: str(groupData["description"]) || "Mensalidade",
      attempt: {
        chargeId, groupId, attemptId, source, payer, last4: card!.last4, chargedReais: amounts.chargedReais,
      },
    };
  });
}

/**
 * Cobra a mensalidade no cartão salvo. `autopay`: o débito do vencimento (exige a fila
 * `scheduled`/`retry`; `resumeAttemptId` repete uma tentativa travada com a mesma chave).
 * `manual`: o "Pagar com cartão salvo" (não conta como tentativa, recusa não mexe em `autopay`).
 */
export async function runScheduleTokenCharge(
  db: Firestore,
  chargeId: string,
  source: "autopay" | "manual",
  deps: AutopayDeps,
  opts: {uid?: string; resumeAttemptId?: string} = {},
): Promise<TokenChargeOutcome> {
  const terms = await deps.cardFeeTerms();
  const claim = await claimTokenCharge(db, chargeId, source, deps, terms, opts);
  if (claim.kind === "busy") return {outcome: "busy"};
  if (claim.kind === "skip") {
    if (claim.link) await ensureLinkQuietly(db, chargeId);
    return {outcome: "skipped", reason: claim.reason};
  }
  const {attempt, card} = claim;
  let created: {paymentId: string; status: string};
  try {
    const customerId = card.customerId || await deps.resolveCustomer(attempt.payer);
    if (!customerId) return await refuseTokenCharge(db, attempt, "Cliente Asaas não encontrado.", deps);
    created = await deps.createTokenCharge({
      groupId: attempt.groupId, attemptId: attempt.attemptId, customerId, valueReais: attempt.chargedReais,
      description: claim.description, creditCardToken: card.creditCardToken, remoteIp: card.remoteIp,
    });
  } catch (e) {
    if (e instanceof AsaasApiError && e.httpStatus === 400) return refuseTokenCharge(db, attempt, e.message, deps);
    // Sem desfecho (rede, 5xx, 401…): segue `charging`; a recuperação repete com a mesma chave até 24 h.
    logger.warn(`runScheduleTokenCharge ${chargeId}: tentativa ${attempt.attemptId} sem resposta`, {
      error: e instanceof Error ? e.message : String(e),
    });
    return {outcome: "busy"};
  }
  await groupsCol(db).doc(attempt.groupId).set({
    tokenCharges: {[attempt.attemptId]: {paymentId: created.paymentId}}, updatedAt: FieldValue.serverTimestamp(),
  }, {merge: true});
  // Status diferente (raro com token): fica `charging` para a recuperação consultar.
  if (!PAID_STATUSES.has(created.status.toUpperCase())) return {outcome: "busy"};
  return settleTokenCharge(db, attempt, created.paymentId, deps);
}

/**
 * Passo 3: fecha pelo webhook e só então marca o estado. Pago por esta cobrança → `paid`; estornado
 * (o webhook decidiu `refund_stale`) ou mensalidade fora de "em aberto" → `refunded`; senão segue
 * `charging` (`busy`) para a recuperação consultar de novo.
 */
async function settleTokenCharge(
  db: Firestore,
  attempt: Attempt,
  paymentId: string,
  deps: AutopayDeps,
  payment?: AsaasPaymentDetails,
): Promise<TokenChargeOutcome> {
  try {
    await deps.settle(db, paymentId, payment ?? await deps.getPayment(paymentId));
  } catch (e) {
    logger.error(`runScheduleTokenCharge ${attempt.chargeId}: baixa de ${paymentId} falhou — fica para a recuperação`, e);
    return {outcome: "busy"};
  }
  const chargeRef = chargeRefOf(db, attempt.chargeId);
  const result = await db.runTransaction(async (tx: Transaction) => {
    const fresh = ((await tx.get(chargeRef)).data() ?? {}) as Data;
    const processed = (await tx.get(scheduleProcessedRef(db, paymentId))).data() ?? {};
    const paid = fresh["status"] === "paid" && fresh["asaasPaymentId"] === paymentId;
    const refunded = !paid && (processed["outcome"] === "refund_stale" || fresh["status"] !== "open");
    if (!paid && !refunded) return null;
    tx.set(groupsCol(db).doc(attempt.groupId), {
      tokenCharges: {[attempt.attemptId]: {status: paid ? "paid" : "refunded"}}, updatedAt: FieldValue.serverTimestamp(),
    }, {merge: true});
    const ap = autopayOf(fresh);
    // Pago: grava por cima (o gatilho pode ter pulado o agendamento ao sair de "em aberto").
    const ownsPaid = attempt.source === "autopay" ? str(ap["attemptId"]) === attempt.attemptId : str(ap["state"]) !== "";
    if (paid && ownsPaid) {
      tx.set(chargeRef, {autopay: {state: "paid"}}, {merge: true});
    } else if (!paid && attempt.source === "autopay" && ownsAutopay(fresh, attempt.attemptId)) {
      tx.set(chargeRef, {autopay: {state: "skipped", lastError: "charge_resolved"}}, {merge: true});
    }
    return {paid, charge: fresh};
  });
  if (!result) return {outcome: "busy"};
  if (!result.paid) return {outcome: "skipped", reason: "charge_resolved"};
  const charge = result.charge;
  await notifyAutopay(deps, attempt.payer, attempt.chargeId, charge, "schedule_plan_autopay_paid", "Mensalidade paga",
    `Plano ${str(charge["planName"]) || "de horário"} · ${monthLabelPt(str(charge["period"]))}: ` +
    `R$ ${brlPlain(attempt.chargedReais)} no cartão final ${attempt.last4}.`);
  return {outcome: "paid"};
}

/**
 * Passo 4: recusa. A tentativa do grupo vira `refused` (se ainda `charging`). `autopay` desta
 * tentativa: 1ª → `retry` amanhã; 2ª → `failed` + link + push. `manual`: não mexe em `autopay`, mas
 * um grupo `autopay` que ela criou fora da janela do débito ganha o link.
 */
async function refuseTokenCharge(
  db: Firestore,
  attempt: Attempt,
  message: string,
  deps: AutopayDeps,
): Promise<TokenChargeOutcome> {
  const error = message.slice(0, 300);
  const chargeRef = chargeRefOf(db, attempt.chargeId);
  const groupRef = groupsCol(db).doc(attempt.groupId || "_");
  const next = await db.runTransaction(async (tx: Transaction) => {
    const charge = (await tx.get(chargeRef)).data() as Data | undefined;
    const groupSnap = await tx.get(groupRef);
    const group = groupSnap.exists ? groupSnap.data() as Data : undefined;
    if (mapOf(mapOf(group?.["tokenCharges"])[attempt.attemptId])["status"] === "charging") {
      tx.set(groupRef, {
        tokenCharges: {[attempt.attemptId]: {status: "refused", error}}, updatedAt: FieldValue.serverTimestamp(),
      }, {merge: true});
    }
    if (attempt.source === "manual") {
      const orphan = group?.["state"] === "autopay" && charge?.["status"] === "open" &&
        charge["billingMode"] === "asaas" && !inWindow(charge);
      return orphan ? "link" : null;
    }
    if (!ownsAutopay(charge, attempt.attemptId)) return null;
    if (charge?.["status"] !== "open") {
      tx.set(chargeRef, {autopay: {state: "skipped", lastError: "charge_resolved"}}, {merge: true});
      return "skipped";
    }
    if (Number(autopayOf(charge)["attempts"] ?? 0) < 2) {
      const tomorrow = addDaysToDateKey(dayKeyFromEventDate(deps.now()), 1);
      tx.set(chargeRef, {autopay: {state: "retry", scheduledFor: tomorrow, lastError: error}}, {merge: true});
      return "retry";
    }
    tx.set(chargeRef, {autopay: {state: "failed", lastError: error}}, {merge: true});
    return "failed";
  });
  if (next === "failed" || next === "link") await ensureLinkQuietly(db, attempt.chargeId);
  if (next === "failed") {
    const charge = ((await chargeRef.get()).data() ?? {}) as Data;
    await notifyAutopay(deps, attempt.payer, attempt.chargeId, charge, "schedule_plan_autopay_failed", "Não conseguimos debitar",
      `Não conseguimos debitar R$ ${brlPlain(attempt.chargedReais)} no cartão final ${attempt.last4}. Pague por Pix ou cartão.`);
  }
  return {outcome: "refused", message: error};
}

async function notifyAutopay(
  deps: AutopayDeps, userId: string, chargeId: string, charge: Data, type: string, title: string, body: string,
): Promise<void> {
  if (!userId) return;
  try {
    await deps.notify({
      userId, title, body, type,
      data: {chargeId, subscriptionId: str(charge["subscriptionId"]), arenaId: str(charge["arenaId"]), url: ATHLETE_PLANS_URL},
    });
  } catch (e) {
    logger.warn(`débito automático ${chargeId}: push ${type} falhou`, e);
  }
}

/** Aviso D-3 (uma vez por mensalidade): grava `upcomingSentAt` antes do push. */
async function sendAutopayUpcoming(db: Firestore, chargeId: string, target: string, terms: CardFeeTerms, deps: AutopayDeps) {
  const ref = chargeRefOf(db, chargeId);
  const charge = await db.runTransaction(async (tx: Transaction) => {
    const data = (await tx.get(ref)).data() as Data | undefined;
    const ap = autopayOf(data);
    if (!data || data["status"] !== "open" || ap["state"] !== "scheduled" || ap["scheduledFor"] !== target ||
      ap["upcomingSentAt"] != null) return null;
    tx.set(ref, {autopay: {upcomingSentAt: Timestamp.fromDate(deps.now())}}, {merge: true});
    return data;
  });
  if (!charge) return false;
  const [, mm, dd] = target.split("-");
  const {chargedReais} = chargedFor(Number(charge["amountReais"] ?? 0), terms);
  await notifyAutopay(deps, str(charge["payerAthleteId"]), chargeId, charge, "schedule_plan_autopay_upcoming",
    "Débito automático em 3 dias",
    `Dia ${dd}/${mm} vamos debitar R$ ${brlPlain(chargedReais)} no cartão final ${str(autopayOf(charge)["last4"])} ` +
    `(plano ${str(charge["planName"]) || "de horário"}).`);
  return true;
}

/**
 * Rodada diária: (a) aviso D-3 das agendadas; (b) débito das `scheduled`/`retry` vencidas, em série.
 * `charged` = mensalidades processadas em (b); `failed` = sem desfecho ou erro (ficam para a recuperação).
 */
export async function chargeScheduleAutopayDue(
  db: Firestore,
  now: Date,
  deps: AutopayDeps,
): Promise<{upcoming: number; charged: number; paid: number; refused: number; failed: number; skipped: number}> {
  const out = {upcoming: 0, charged: 0, paid: 0, refused: 0, failed: 0, skipped: 0};
  const runDeps: AutopayDeps = {...deps, now: () => now};
  const today = dayKeyFromEventDate(now);
  const col = db.collection(ARENA_SCHEDULE_CHARGES);

  const target = addDaysToDateKey(today, 3);
  const soon = await col.where("autopay.state", "==", "scheduled").where("autopay.scheduledFor", "==", target).get();
  let terms: CardFeeTerms | null = null;
  for (const doc of soon.docs) {
    if (autopayOf(doc.data() as Data)["upcomingSentAt"] != null) continue;
    try {
      terms ??= await deps.cardFeeTerms();
      if (await sendAutopayUpcoming(db, doc.id, target, terms, runDeps)) out.upcoming += 1;
    } catch (e) {
      logger.warn(`chargeScheduleAutopayDue: aviso de ${doc.id} falhou`, e);
    }
  }

  const due = await col.where("autopay.state", "in", ["scheduled", "retry"])
    .where("autopay.scheduledFor", "<=", today).limit(DUE_BATCH).get();
  for (const doc of due.docs) {
    out.charged += 1;
    try {
      const result = await runScheduleTokenCharge(db, doc.id, "autopay", runDeps);
      if (result.outcome === "paid") out.paid += 1;
      else if (result.outcome === "refused") out.refused += 1;
      else if (result.outcome === "skipped") out.skipped += 1;
      else out.failed += 1;
    } catch (e) {
      out.failed += 1;
      logger.error(`chargeScheduleAutopayDue: débito de ${doc.id} falhou`, e);
    }
  }
  return out;
}

/**
 * Destrava uma `charging` antiga. Com `paymentId`: consulta (pago → baixa; não capturado → recusa).
 * Sem: repete o POST da mesma tentativa. Tentativa com mais de 24 h, ou nenhuma em voo, vira recusa.
 */
async function resumeStuckCharge(db: Firestore, chargeId: string, charge: Data, deps: AutopayDeps): Promise<boolean> {
  const ap = autopayOf(charge);
  const groupId = str(mapOf(charge["asaas"])["groupId"]);
  const tokenCharges = mapOf((groupId ? (await groupsCol(db).doc(groupId).get()).data() : undefined)?.["tokenCharges"]);
  const ownId = str(ap["attemptId"]);
  const entry = ownId ?
    (mapOf(tokenCharges[ownId])["status"] === "charging" ? [ownId, mapOf(tokenCharges[ownId])] as const : undefined) :
    Object.entries(tokenCharges).map(([id, t]) => [id, mapOf(t)] as const)
      .find(([, t]) => t["status"] === "charging" && t["source"] === "autopay");
  const attempt: Attempt = {
    chargeId, groupId, attemptId: entry ? entry[0] : ownId, source: "autopay", payer: str(charge["payerAthleteId"]),
    last4: str(ap["last4"]), chargedReais: Number(entry?.[1]["chargedReais"] ?? ap["chargedReais"] ?? 0),
  };
  if (!entry) {
    logger.warn(`recoverScheduleAutopay ${chargeId}: em charging sem tentativa em voo no grupo ${groupId} — vira recusa`);
    await refuseTokenCharge(db, attempt, STUCK_MESSAGE, deps);
    return true;
  }
  const expired = deps.now().getTime() - millisOf(entry[1]["at"]) > MAX_ATTEMPT_AGE_MS;
  const paymentId = str(entry[1]["paymentId"]);
  if (paymentId) {
    const payment = await deps.getPayment(paymentId);
    const status = str(payment.status).toUpperCase();
    if (PAID_STATUSES.has(status)) {
      await settleTokenCharge(db, attempt, paymentId, deps, payment);
      return true;
    }
    if (payment.deleted === true || NOT_CAPTURED_STATUSES.has(status)) {
      await refuseTokenCharge(db, attempt, NOT_CAPTURED_MESSAGE, deps);
      return true;
    }
  }
  if (expired) {
    await refuseTokenCharge(db, attempt, STUCK_MESSAGE, deps);
    return true;
  }
  if (paymentId) return false;
  await runScheduleTokenCharge(db, chargeId, "autopay", deps, {resumeAttemptId: entry[0]});
  return true;
}

/**
 * Recuperação (varredura de 30 min). Nenhuma mensalidade fica parada sem débito e sem link:
 * - `charging` há mais de 15 min é retomada (ou vira recusa depois de 24 h);
 * - `scheduled`/`retry` esquecida (2+ dias no passado: o job das 06:00 não rodou) → `skipped` + link;
 * - grupo `autopay` de mensalidade aberta fora da janela do débito (o link falhou depois do
 *   `skipped`/`failed`, ou uma tentativa na mão o criou) → ganha o link.
 */
export async function recoverScheduleAutopay(
  db: Firestore,
  now: Date,
  deps: AutopayDeps,
): Promise<{resumed: number; linked: number}> {
  const runDeps: AutopayDeps = {...deps, now: () => now};
  const col = db.collection(ARENA_SCHEDULE_CHARGES);
  let resumed = 0;
  let linked = 0;

  const stuck = await col.where("autopay.state", "==", "charging").limit(200).get();
  for (const doc of stuck.docs) {
    const charge = doc.data() as Data;
    if (now.getTime() - millisOf(autopayOf(charge)["lastAttemptAt"]) <= STUCK_CHARGING_MS) continue;
    try {
      if (await resumeStuckCharge(db, doc.id, charge, runDeps)) resumed += 1;
    } catch (e) {
      logger.warn(`recoverScheduleAutopay: retomar ${doc.id} falhou`, e);
    }
  }

  const cutoff = addDaysToDateKey(dayKeyFromEventDate(now), -2);
  const missed = await col.where("autopay.state", "in", ["scheduled", "retry"])
    .where("autopay.scheduledFor", "<=", cutoff).limit(200).get();
  for (const doc of missed.docs) {
    try {
      const skipped = await db.runTransaction(async (tx: Transaction) => {
        const ap = autopayOf((await tx.get(doc.ref)).data() as Data | undefined);
        const state = str(ap["state"]);
        if ((state !== "scheduled" && state !== "retry") || str(ap["scheduledFor"]) > cutoff) return false;
        tx.set(doc.ref, {autopay: {state: "skipped", lastError: "missed_run"}}, {merge: true});
        return true;
      });
      if (skipped && await ensureLinkQuietly(db, doc.id)) linked += 1;
    } catch (e) {
      logger.warn(`recoverScheduleAutopay: link de ${doc.id} falhou`, e);
    }
  }

  const orphans = await groupsCol(db).where("state", "==", "autopay").limit(200).get();
  for (const doc of orphans.docs) {
    const group = doc.data() as Data;
    const chargeId = str(group["chargeId"]);
    if (!chargeId || chargeId.includes("/") || attemptInFlight(group, now.getTime())) continue;
    const charge = (await chargeRefOf(db, chargeId).get()).data() as Data | undefined;
    if (charge?.["status"] !== "open" || charge["billingMode"] !== "asaas" ||
      str(mapOf(charge["asaas"])["groupId"]) !== doc.id || inWindow(charge)) continue;
    if (await ensureLinkQuietly(db, chargeId)) linked += 1;
  }
  return {resumed, linked};
}

export const chargeArenaScheduleAutopay = onSchedule({
  schedule: "every day 06:00",
  timeZone: "America/Sao_Paulo",
  timeoutSeconds: 540,
  secrets: [...asaasArenaSecrets, WEB_PUSH_PUBLIC_KEY, WEB_PUSH_PRIVATE_KEY, WEB_PUSH_SUBJECT],
}, async () => {
  const result = await chargeScheduleAutopayDue(getFirestore(), new Date(), defaultAutopayDeps);
  if (Object.values(result).some((n) => n > 0)) logger.info("chargeArenaScheduleAutopay", result);
});
