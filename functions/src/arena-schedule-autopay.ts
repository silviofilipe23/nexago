/**
 * Planos de horário — débito automático no cartão salvo.
 * Spec: `docs/superpowers/specs/2026-11-09-arena-planos-debito-automatico-cartao-design.md`.
 *
 * - Chave de ambiente: `appConfig/payments.scheduleCardAutopay === true`.
 * - Ligar: grava o consentimento na assinatura e marca as mensalidades online abertas do pagador
 *   como `autopay.state = "scheduled"` (uma transação por mensalidade). Desligar faz o inverso e
 *   devolve o link de pagamento (`ensureScheduleChargeLinkGroup`).
 * - O débito em si (cobrança com token, job diário, recuperação): `arena-schedule-autopay-charge.ts`.
 *
 * Número e CVV nunca passam por aqui: só o token (via `asaas-saved-card.ts`).
 */
import {onCall, HttpsError} from "firebase-functions/v2/https";
import {FieldValue, getFirestore, type Firestore, type Transaction} from "firebase-admin/firestore";
import {
  APP_PAYMENTS_CONFIG_PATH,
  ARENA_SCHEDULE_CHARGES,
  ARENA_SCHEDULE_SUBSCRIPTIONS,
  autopayOf,
  parseScheduleSettings,
  str,
} from "./arena-schedule-plan-constants";
import {requireUid, rethrowSchedule, scheduleOnlineBillingOn, scheduleSettingsRef} from "./arena-schedule-plans";
import {ensureLinkQuietly} from "./arena-schedule-autopay-charge";
import {asaasArenaSecrets, getAsaasEnvTag} from "./asaas-client";
import {cardFeePreviewFields, cardSurcharge, loadCardFeeTerms, type CardFeeTerms} from "./card-anticipation-fee";
import {cardValidForDueDate, deleteSavedCardCore, readSavedCard, readSavedCardTx, type SavedCard} from "./asaas-saved-card";
import {dayKeyFromEventDate} from "./event-timezone";
import {CLIENT_FACING_REGIONS} from "./function-regions";

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

/**
 * "Trocar de cartão = salvar de novo": a bandeira e o final novos valem para todos os planos com
 * débito ligado do atleta (tela, push D-3 e de pago) e para as mensalidades ainda por debitar.
 * `charging` e os demais estados não mudam. Devolve quantas assinaturas foram atualizadas.
 */
export async function refreshScheduleAutopayCardCore(
  db: Firestore,
  uid: string,
  card: {brand: string; last4: string},
): Promise<number> {
  const subs = await db.collection(ARENA_SCHEDULE_SUBSCRIPTIONS).where("autopayAthleteIds", "array-contains", uid).get();
  for (const doc of subs.docs) {
    await doc.ref.set({
      autopay: {[uid]: {brand: card.brand, last4: card.last4, updatedAt: FieldValue.serverTimestamp()}},
    }, {merge: true});
  }
  const charges = await db.collection(ARENA_SCHEDULE_CHARGES)
    .where("payerAthleteId", "==", uid)
    .where("status", "==", "open")
    .get();
  for (const doc of charges.docs) {
    const state = str(((doc.data() as Data)["autopay"] as Data | undefined)?.["state"]);
    if (state !== "scheduled" && state !== "retry") continue;
    await doc.ref.set({autopay: {brand: card.brand, last4: card.last4}}, {merge: true});
  }
  return subs.size;
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
        state: "scheduled", scheduledFor: dueDate, attempts: 0, lastAttemptAt: null, lastError: null, needsLink: false,
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
    tx.set(ref, {autopay: {state: "skipped", needsLink: true}}, {merge: true});
    return true;
  });
  // Só devolve o link se saiu da fila: em `charging` o débito está em curso (link = cobrança dupla).
  if (skipped) await ensureLinkQuietly(db, chargeId);
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

/** Remove o cartão salvo e desliga o débito de todos os planos do atleta. */
export async function removeMyPaymentCardCore(db: Firestore, uid: string): Promise<{removed: boolean; plans: number}> {
  // Desliga primeiro: se algo falhar, o cartão segue salvo e o atleta repete; o inverso deixaria débito sem cartão.
  const plans = await disableAllScheduleAutopayCore(db, uid);
  const removed = await deleteSavedCardCore(db, uid);
  return {removed, plans};
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
  now: Date = new Date(),
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
  const today = dayKeyFromEventDate(now);
  // O próximo débito: aberta online, ainda não vencida e que o cartão salvo cobre.
  const open = (await payerOpenChargeIds(db, subscriptionId, uid))
    .filter((c) => c.data["billingMode"] === "asaas" && str(c.data["dueDate"]) >= today &&
      card != null && cardValidForDueDate(card, str(c.data["dueDate"])))
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

export const setScheduleAutopay = onCall({
  region: CLIENT_FACING_REGIONS,
  // `getAsaasEnvTag()` sem o ASAAS_ENV ligado vira "production" (e o cartão do sandbox some).
  secrets: [...asaasArenaSecrets],
}, async (request) => {
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

export const removeMyPaymentCard = onCall({region: CLIENT_FACING_REGIONS}, async (request) => {
  const uid = requireUid(request.auth);
  try {
    return await removeMyPaymentCardCore(getFirestore(), uid);
  } catch (e) {
    return rethrowSchedule("removeMyPaymentCard", e);
  }
});
