/**
 * Planos de horário — débito automático no cartão salvo.
 * Spec: `docs/superpowers/specs/2026-11-09-arena-planos-debito-automatico-cartao-design.md`.
 *
 * - Chave de ambiente: `appConfig/payments.scheduleCardAutopay === true`.
 * - Ligar: grava o consentimento na assinatura e marca as mensalidades online abertas do pagador
 *   como `autopay.state = "scheduled"` (uma transação por mensalidade). Desligar faz o inverso e
 *   devolve o link de pagamento (`ensureScheduleChargeLinkGroup`).
 * - Débito (`runScheduleTokenCharge`): reivindica a tentativa numa transação, cobra o token fora
 *   dela e fecha pelo caminho do webhook. 1ª recusa → `retry` amanhã; 2ª → `failed` + link.
 *   Job diário 06:00 (aviso D-3 + débito) e recuperação de travados na varredura de 30 min.
 *
 * Número e CVV nunca passam por aqui: só o token (via `asaas-saved-card.ts`).
 */
import {randomUUID} from "node:crypto";
import * as logger from "firebase-functions/logger";
import {onCall, HttpsError} from "firebase-functions/v2/https";
import {onSchedule} from "firebase-functions/v2/scheduler";
import {FieldValue, getFirestore, Timestamp, type Firestore, type Transaction} from "firebase-admin/firestore";
import {
  APP_PAYMENTS_CONFIG_PATH,
  ARENA_SCHEDULE_ASAAS_PAYMENTS,
  ARENA_SCHEDULE_CHARGES,
  ARENA_SCHEDULE_SUBSCRIPTIONS,
  ATHLETE_PLANS_URL,
  SCHEDULE_PAYMENT_REF_PREFIX,
  autopayOf,
  parseScheduleSettings,
  str,
} from "./arena-schedule-plan-constants";
import {requireUid, rethrowSchedule, scheduleOnlineBillingOn, scheduleSettingsRef} from "./arena-schedule-plans";
import {assertAsaasAllowed, ensureScheduleChargeLinkGroup, scheduleAsaasGroupData} from "./arena-schedule-asaas";
import {chargeAsaasMirror} from "./arena-class-asaas-model";
import {monthLabelPt} from "./arena-class-billing";
import {addDaysToDateKey} from "./arena-recurring-booking";
import {AsaasApiError, asaasArenaSecrets, getAsaasEnvTag} from "./asaas-client";
import {createAsaasTokenCardCharge, getAsaasPayment, type AsaasPaymentDetails} from "./asaas-booking-payment";
import {processArenaScheduleAsaasNotification} from "./asaas-arena-schedule-webhook";
import {cardFeePreviewFields, cardSurcharge, loadCardFeeTerms, type CardFeeTerms} from "./card-anticipation-fee";
import {
  cardValidForDueDate,
  readSavedCard,
  readSavedCardTx,
  resolveScheduleCustomer,
  type SavedCard,
} from "./asaas-saved-card";
import {dayKeyFromEventDate} from "./event-timezone";
import {getFirebaseProjectId} from "./firebase-paths";
import {CLIENT_FACING_REGIONS} from "./function-regions";
import {deliverNotificationToUser, WEB_PUSH_PRIVATE_KEY, WEB_PUSH_PUBLIC_KEY, WEB_PUSH_SUBJECT} from "./notification-delivery";

type Data = Record<string, unknown>;
type AsaasEnv = "sandbox" | "production";

export const AUTOPAY_NO_CARD_MESSAGE = "Salve um cartão para ligar o débito automático.";
export const AUTOPAY_ARENA_OFFLINE_MESSAGE = "Esta arena não recebe online.";
export const AUTOPAY_UNAVAILABLE_MESSAGE = "Débito automático indisponível no momento.";
export const AUTOPAY_NOT_MEMBER_MESSAGE = "Este plano não é seu.";
export const AUTOPAY_SUB_ENDED_MESSAGE = "Este plano foi encerrado.";
export const AUTOPAY_CONSENT_MESSAGE = "Autorização inválida.";

const MAX_CONSENT_LENGTH = 1000;
const ENDED_STATUSES = new Set(["canceled", "ended", "expired"]);

/** Chave de ambiente. Com `tx` lê dentro da transação (Ruling 1). */
export async function scheduleAutopayFlagOn(db: Firestore, tx?: Transaction): Promise<boolean> {
  const ref = db.doc(APP_PAYMENTS_CONFIG_PATH);
  const snap = tx ? await tx.get(ref) : await ref.get();
  return (snap.data() as Data | undefined)?.["scheduleCardAutopay"] === true;
}

function parseSubscriptionId(input: unknown): string {
  const id = str((input as Data | null | undefined)?.["subscriptionId"]);
  if (!id) throw new HttpsError("invalid-argument", "Plano inválido.");
  return id;
}

function stringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

async function readArenaOnline(db: Firestore, arenaId: string): Promise<boolean> {
  const [arenaSnap, settingsSnap] = await Promise.all([
    db.collection("arenas").doc(arenaId || "_").get(),
    scheduleSettingsRef(db, arenaId || "_").get(),
  ]);
  const settings = parseScheduleSettings(settingsSnap.exists ? settingsSnap.data() as Data : undefined);
  return scheduleOnlineBillingOn(settings, (arenaSnap.data() ?? {}) as Data);
}

async function payerOpenChargeIds(db: Firestore, subscriptionId: string, uid: string): Promise<Array<{id: string; data: Data}>> {
  const snap = await db.collection(ARENA_SCHEDULE_CHARGES)
    .where("subscriptionId", "==", subscriptionId)
    .where("payerAthleteId", "==", uid)
    .where("status", "==", "open")
    .get();
  return snap.docs.map((d) => ({id: d.id, data: d.data() as Data}));
}

// ---------------------------------------------------------------------------
// Ligar / desligar
// ---------------------------------------------------------------------------

/** Liga/desliga o débito automático do atleta na assinatura. */
export async function setScheduleAutopayCore(
  db: Firestore,
  uid: string,
  input: unknown,
  env: AsaasEnv,
): Promise<{enabled: boolean; brand: string | null; last4: string | null}> {
  const subscriptionId = parseSubscriptionId(input);
  const raw = input as Data;
  const enabled = raw["enabled"] === true;
  const subRef = db.collection(ARENA_SCHEDULE_SUBSCRIPTIONS).doc(subscriptionId);

  if (enabled) {
    const consentText = typeof raw["consentText"] === "string" ? raw["consentText"].trim() : "";
    if (!consentText || consentText.length > MAX_CONSENT_LENGTH) {
      throw new HttpsError("invalid-argument", AUTOPAY_CONSENT_MESSAGE);
    }
  }

  const card = await db.runTransaction(async (tx: Transaction): Promise<SavedCard | null> => {
    const subSnap = await tx.get(subRef);
    const sub = subSnap.data() as Data | undefined;
    if (!subSnap.exists || !sub) throw new HttpsError("not-found", "Plano não encontrado.");
    if (!stringArray(sub["memberAthleteIds"]).includes(uid)) {
      throw new HttpsError("permission-denied", AUTOPAY_NOT_MEMBER_MESSAGE);
    }
    if (ENDED_STATUSES.has(str(sub["status"]))) throw new HttpsError("failed-precondition", AUTOPAY_SUB_ENDED_MESSAGE);
    const ids = stringArray(sub["autopayAthleteIds"]);
    if (enabled) {
      if (!(await scheduleAutopayFlagOn(db, tx))) throw new HttpsError("failed-precondition", AUTOPAY_UNAVAILABLE_MESSAGE);
      const saved = await readSavedCardTx(tx, db, uid, env);
      if (!saved) throw new HttpsError("failed-precondition", AUTOPAY_NO_CARD_MESSAGE);
      if (!(await readArenaOnline(db, str(sub["arenaId"])))) {
        throw new HttpsError("failed-precondition", AUTOPAY_ARENA_OFFLINE_MESSAGE);
      }
      tx.set(subRef, {
        autopay: {
          [uid]: {
            enabled: true, brand: saved.brand, last4: saved.last4,
            consentAt: FieldValue.serverTimestamp(), consentText: (raw["consentText"] as string).trim(),
            updatedAt: FieldValue.serverTimestamp(),
          },
        },
        autopayAthleteIds: ids.includes(uid) ? ids : [...ids, uid],
      }, {merge: true});
      return saved;
    } else {
      tx.set(subRef, {
        autopay: {[uid]: {enabled: false, updatedAt: FieldValue.serverTimestamp()}},
        autopayAthleteIds: ids.filter((x) => x !== uid),
      }, {merge: true});
    }
    return null;
  });

  const charges = await payerOpenChargeIds(db, subscriptionId, uid);
  if (enabled) {
    const today = dayKeyFromEventDate(new Date());
    for (const {id} of charges) await scheduleOne(db, id, today, card!);
    return {enabled: true, brand: card!.brand, last4: card!.last4};
  }
  for (const {id} of charges) await skipOne(db, id);
  return {enabled: false, brand: null, last4: null};
}

/** Agenda uma mensalidade elegível (uma transação por mensalidade). */
async function scheduleOne(db: Firestore, chargeId: string, today: string, card: SavedCard): Promise<void> {
  const ref = db.collection(ARENA_SCHEDULE_CHARGES).doc(chargeId);
  await db.runTransaction(async (tx: Transaction) => {
    const snap = await tx.get(ref);
    const charge = snap.data() as Data | undefined;
    if (!snap.exists || !charge || charge["status"] !== "open" || charge["billingMode"] !== "asaas") return;
    const dueDate = str(charge["dueDate"]);
    if (!dueDate || dueDate < today) return;
    const state = str(autopayOf(charge)["state"]);
    if (state && state !== "skipped" && state !== "failed") return;
    if (!cardValidForDueDate(card, dueDate)) return;
    tx.set(ref, {
      autopay: {
        state: "scheduled", scheduledFor: dueDate, attempts: 0, lastAttemptAt: null, lastError: null,
        brand: card.brand, last4: card.last4, chargedReais: null,
      },
    }, {merge: true});
  });
}

/** Tira da fila do débito (`scheduled`/`retry` → `skipped`) e devolve o link de pagamento. */
async function skipOne(db: Firestore, chargeId: string): Promise<void> {
  const ref = db.collection(ARENA_SCHEDULE_CHARGES).doc(chargeId);
  const skipped = await db.runTransaction(async (tx: Transaction) => {
    const snap = await tx.get(ref);
    const charge = snap.data() as Data | undefined;
    if (!snap.exists || !charge || charge["status"] !== "open") return false;
    const state = str(autopayOf(charge)["state"]);
    if (state !== "scheduled" && state !== "retry") return false;
    tx.set(ref, {autopay: {state: "skipped"}}, {merge: true});
    return true;
  });
  // Só devolve o link se saiu da fila: em `charging` o débito está em curso (link = cobrança dupla).
  if (skipped) await ensureScheduleChargeLinkGroup(db, chargeId);
}

/** Desliga o débito de todas as assinaturas do atleta (cartão apagado). Devolve quantas. */
export async function disableAllScheduleAutopayCore(db: Firestore, uid: string): Promise<number> {
  const snap = await db.collection(ARENA_SCHEDULE_SUBSCRIPTIONS).where("autopayAthleteIds", "array-contains", uid).get();
  let count = 0;
  for (const doc of snap.docs) {
    const turnedOff = await db.runTransaction(async (tx: Transaction) => {
      const fresh = (await tx.get(doc.ref)).data() as Data | undefined;
      const ids = stringArray(fresh?.["autopayAthleteIds"]);
      if (!ids.includes(uid)) return false;
      tx.set(doc.ref, {
        autopay: {[uid]: {enabled: false, updatedAt: FieldValue.serverTimestamp()}},
        autopayAthleteIds: ids.filter((x) => x !== uid),
      }, {merge: true});
      return true;
    });
    if (!turnedOff) continue;
    for (const {id} of await payerOpenChargeIds(db, doc.id, uid)) await skipOne(db, id);
    count += 1;
  }
  return count;
}

// ---------------------------------------------------------------------------
// Prévia da taxa
// ---------------------------------------------------------------------------

export async function getScheduleAutopayPreviewCore(
  db: Firestore,
  uid: string,
  input: unknown,
  env: AsaasEnv,
  terms: CardFeeTerms,
): Promise<{
  brand: string | null; last4: string | null;
  cardFeePercent: number; cardProcessingPercent: number; cardFixedReais: number;
  next: {chargeId: string; dueDate: string; amountReais: number; cardFeeReais: number; chargedReais: number} | null;
}> {
  const subscriptionId = parseSubscriptionId(input);
  const subSnap = await db.collection(ARENA_SCHEDULE_SUBSCRIPTIONS).doc(subscriptionId).get();
  const sub = subSnap.data() as Data | undefined;
  if (!subSnap.exists || !sub) throw new HttpsError("not-found", "Plano não encontrado.");
  if (!stringArray(sub["memberAthleteIds"]).includes(uid)) {
    throw new HttpsError("permission-denied", AUTOPAY_NOT_MEMBER_MESSAGE);
  }
  const card = await readSavedCard(db, uid, env);
  const open = (await payerOpenChargeIds(db, subscriptionId, uid))
    .filter((c) => c.data["billingMode"] === "asaas")
    .sort((a, b) => str(a.data["dueDate"]).localeCompare(str(b.data["dueDate"])));
  const first = open[0];
  let next = null;
  if (first) {
    const amountReais = Number(first.data["amountReais"] ?? 0);
    const feeCents = cardSurcharge(amountReais, terms).totalCents;
    next = {
      chargeId: first.id, dueDate: str(first.data["dueDate"]), amountReais,
      cardFeeReais: feeCents / 100, chargedReais: Math.round(amountReais * 100 + feeCents) / 100,
    };
  }
  return {brand: card?.brand ?? null, last4: card?.last4 ?? null, ...cardFeePreviewFields(terms), next};
}

// ---------------------------------------------------------------------------
// Callables
// ---------------------------------------------------------------------------

export const setScheduleAutopay = onCall({region: CLIENT_FACING_REGIONS}, async (request) => {
  const uid = requireUid(request.auth);
  try {
    return await setScheduleAutopayCore(getFirestore(), uid, request.data ?? {}, getAsaasEnvTag());
  } catch (e) {
    return rethrowSchedule("setScheduleAutopay", e);
  }
});

export const getScheduleAutopayPreview = onCall({
  region: CLIENT_FACING_REGIONS,
  secrets: [...asaasArenaSecrets],
}, async (request) => {
  const uid = requireUid(request.auth);
  try {
    return await getScheduleAutopayPreviewCore(
      getFirestore(), uid, request.data ?? {}, getAsaasEnvTag(), await loadCardFeeTerms(),
    );
  } catch (e) {
    return rethrowSchedule("getScheduleAutopayPreview", e);
  }
});

// ---------------------------------------------------------------------------
// Débito com token (parte 2)
// ---------------------------------------------------------------------------

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
  settle: (db, paymentId, payment) => processArenaScheduleAsaasNotification(db, paymentId, payment,
    db.doc(`artifacts/${getFirebaseProjectId()}/public/data/asaas_processed_payments/${paymentId}`)),
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
const STUCK_CHARGING_MS = 15 * 60_000;
const DUE_BATCH = 300;

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

function chargedFor(baseReais: number, terms: CardFeeTerms) {
  const surcharge = cardSurcharge(baseReais, terms);
  return {
    feeCents: surcharge.totalCents,
    processingCents: surcharge.processingCents,
    chargedReais: (Math.round(baseReais * 100) + surcharge.totalCents) / 100,
  };
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
      if (state !== "charging") return {kind: "skip", reason: "not_charging", link: false};
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
    // Retomada: mesmo corpo da 1ª ida (a chave de idempotência do Asaas é a mesma).
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
        state: "charging", attempts: Number(ap["attempts"] ?? 0) + (resumed ? 0 : 1),
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
    if (claim.link) await ensureScheduleChargeLinkGroup(db, chargeId);
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
    // Rede/5xx: segue `charging`; a recuperação repete com o mesmo `attemptId` (mesma chave).
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

/** Passo 3: fecha pelo webhook (paga, ou estorna se a mensalidade já estava resolvida) e só então marca o estado. */
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
  const charge = await db.runTransaction(async (tx: Transaction) => {
    const fresh = ((await tx.get(chargeRef)).data() ?? {}) as Data;
    const paid = fresh["status"] === "paid" && fresh["asaasPaymentId"] === paymentId;
    tx.set(groupsCol(db).doc(attempt.groupId), {
      tokenCharges: {[attempt.attemptId]: {status: paid ? "paid" : "refunded"}}, updatedAt: FieldValue.serverTimestamp(),
    }, {merge: true});
    const state = str(autopayOf(fresh)["state"]);
    // O gatilho pode ter pulado o agendamento ao sair de "em aberto": grava por cima, sem conferir.
    if (paid && (attempt.source === "autopay" || state)) {
      tx.set(chargeRef, {autopay: {state: "paid"}}, {merge: true});
    } else if (!paid && attempt.source === "autopay" && state === "charging") {
      tx.set(chargeRef, {autopay: {state: "skipped", lastError: "charge_resolved"}}, {merge: true});
    }
    return paid ? fresh : null;
  });
  if (!charge) return {outcome: "skipped", reason: "charge_resolved"};
  await notifyAutopay(deps, attempt.payer, attempt.chargeId, charge, "schedule_plan_autopay_paid", "Mensalidade paga",
    `Plano ${str(charge["planName"]) || "de horário"} · ${monthLabelPt(str(charge["period"]))}: ` +
    `R$ ${brlPlain(attempt.chargedReais)} no cartão final ${attempt.last4}.`);
  return {outcome: "paid"};
}

/** Passo 4: recusa. `autopay`: 1ª → `retry` amanhã; 2ª → `failed` + link + push. */
async function refuseTokenCharge(
  db: Firestore,
  attempt: Attempt,
  message: string,
  deps: AutopayDeps,
): Promise<TokenChargeOutcome> {
  const error = message.slice(0, 300);
  const chargeRef = chargeRefOf(db, attempt.chargeId);
  const next = await db.runTransaction(async (tx: Transaction) => {
    const charge = (await tx.get(chargeRef)).data() as Data | undefined;
    tx.set(groupsCol(db).doc(attempt.groupId), {
      tokenCharges: {[attempt.attemptId]: {status: "refused", error}}, updatedAt: FieldValue.serverTimestamp(),
    }, {merge: true});
    const ap = autopayOf(charge);
    if (attempt.source !== "autopay" || str(ap["state"]) !== "charging") return null;
    if (charge?.["status"] !== "open") {
      tx.set(chargeRef, {autopay: {state: "skipped", lastError: "charge_resolved"}}, {merge: true});
      return "skipped";
    }
    if (Number(ap["attempts"] ?? 0) < 2) {
      const tomorrow = addDaysToDateKey(dayKeyFromEventDate(deps.now()), 1);
      tx.set(chargeRef, {autopay: {state: "retry", scheduledFor: tomorrow, lastError: error}}, {merge: true});
      return "retry";
    }
    tx.set(chargeRef, {autopay: {state: "failed", lastError: error}}, {merge: true});
    return "failed";
  });
  if (next === "failed") {
    await ensureScheduleChargeLinkGroup(db, attempt.chargeId);
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
 * `charged` = mensalidades processadas em (b); `failed` = sem resposta do Asaas ou erro (ficam para
 * a recuperação).
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

/** Destrava uma `charging` antiga: consulta o Asaas (com `paymentId`) ou repete o POST da mesma tentativa. */
async function resumeStuckCharge(db: Firestore, chargeId: string, charge: Data, deps: AutopayDeps): Promise<boolean> {
  const groupId = str(mapOf(charge["asaas"])["groupId"]);
  const group = groupId ? (await groupsCol(db).doc(groupId).get()).data() : undefined;
  const entry = Object.entries(mapOf(group?.["tokenCharges"]))
    .find(([, t]) => mapOf(t)["status"] === "charging" && mapOf(t)["source"] === "autopay");
  if (!entry) {
    logger.warn(`recoverScheduleAutopay ${chargeId}: em charging sem tentativa em voo no grupo ${groupId}`);
    return false;
  }
  const [attemptId, raw] = entry;
  const paymentId = str(mapOf(raw)["paymentId"]);
  if (!paymentId) {
    await runScheduleTokenCharge(db, chargeId, "autopay", deps, {resumeAttemptId: attemptId});
    return true;
  }
  const attempt: Attempt = {
    chargeId, groupId, attemptId, source: "autopay", payer: str(charge["payerAthleteId"]),
    last4: str(autopayOf(charge)["last4"]), chargedReais: Number(mapOf(raw)["chargedReais"] ?? 0),
  };
  const payment = await deps.getPayment(paymentId);
  const status = str(payment.status).toUpperCase();
  if (PAID_STATUSES.has(status)) {
    await settleTokenCharge(db, attempt, paymentId, deps, payment);
    return true;
  }
  if (payment.deleted === true || NOT_CAPTURED_STATUSES.has(status)) {
    await refuseTokenCharge(db, attempt, "Pagamento não aprovado.", deps);
    return true;
  }
  return false;
}

/**
 * Recuperação (varredura de 30 min): `charging` há mais de 15 min é retomada; `scheduled`/`retry`
 * esquecida (2+ dias no passado: o job das 06:00 não rodou) vai para `skipped` e ganha o link.
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
      if (!skipped) continue;
      await ensureScheduleChargeLinkGroup(db, doc.id);
      linked += 1;
    } catch (e) {
      logger.warn(`recoverScheduleAutopay: link de ${doc.id} falhou`, e);
    }
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
