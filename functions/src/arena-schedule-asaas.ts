/**
 * Planos de horário — cobrança online das mensalidades (link Asaas: Pix ou cartão na fatura).
 * Spec: `docs/superpowers/specs/2026-11-03-arena-planos-cobranca-online-design.md`.
 * Espelho do worker das Aulas (`asaas-class-billing.ts`), com UM pagamento por mensalidade.
 *
 * - `onArenaScheduleChargeWritten`: mensalidade nova (`billingMode: null`) → decide manual × asaas
 *   numa transação e, se asaas, grava o grupo `pending` + o espelho; mensalidade que saiu de "em
 *   aberto" sem ter sido paga online (baixa manual, cancelar, pausa, encerrar) → anula o grupo vivo.
 * - `onArenaScheduleAsaasPaymentWritten`: grupo `pending` → cria no Asaas; `voiding` → apaga.
 * - `reconcileArenaScheduleAsaasPayments`: retenta, destrava, consulta abertas e decide esquecidas.
 * - `getArenaScheduleChargePaymentLink`: o "Pagar" do app (pede CPF quando falta).
 *
 * Transações nunca chamam o Asaas: só gravam estados; o worker fala com o Asaas fora delas.
 */
import * as logger from "firebase-functions/logger";
import {onCall, HttpsError} from "firebase-functions/v2/https";
import {onDocumentWritten} from "firebase-functions/v2/firestore";
import {onSchedule} from "firebase-functions/v2/scheduler";
import {FieldValue, getFirestore, Timestamp, type Firestore, type Transaction} from "firebase-admin/firestore";
import {
  ARENA_SCHEDULE_ASAAS_PAYMENTS,
  ARENA_SCHEDULE_CHARGES,
  ARENA_SCHEDULE_SUBSCRIPTIONS,
  ATHLETE_PLANS_URL,
  CPF_REQUIRED_MESSAGE,
  MIN_ONLINE_CHARGE_REAIS,
  PENDING_PAYMENT_STATUS,
  SCHEDULE_PAYMENT_REF_PREFIX,
  autopayOf,
  parseScheduleSettings,
  str,
} from "./arena-schedule-plan-constants";
import {
  notifyScheduleSafe,
  requireUid,
  rethrowSchedule,
  scheduleOnlineBillingOn,
  scheduleSettingsRef,
} from "./arena-schedule-plans";
import {defaultAutopayDeps, recoverScheduleAutopay, scheduleAutopayFlagOn, type AutopayDeps} from "./arena-schedule-autopay";
import {activatePendingSubscriptionCore, expirePendingSubscriptionCore} from "./arena-schedule-subscriptions";
import {chargeAsaasMirror, type ClassAsaasState} from "./arena-class-asaas-model";
import {monthLabelPt} from "./arena-class-billing";
import {asaasArenaSecrets, getAsaasEnvTag} from "./asaas-client";
import {
  cardFeePreviewFields,
  cardSurcharge,
  loadCardFeeTerms,
  type CardFeeTerms,
} from "./card-anticipation-fee";
import {
  createAsaasCardCharge,
  createAsaasInvoiceCharge,
  deleteAsaasPaymentOrThrow,
  fetchAsaasPixQrCode,
  getAsaasPayment,
  type AsaasPaymentDetails,
} from "./asaas-booking-payment";
import {isValidCpfCnpj, normalizeCpfCnpj} from "./asaas-customer";
import {
  cardValidForDueDate,
  readSavedCardTx,
  registerScheduleCustomer,
  resolveScheduleCustomer,
} from "./asaas-saved-card";
import {processArenaScheduleAsaasNotification} from "./asaas-arena-schedule-webhook";
import {getFirebaseProjectId} from "./firebase-paths";
import {dayKeyFromEventDate} from "./event-timezone";
import {addDaysToDateKey} from "./arena-recurring-booking";
import {CLIENT_FACING_REGIONS} from "./function-regions";
import {deliverNotificationToUser, WEB_PUSH_PRIVATE_KEY, WEB_PUSH_PUBLIC_KEY, WEB_PUSH_SUBJECT} from "./notification-delivery";

type Data = Record<string, unknown>;

export const SCHEDULE_CHARGE_LINK_TYPE = "schedule_plan_charge_link";
/** Fatura UNDEFINED (Pix ou cartão) no Asaas não aceita menos que isso — abaixo fica manual. */
export {MIN_ONLINE_CHARGE_REAIS};
export {CPF_REQUIRED_MESSAGE, resolveScheduleCustomer};
export const ONSITE_ONLY_MESSAGE = "Esta mensalidade é paga direto na arena.";
export const LINK_PENDING_MESSAGE = "O link ainda está sendo gerado. Tente de novo em instantes.";

/** Estados em que ainda pode existir (ou vir a existir) um pagamento vivo no Asaas. */
const LIVE_STATES = new Set<string>(["pending", "creating", "open", "failed"]);

export interface ScheduleAsaasDeps {
  /** Cliente Asaas do atleta pelo CPF guardado; null = sem CPF. */
  resolveCustomer: (athleteId: string) => Promise<string | null>;
  /** Grava o CPF digitado no "Pagar" (cliente Asaas + cadastro), como o aluguel online. */
  registerCustomer: (athleteId: string, cpfCnpj: string) => Promise<string>;
  createPayment: (input: {
    groupId: string; customerId: string; valueReais: number; dueDate: string; description: string;
  }) => Promise<{paymentId: string; invoiceUrl: string; status: string}>;
  /** Apaga a cobrança; lança se não der (já paga, por exemplo). 404 conta como apagada. */
  deletePayment: (paymentId: string) => Promise<void>;
  getPayment: (paymentId: string) => Promise<AsaasPaymentDetails>;
  /** QR do Pix da cobrança (a fatura `UNDEFINED` aceita Pix): copia-e-cola e imagem. */
  fetchPixQrCode: (paymentId: string) => Promise<{qrCode: string; qrCodeBase64: string}>;
  /**
   * Cobrança só de cartão, com as taxas do cartão por cima (`card-anticipation-fee.ts`). Ausente
   * (dublês antigos) = o cartão vai pela fatura de sempre, sem taxa.
   */
  createCardPayment?: (input: {
    groupId: string; customerId: string; valueReais: number; description: string; feeCents: number;
  }) => Promise<{paymentId: string; invoiceUrl: string}>;
  /** Taxas do cartão vigentes (processamento e antecipação). */
  cardFeeTerms?: () => Promise<CardFeeTerms>;
  notify: (input: {userId: string; title: string; body: string; type: string; data: Record<string, string>}) => Promise<void>;
  sleep: (ms: number) => Promise<void>;
}

/** No emulador, só sandbox: o projeto DEV aponta para o Asaas de produção. */
export function assertAsaasAllowed(): void {
  if (process.env.FUNCTIONS_EMULATOR === "true" && getAsaasEnvTag() !== "sandbox") {
    throw new Error("ASAAS_BLOCKED_IN_EMULATOR");
  }
}

export const defaultScheduleAsaasDeps: ScheduleAsaasDeps = {
  resolveCustomer: resolveScheduleCustomer,
  registerCustomer: registerScheduleCustomer,
  createPayment: async (input) => {
    assertAsaasAllowed();
    return createAsaasInvoiceCharge({
      customerId: input.customerId,
      valueReais: input.valueReais,
      dueDate: input.dueDate,
      description: input.description,
      externalReference: `${SCHEDULE_PAYMENT_REF_PREFIX}${input.groupId}`,
      // Mesmo grupo = mesma cobrança: retentativa do worker, da varredura ou do "Pagar" não duplica.
      idempotencyKey: `schedule-pay-${getAsaasEnvTag()}-${input.groupId}`,
    });
  },
  deletePayment: async (paymentId) => {
    assertAsaasAllowed();
    await deleteAsaasPaymentOrThrow(paymentId);
  },
  getPayment: (paymentId) => {
    assertAsaasAllowed();
    return getAsaasPayment(paymentId);
  },
  createCardPayment: async (input) => {
    assertAsaasAllowed();
    return createAsaasCardCharge({
      customerId: input.customerId,
      valueReais: input.valueReais,
      dueDate: new Date(),
      description: input.description,
      externalReference: `${SCHEDULE_PAYMENT_REF_PREFIX}${input.groupId}`,
      // Mesma taxa = mesma cobrança: tocar de novo no "Pagar" não duplica.
      idempotencyKey: `schedule-card-${getAsaasEnvTag()}-${input.groupId}-ca${input.feeCents}`,
    });
  },
  cardFeeTerms: () => loadCardFeeTerms(),
  fetchPixQrCode: (paymentId) => {
    assertAsaasAllowed();
    return fetchAsaasPixQrCode(paymentId);
  },
  notify: async (input) => {
    await deliverNotificationToUser({...input, requireInteraction: false});
  },
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};

function brl(value: number): string {
  return value.toLocaleString("pt-BR", {style: "currency", currency: "BRL"});
}

function groupsCol(db: Firestore) {
  return db.collection(ARENA_SCHEDULE_ASAAS_PAYMENTS);
}

function asaasOf(charge: Data | undefined): Data {
  const raw = charge?.["asaas"];
  return raw != null && typeof raw === "object" ? raw as Data : {};
}

// ---------------------------------------------------------------------------
// Decisão manual × asaas (uma vez por mensalidade)
// ---------------------------------------------------------------------------

/**
 * `asaas` se a regra da arena está ligada (e a arena ainda recebe online), a assinatura não escolheu
 * "Na arena", o pagador tem conta e o valor passa do mínimo do Asaas; senão `manual`.
 */
export function decideScheduleBillingMode(input: {onlineBilling: boolean; sub: Data; charge: Data}): "asaas" | "manual" {
  if (!input.onlineBilling) return "manual";
  if (str(input.sub["paymentMethod"]) === "onsite") return "manual";
  if (!str(input.charge["payerAthleteId"])) return "manual";
  if (Number(input.charge["amountReais"] ?? 0) < MIN_ONLINE_CHARGE_REAIS) return "manual";
  return "asaas";
}

/** Doc novo do grupo (estado `pending`) a partir da mensalidade. */
export function scheduleAsaasGroupData(
  chargeId: string,
  charge: Data,
  opts: {customerAthleteId: string | null; arenaName?: string; silentLink?: boolean},
): Data {
  const label = monthLabelPt(str(charge["period"]));
  const description = [`Plano ${str(charge["planName"]) || "de horário"}`, label, opts.arenaName ?? ""]
    .filter(Boolean).join(" · ").slice(0, 480);
  return {
    arenaId: str(charge["arenaId"]),
    subscriptionId: str(charge["subscriptionId"]),
    chargeId,
    payerAthleteId: str(charge["payerAthleteId"]) || null,
    customerAthleteId: opts.customerAthleteId,
    name: str(charge["payerName"]),
    amountReais: Number(charge["amountReais"] ?? 0),
    dueDate: str(charge["dueDate"]),
    description,
    state: "pending" satisfies ClassAsaasState,
    attempt: 0,
    paymentId: null,
    invoiceUrl: null,
    asaasStatus: null,
    ...(opts.silentLink ? {silentLink: true} : {}),
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };
}

export interface ScheduleBillingDecision {
  billingMode: string | null;
  groupId: string | null;
  /** Mensalidade agendada para o débito automático (sem link de pagamento). */
  autopay: boolean;
}

/** Decide a mensalidade aberta com `billingMode: null` (idempotente: decidida não muda). */
export async function decideScheduleChargeBilling(
  db: Firestore,
  chargeId: string,
): Promise<ScheduleBillingDecision> {
  const chargeRef = db.collection(ARENA_SCHEDULE_CHARGES).doc(chargeId);
  const out = await db.runTransaction(async (tx: Transaction) => {
    const snap = await tx.get(chargeRef);
    const charge = snap.data() as Data | undefined;
    if (!snap.exists || !charge) return {billingMode: null, groupId: null, autopay: false};
    if (charge["status"] !== "open" || charge["billingMode"] !== null) {
      return {billingMode: typeof charge["billingMode"] === "string" ? charge["billingMode"] : null,
        groupId: str(asaasOf(charge)["groupId"]) || null, autopay: str(autopayOf(charge)["state"]) !== ""};
    }
    const arenaId = str(charge["arenaId"]);
    const payerId = str(charge["payerAthleteId"]);
    const [subSnap, arenaSnap, settingsSnap] = await Promise.all([
      tx.get(db.collection(ARENA_SCHEDULE_SUBSCRIPTIONS).doc(str(charge["subscriptionId"]) || "_")),
      tx.get(db.collection("arenas").doc(arenaId || "_")),
      tx.get(scheduleSettingsRef(db, arenaId || "_")),
    ]);
    const sub = (subSnap.data() ?? {}) as Data;
    const arena = (arenaSnap.data() ?? {}) as Data;
    const settings = parseScheduleSettings(settingsSnap.exists ? settingsSnap.data() as Data : undefined);
    const mode = decideScheduleBillingMode({onlineBilling: scheduleOnlineBillingOn(settings, arena), sub, charge});
    if (mode === "manual") {
      tx.set(chargeRef, {billingMode: "manual"}, {merge: true});
      return {billingMode: "manual", groupId: null, autopay: false};
    }
    // Débito automático: chave ligada + consentimento do pagador + cartão salvo válido no vencimento.
    let cardExpired: {last4: string; planName: string} | null = null;
    const consent = (sub["autopay"] as Data | undefined)?.[payerId] as Data | undefined;
    if (payerId && consent?.["enabled"] === true) {
      const flagOn = await scheduleAutopayFlagOn(db, tx);
      const card = flagOn ? await readSavedCardTx(tx, db, payerId, getAsaasEnvTag()) : null;
      const dueDate = str(charge["dueDate"]);
      if (card && cardValidForDueDate(card, dueDate)) {
        tx.set(chargeRef, {
          billingMode: "asaas",
          autopay: {
            state: "scheduled", scheduledFor: dueDate, attempts: 0, lastAttemptAt: null, lastError: null,
            brand: card.brand, last4: card.last4, chargedReais: null,
          },
        }, {merge: true});
        return {billingMode: "asaas", groupId: null, autopay: true};
      }
      if (card) cardExpired = {last4: card.last4, planName: str(charge["planName"]) || "de horário"};
    }
    const groupRef = groupsCol(db).doc();
    tx.set(groupRef, scheduleAsaasGroupData(chargeId, charge, {customerAthleteId: null, arenaName: str(sub["arenaName"])}));
    tx.set(chargeRef, {billingMode: "asaas", asaas: chargeAsaasMirror(groupRef.id, "pending")}, {merge: true});
    return {billingMode: "asaas", groupId: groupRef.id, autopay: false, cardExpired, payerId};
  });
  if ("cardExpired" in out && out.cardExpired) {
    await notifyScheduleSafe(out.payerId, {
      title: "Seu cartão venceu",
      body: `O cartão final ${out.cardExpired.last4} venceu. Pague o plano ${out.cardExpired.planName} por Pix ou cartão e salve um cartão novo.`,
      type: "schedule_plan_autopay_card_expired",
    });
  }
  return {billingMode: out.billingMode, groupId: out.groupId, autopay: out.autopay};
}

/**
 * Garante o grupo do link de pagamento de uma mensalidade online aberta (o débito automático
 * deixa a mensalidade sem link; ao desligar ou falhar, o link volta). Sem grupo no espelho, ou com
 * grupo `void`: cria um `pending` novo. Grupo `autopay`: passa a `pending` no mesmo id. Grupo vivo:
 * nada a fazer. Devolve o id do grupo ou null (mensalidade fora de "aberta online").
 */
export async function ensureScheduleChargeLinkGroup(db: Firestore, chargeId: string): Promise<string | null> {
  const chargeRef = db.collection(ARENA_SCHEDULE_CHARGES).doc(chargeId);
  return db.runTransaction(async (tx: Transaction) => {
    const chargeSnap = await tx.get(chargeRef);
    const charge = chargeSnap.data() as Data | undefined;
    if (!chargeSnap.exists || !charge) return null;
    if (charge["status"] !== "open" || charge["billingMode"] !== "asaas") return null;
    const mirror = asaasOf(charge);
    const currentId = str(mirror["groupId"]);
    let current: Data | undefined;
    if (currentId) {
      const groupSnap = await tx.get(groupsCol(db).doc(currentId));
      current = groupSnap.exists ? groupSnap.data() as Data : undefined;
    }
    const subSnap = await tx.get(db.collection(ARENA_SCHEDULE_SUBSCRIPTIONS).doc(str(charge["subscriptionId"]) || "_"));
    if (currentId && current && current["state"] === "autopay") {
      tx.set(groupsCol(db).doc(currentId), {state: "pending", updatedAt: FieldValue.serverTimestamp()}, {merge: true});
      tx.set(chargeRef, {asaas: {...mirror, state: "pending"}}, {merge: true});
      return currentId;
    }
    if (currentId && current && current["state"] !== "void") return currentId;
    const groupRef = groupsCol(db).doc();
    const sub = (subSnap.data() ?? {}) as Data;
    tx.set(groupRef, scheduleAsaasGroupData(chargeId, charge, {customerAthleteId: null, arenaName: str(sub["arenaName"])}));
    tx.set(chargeRef, {asaas: chargeAsaasMirror(groupRef.id, "pending")}, {merge: true});
    return groupRef.id;
  });
}

/**
 * O grupo ainda cobra uma mensalidade que segue em aberto e aponta para ele? Se não (paga por fora,
 * cancelada, apagada ou trocada de grupo), ele tem de ser anulado.
 */
function chargeStillBilledBy(charge: Data | undefined, groupId: string): boolean {
  return charge != null && charge["status"] === "open" && asaasOf(charge)["groupId"] === groupId;
}

function voidReasonOf(charge: Data | undefined, groupId: string): string {
  if (!charge) return "charge_missing";
  if (charge["status"] === "paid") return charge["paidVia"] === "asaas" ? "paid_by_other_group" : "manual_payment";
  if (charge["status"] === "canceled") return str(charge["cancelReason"]) || "canceled";
  return asaasOf(charge)["groupId"] !== groupId ? "superseded" : "charge_resolved";
}

/**
 * Pede a anulação de um grupo cuja mensalidade não é mais cobrada por ele: vivo → `voiding` (o
 * gatilho do grupo apaga no Asaas); `needs_cpf` (nada no Asaas) → `void` direto. Usado pelo gatilho
 * da mensalidade e pela varredura (gatilho perdido ou atrasado).
 */
export async function requestScheduleGroupVoid(db: Firestore, groupId: string): Promise<string | null> {
  const groupRef = groupsCol(db).doc(groupId);
  return db.runTransaction(async (tx: Transaction) => {
    const groupSnap = await tx.get(groupRef);
    const group = groupSnap.data();
    if (!groupSnap.exists || !group) return null;
    const chargeRef = db.collection(ARENA_SCHEDULE_CHARGES).doc(str(group["chargeId"]) || "_");
    const chargeSnap = await tx.get(chargeRef);
    const charge = chargeSnap.exists ? chargeSnap.data() as Data : undefined;
    if (chargeStillBilledBy(charge, groupId)) return null;
    const state = str(group["state"]);
    let next: "voiding" | "void";
    if (LIVE_STATES.has(state)) next = "voiding";
    else if (state === "needs_cpf" || state === "autopay") next = "void";
    else return null;
    tx.set(groupRef, {
      state: next, voidReason: voidReasonOf(charge, groupId),
      ...(next === "void" ? {voidedAt: FieldValue.serverTimestamp()} : {}),
      updatedAt: FieldValue.serverTimestamp(),
    }, {merge: true});
    const mirror = asaasOf(charge);
    if (charge && mirror["groupId"] === groupId) tx.set(chargeRef, {asaas: {...mirror, state: next}}, {merge: true});
    return next;
  });
}

/** A mensalidade saiu de "em aberto" sem ser paga online: anula o grupo do espelho dela. */
export async function requestScheduleAsaasVoid(db: Firestore, chargeId: string): Promise<string | null> {
  const charge = (await db.collection(ARENA_SCHEDULE_CHARGES).doc(chargeId).get()).data();
  const groupId = str(asaasOf(charge)["groupId"]);
  if (!charge || !groupId || charge["status"] === "open" || charge["paidVia"] === "asaas") return null;
  return requestScheduleGroupVoid(db, groupId);
}

/** `failed` só por cima de `creating`: anulação no meio do caminho não pode ser desfeita. */
async function markFailedIfCreating(db: Firestore, groupId: string, error: string, olderThanMs?: number): Promise<boolean> {
  const groupRef = groupsCol(db).doc(groupId);
  return db.runTransaction(async (tx: Transaction) => {
    const group = (await tx.get(groupRef)).data();
    if (!group || group["state"] !== "creating") return false;
    if (olderThanMs != null && millisOf(group["updatedAt"]) > olderThanMs) return false;
    tx.set(groupRef, {state: "failed", lastError: error, updatedAt: FieldValue.serverTimestamp()}, {merge: true});
    return true;
  });
}

// ---------------------------------------------------------------------------
// Worker: criar e anular no Asaas
// ---------------------------------------------------------------------------

/** Cria (uma vez) a cobrança Asaas do grupo e espelha o link na mensalidade. */
export async function ensureScheduleAsaasPayment(
  db: Firestore,
  groupId: string,
  deps: ScheduleAsaasDeps = defaultScheduleAsaasDeps,
): Promise<{state: string}> {
  const groupRef = groupsCol(db).doc(groupId);
  const claimed = await db.runTransaction(async (tx: Transaction) => {
    const snap = await tx.get(groupRef);
    const group = snap.data();
    if (!snap.exists || !group) return null;
    if (group["state"] !== "pending" && group["state"] !== "failed") return null;
    const chargeSnap = await tx.get(db.collection(ARENA_SCHEDULE_CHARGES).doc(str(group["chargeId"]) || "_"));
    const charge = chargeSnap.exists ? chargeSnap.data() as Data : undefined;
    if (!chargeStillBilledBy(charge, groupId)) {
      // Mensalidade resolvida (ou trocada de grupo) antes de a cobrança nascer: nada a criar.
      // (Um `failed` por timeout pode ter criado no Asaas sem sabermos o id; se pagarem, o webhook
      // vê o grupo anulado e estorna.)
      tx.set(groupRef, {
        state: "void", voidReason: voidReasonOf(charge, groupId), voidedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      }, {merge: true});
      return null;
    }
    tx.set(groupRef, {
      state: "creating",
      attempt: Number(group["attempt"] ?? 0) + 1,
      claimedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    }, {merge: true});
    return group as Data;
  });
  if (!claimed) return {state: String((await groupRef.get()).data()?.["state"] ?? "missing")};

  const payerId = str(claimed["payerAthleteId"]);
  const customerAthleteId = str(claimed["customerAthleteId"]) || payerId;
  let created: {paymentId: string; invoiceUrl: string; status: string};
  try {
    const customerId = customerAthleteId ? await deps.resolveCustomer(customerAthleteId) : null;
    if (!customerId) {
      await settle(db, groupId, "needs_cpf", {});
      return {state: "needs_cpf"};
    }
    created = await deps.createPayment({
      groupId,
      customerId,
      valueReais: Number(claimed["amountReais"] ?? 0),
      dueDate: str(claimed["dueDate"]),
      description: str(claimed["description"]) || "Mensalidade",
    });
  } catch (e) {
    logger.error(`ensureScheduleAsaasPayment ${groupId}: falhou`, e);
    if (await markFailedIfCreating(db, groupId, e instanceof Error ? e.message : String(e))) {
      await mirrorGroupState(db, groupId, "failed");
      return {state: "failed"};
    }
    // Anularam o grupo enquanto o Asaas falhava: fica como está (o void cuida).
    return {state: String((await groupRef.get()).data()?.["state"] ?? "missing")};
  }

  const state = await settle(db, groupId, "open", created);
  if (state === "void") {
    // Anularam o grupo enquanto a cobrança nascia: ela não pode ficar viva no Asaas.
    await deps.deletePayment(created.paymentId).catch((e) =>
      logger.warn(`ensureScheduleAsaasPayment ${groupId}: não apagou ${created.paymentId} criado após a anulação`, e));
  }
  const pushTo = payerId || customerAthleteId;
  if (state === "open" && pushTo && claimed["silentLink"] !== true) {
    const amount = Number(claimed["amountReais"] ?? 0);
    try {
      await deps.notify({
        userId: pushTo,
        title: "Mensalidade disponível",
        body: `${str(claimed["description"]) || "Mensalidade"} · ${brl(amount)}. Toque para pagar com Pix ou cartão.`,
        type: SCHEDULE_CHARGE_LINK_TYPE,
        data: {
          chargeId: str(claimed["chargeId"]),
          subscriptionId: str(claimed["subscriptionId"]),
          arenaId: str(claimed["arenaId"]),
          invoiceUrl: created.invoiceUrl,
          webUrl: created.invoiceUrl,
          url: ATHLETE_PLANS_URL,
        },
      });
    } catch (e) {
      logger.warn(`ensureScheduleAsaasPayment ${groupId}: push falhou`, e);
    }
  }
  return {state};
}

/** Espelho na mensalidade, se ela ainda aponta para o grupo e segue em aberto. */
async function mirrorGroupState(db: Firestore, groupId: string, state: ClassAsaasState): Promise<void> {
  await db.runTransaction(async (tx: Transaction) => {
    const group = (await tx.get(groupsCol(db).doc(groupId))).data() ?? {};
    const chargeSnap = await tx.get(db.collection(ARENA_SCHEDULE_CHARGES).doc(str(group["chargeId"]) || "_"));
    const charge = chargeSnap.data();
    const mirror = asaasOf(charge);
    if (!chargeSnap.exists || charge?.["status"] !== "open" || mirror["groupId"] !== groupId) return;
    if (group["state"] !== state) return;
    tx.set(chargeSnap.ref, {asaas: {...mirror, state}}, {merge: true});
  });
}

/**
 * Fecha a criação: grupo ainda `creating` vira `open` (ou `needs_cpf`); se no meio do caminho
 * pediram para anular (`voiding`), só guarda o `paymentId` — o gatilho roda o void com ele.
 */
async function settle(
  db: Firestore,
  groupId: string,
  next: "open" | "needs_cpf",
  created: Partial<{paymentId: string; invoiceUrl: string; status: string}>,
): Promise<string> {
  const groupRef = groupsCol(db).doc(groupId);
  return db.runTransaction(async (tx: Transaction) => {
    const snap = await tx.get(groupRef);
    const group = (snap.data() ?? {}) as Data;
    const chargeSnap = await tx.get(db.collection(ARENA_SCHEDULE_CHARGES).doc(str(group["chargeId"]) || "_"));
    const ids = {paymentId: created.paymentId ?? null, invoiceUrl: created.invoiceUrl ?? null};
    if (group["state"] !== "creating") {
      tx.set(groupRef, {...ids, updatedAt: FieldValue.serverTimestamp()}, {merge: true});
      return String(group["state"] ?? "");
    }
    tx.set(groupRef, {
      ...ids, state: next, asaasStatus: created.status ?? null, updatedAt: FieldValue.serverTimestamp(),
    }, {merge: true});
    const charge = chargeSnap.data();
    if (chargeSnap.exists && charge?.["status"] === "open" && asaasOf(charge)["groupId"] === groupId) {
      tx.set(chargeSnap.ref, {
        asaas: chargeAsaasMirror(groupId, next, {invoiceUrl: ids.invoiceUrl, status: created.status ?? null}),
      }, {merge: true});
    }
    return next;
  });
}

/** Status em que a cobrança ainda pode ser paga — DELETE que falhou nesses é falha passageira. */
const STILL_PAYABLE_STATUSES = new Set(["PENDING", "OVERDUE", "AWAITING_RISK_ANALYSIS"]);
/** Tentativas de apagar no Asaas antes de fechar o grupo como `void` mesmo assim. */
export const MAX_VOID_ATTEMPTS = 10;

/** Apaga o pagamento do grupo no Asaas (se houver) e fecha o grupo como `void`. */
export async function voidScheduleAsaasPayment(
  db: Firestore,
  groupId: string,
  deps: ScheduleAsaasDeps = defaultScheduleAsaasDeps,
): Promise<{state: string}> {
  const groupRef = groupsCol(db).doc(groupId);
  const before = (await groupRef.get()).data();
  if (!before || before["state"] !== "voiding") return {state: String(before?.["state"] ?? "missing")};
  const paymentId = typeof before["paymentId"] === "string" ? before["paymentId"] : "";
  let voidError: string | null = null;
  let transient = false;
  if (paymentId) {
    try {
      await deps.deletePayment(paymentId);
    } catch (e) {
      voidError = e instanceof Error ? e.message : String(e);
      logger.warn(`voidScheduleAsaasPayment ${groupId}: não apagou ${paymentId} no Asaas`, e);
      // Recebido/confirmado ou já apagado: o webhook resolve (estorna se a mensalidade não está mais
      // em aberto). Ainda cobrável (ou nem deu para consultar): falha passageira, tenta de novo.
      try {
        const current = await deps.getPayment(paymentId);
        transient = current.deleted !== true && STILL_PAYABLE_STATUSES.has((current.status || "").toUpperCase());
      } catch (lookupError) {
        logger.warn(`voidScheduleAsaasPayment ${groupId}: consulta de ${paymentId} falhou`, lookupError);
        transient = true;
      }
    }
  }

  return db.runTransaction(async (tx: Transaction) => {
    const snap = await tx.get(groupRef);
    const group = (snap.data() ?? {}) as Data;
    if (group["state"] !== "voiding") return {state: String(group["state"] ?? "")};
    if (transient) {
      const attempts = Number(group["voidAttempts"] ?? 0) + 1;
      if (attempts < MAX_VOID_ATTEMPTS) {
        // Segue `voiding`: a varredura tenta de novo (o gatilho do grupo não reage a esta escrita).
        tx.set(groupRef, {voidAttempts: attempts, voidError, updatedAt: FieldValue.serverTimestamp()}, {merge: true});
        return {state: "voiding"};
      }
      logger.error(`voidScheduleAsaasPayment ${groupId}: ${paymentId} não apagou após ${attempts} tentativas — ` +
        "fechando como void; conferir no Asaas (pago depois vira estorno pelo webhook)", {groupId, paymentId, voidError});
    }
    // Criação ainda em voo sem `paymentId`: espera o worker gravar o id (o gatilho roda de novo).
    if (!paymentId && group["paymentId"]) return {state: "voiding"};
    const chargeSnap = await tx.get(db.collection(ARENA_SCHEDULE_CHARGES).doc(str(group["chargeId"]) || "_"));
    tx.set(groupRef, {
      state: "void", voidedAt: FieldValue.serverTimestamp(), voidError, updatedAt: FieldValue.serverTimestamp(),
    }, {merge: true});
    const mirror = asaasOf(chargeSnap.data());
    if (chargeSnap.exists && mirror["groupId"] === groupId) {
      tx.set(chargeSnap.ref, {asaas: {...mirror, state: "void"}}, {merge: true});
    }
    return {state: "void"};
  });
}

// ---------------------------------------------------------------------------
// Gatilhos
// ---------------------------------------------------------------------------

/**
 * O que o gatilho da mensalidade faz com um par antes/depois. Ele escreve na própria mensalidade
 * (`billingMode`, espelho), e essas escritas não casam com nenhum ramo: decidida deixa de ser
 * `null`, e o espelho do void é gravado com a mensalidade já fora de "em aberto".
 */
export function scheduleChargeTriggerAction(before: Data | undefined, after: Data | undefined): "decide" | "void" | null {
  if (!after) return null;
  if (after["status"] === "open" && after["billingMode"] === null) return "decide";
  if (before?.["status"] === "open" && after["status"] !== "open" && after["paidVia"] !== "asaas" &&
    str(asaasOf(after)["groupId"])) {
    return "void";
  }
  return null;
}

/** A 1ª mensalidade do titular acabou de ser paga (online ou baixa do gestor): ativa a assinatura. */
export function activatesSubscription(before: Data | undefined, after: Data | undefined): boolean {
  return before?.["status"] === "open" && after?.["status"] === "paid" &&
    after["kind"] === "first" && Number(after["payerIndex"] ?? 0) === 0;
}

/** A mensalidade saiu de "em aberto" com o débito ainda na fila (`scheduled`/`retry`). */
export function autopayLeftOpen(before: Data | undefined, after: Data | undefined): boolean {
  if (before?.["status"] !== "open" || !after || after["status"] === "open") return false;
  const state = str(autopayOf(after)["state"]);
  return state === "scheduled" || state === "retry";
}

/** Tira o débito da fila (`scheduled`/`retry` → `skipped`). Devolve se mudou. */
export async function skipScheduleAutopay(db: Firestore, chargeId: string, reason: string): Promise<boolean> {
  const ref = db.collection(ARENA_SCHEDULE_CHARGES).doc(chargeId);
  return db.runTransaction(async (tx: Transaction) => {
    const snap = await tx.get(ref);
    const charge = snap.data() as Data | undefined;
    if (!snap.exists || !charge) return false;
    const state = str(autopayOf(charge)["state"]);
    if (state !== "scheduled" && state !== "retry") return false;
    tx.set(ref, {autopay: {state: "skipped", lastError: reason}}, {merge: true});
    return true;
  });
}

export const onArenaScheduleChargeWritten = onDocumentWritten({
  document: `${ARENA_SCHEDULE_CHARGES}/{chargeId}`,
  secrets: [WEB_PUSH_PUBLIC_KEY, WEB_PUSH_PRIVATE_KEY, WEB_PUSH_SUBJECT],
}, async (event) => {
  const before = event.data?.before?.data();
  const after = event.data?.after?.data();
  const db = getFirestore();
  if (activatesSubscription(before, after)) await activatePendingSubscriptionCore(db, str(after?.["subscriptionId"]));
  const action = scheduleChargeTriggerAction(before, after);
  if (action === "decide") await decideScheduleChargeBilling(db, event.params.chargeId);
  else if (action === "void") await requestScheduleAsaasVoid(db, event.params.chargeId);
  if (autopayLeftOpen(before, after)) await skipScheduleAutopay(db, event.params.chargeId, "charge_resolved");
});

/** Gatilho: grupo novo/retentado → cria no Asaas; pedido de anulação → apaga. */
export const onArenaScheduleAsaasPaymentWritten = onDocumentWritten({
  document: `${ARENA_SCHEDULE_ASAAS_PAYMENTS}/{groupId}`,
  secrets: [...asaasArenaSecrets, WEB_PUSH_PUBLIC_KEY, WEB_PUSH_PRIVATE_KEY, WEB_PUSH_SUBJECT],
}, async (event) => {
  const after = event.data?.after?.data();
  if (!after) return;
  const before = event.data?.before?.data();
  const groupId = event.params.groupId;
  const db = getFirestore();
  if (after["state"] === "pending" && before?.["state"] !== "pending") {
    await ensureScheduleAsaasPayment(db, groupId);
  } else if (after["state"] === "voiding" &&
    (before?.["state"] !== "voiding" || (!before?.["paymentId"] && after["paymentId"]))) {
    await voidScheduleAsaasPayment(db, groupId);
  }
});

// ---------------------------------------------------------------------------
// Varredura
// ---------------------------------------------------------------------------

const STUCK_CREATING_MS = 15 * 60_000;
const RETRY_AFTER_MS = 2 * 60_000;
/** Consulta ao Asaas de uma cobrança aberta: no máximo a cada 6h. */
const RECHECK_OPEN_MS = 6 * 60 * 60_000;
const PAID_STATUSES = new Set(["RECEIVED", "RECEIVED_IN_CASH", "CONFIRMED"]);

function millisOf(v: unknown): number {
  return v instanceof Timestamp ? v.toMillis() : 0;
}

export async function reconcileScheduleAsaasPayments(
  db: Firestore,
  now: Date,
  deps: ScheduleAsaasDeps = defaultScheduleAsaasDeps,
  autopayDeps: AutopayDeps = defaultAutopayDeps,
): Promise<{
  decided: number; staleVoided: number; created: number; voided: number; reconciled: number;
  autopayResumed: number; autopayLinked: number;
}> {
  const col = groupsCol(db);
  let decided = 0;
  let staleVoided = 0;
  let created = 0;
  let voided = 0;
  let reconciled = 0;

  // Mensalidades que o gatilho não decidiu (queda, deploy no meio). A decisão é idempotente.
  const undecided = await db.collection(ARENA_SCHEDULE_CHARGES)
    .where("status", "==", "open").where("billingMode", "==", null).limit(200).get();
  for (const doc of undecided.docs) {
    try {
      if ((await decideScheduleChargeBilling(db, doc.id)).billingMode) decided += 1;
    } catch (e) {
      logger.warn(`reconcileScheduleAsaasPayments: decidir ${doc.id} falhou`, e);
    }
  }

  // Grupos cuja mensalidade já foi resolvida (gatilho perdido/atrasado): anula.
  for (const state of ["pending", "failed", "open", "needs_cpf", "autopay"]) {
    const snap = await col.where("state", "==", state).limit(200).get();
    for (const doc of snap.docs) {
      const chargeId = str(doc.data()["chargeId"]);
      const charge = chargeId ? (await db.collection(ARENA_SCHEDULE_CHARGES).doc(chargeId).get()).data() : undefined;
      if (chargeStillBilledBy(charge, doc.id)) continue;
      // Débito em voo: a tentativa decide (paga com a mensalidade resolvida, o webhook estorna).
      if (state === "autopay" && str(autopayOf(charge)["state"]) === "charging") continue;
      try {
        if (await requestScheduleGroupVoid(db, doc.id)) staleVoided += 1;
      } catch (e) {
        logger.warn(`reconcileScheduleAsaasPayments: anular ${doc.id} falhou`, e);
      }
    }
  }

  for (const state of ["pending", "failed", "creating"]) {
    const snap = await col.where("state", "==", state).limit(100).get();
    for (const doc of snap.docs) {
      const age = now.getTime() - millisOf(doc.data()["updatedAt"]);
      if (state === "creating") {
        if (age < STUCK_CREATING_MS) continue;
        if (!(await markFailedIfCreating(db, doc.id, "stuck_creating", now.getTime() - STUCK_CREATING_MS))) continue;
      } else if (age < RETRY_AFTER_MS) {
        continue;
      }
      if ((await ensureScheduleAsaasPayment(db, doc.id, deps)).state === "open") created += 1;
    }
  }

  const voiding = await col.where("state", "==", "voiding").limit(100).get();
  for (const doc of voiding.docs) {
    if (now.getTime() - millisOf(doc.data()["updatedAt"]) < RETRY_AFTER_MS) continue;
    if ((await voidScheduleAsaasPayment(db, doc.id, deps)).state === "void") voided += 1;
  }

  // Abertas que já venceram ou vencem em até 3 dias: é aí que o pagamento acontece (webhook perdido).
  const horizon = addDaysToDateKey(dayKeyFromEventDate(now), 3);
  const open = await col.where("state", "==", "open").where("dueDate", "<=", horizon).limit(200).get();
  const projectId = getFirebaseProjectId();
  for (const doc of open.docs) {
    const data = doc.data();
    const paymentId = typeof data["paymentId"] === "string" ? data["paymentId"] : "";
    if (!paymentId || now.getTime() - millisOf(data["lastCheckedAt"]) < RECHECK_OPEN_MS) continue;
    try {
      const payment = await deps.getPayment(paymentId);
      await doc.ref.set({lastCheckedAt: Timestamp.fromDate(now)}, {merge: true});
      const status = (payment.status || "").toUpperCase();
      const newlyOverdue = status === "OVERDUE" && data["asaasStatus"] !== "OVERDUE";
      if (!PAID_STATUSES.has(status) && payment.deleted !== true && !newlyOverdue) continue;
      const processedRef = db.doc(`artifacts/${projectId}/public/data/asaas_processed_payments/${paymentId}`);
      await processArenaScheduleAsaasNotification(db, paymentId, payment, processedRef);
      if (PAID_STATUSES.has(status)) reconciled += 1;
    } catch (e) {
      logger.warn(`reconcileScheduleAsaasPayments: ${doc.id} falhou`, e);
    }
  }
  // Débito automático: destrava `charging` antigas e põe o link nas agendadas esquecidas.
  let autopay = {resumed: 0, linked: 0};
  try {
    autopay = await recoverScheduleAutopay(db, now, autopayDeps);
  } catch (e) {
    logger.warn("reconcileScheduleAsaasPayments: recuperação do débito automático falhou", e);
  }
  return {decided, staleVoided, created, voided, reconciled, autopayResumed: autopay.resumed, autopayLinked: autopay.linked};
}

export const reconcileArenaScheduleAsaasPayments = onSchedule({
  schedule: "every 30 minutes",
  timeZone: "America/Sao_Paulo",
  secrets: [...asaasArenaSecrets, WEB_PUSH_PUBLIC_KEY, WEB_PUSH_PRIVATE_KEY, WEB_PUSH_SUBJECT],
}, async () => {
  const result = await reconcileScheduleAsaasPayments(getFirestore(), new Date());
  if (Object.values(result).some((n) => n > 0)) {
    logger.info("reconcileArenaScheduleAsaasPayments", result);
  }
});

// ---------------------------------------------------------------------------
// Prazo de 30 min da assinatura pelo app
// ---------------------------------------------------------------------------

/**
 * Assinaturas aguardando pagamento com o prazo vencido: libera o horário. Antes, confere a 1ª
 * mensalidade no Asaas — paga sem o webhook ter chegado fica para o webhook (ou a varredura) dar baixa.
 */
export async function expireSchedulePendingPayments(
  db: Firestore,
  now: Date,
  deps: ScheduleAsaasDeps = defaultScheduleAsaasDeps,
): Promise<{expired: number; waitingWebhook: number}> {
  const nowMs = now.getTime();
  const todayKey = dayKeyFromEventDate(now);
  const snap = await db.collection(ARENA_SCHEDULE_SUBSCRIPTIONS).where("status", "==", PENDING_PAYMENT_STATUS).limit(200).get();
  let expired = 0;
  let waitingWebhook = 0;
  for (const doc of snap.docs) {
    const until = millisOf(doc.data()["pendingPaymentUntil"]);
    if (until > nowMs) continue;
    try {
      if (await firstChargePaidAtAsaas(db, doc.id, deps)) {
        waitingWebhook += 1;
        continue;
      }
      if (await expirePendingSubscriptionCore(db, doc.id, todayKey, nowMs)) expired += 1;
    } catch (e) {
      logger.warn(`expireSchedulePendingPayments ${doc.id}: falhou`, e);
    }
  }
  return {expired, waitingWebhook};
}

/** A cobrança da 1ª mensalidade do titular já consta paga no Asaas? */
async function firstChargePaidAtAsaas(db: Firestore, subscriptionId: string, deps: ScheduleAsaasDeps): Promise<boolean> {
  const charges = await db.collection(ARENA_SCHEDULE_CHARGES).where("subscriptionId", "==", subscriptionId).get();
  for (const c of charges.docs) {
    const data = c.data() as Data;
    if (data["kind"] !== "first" || Number(data["payerIndex"] ?? 0) !== 0) continue;
    const groupId = str(asaasOf(data)["groupId"]);
    const group = groupId ? (await groupsCol(db).doc(groupId).get()).data() ?? {} : {};
    if (group["state"] === "paid") return true;
    const paymentId = str(group["paymentId"]);
    if (paymentId) {
      const payment = await deps.getPayment(paymentId);
      if (PAID_STATUSES.has(str(payment.status).toUpperCase())) return true;
    }
    const tokenCharges = group["tokenCharges"];
    if (tokenCharges != null && typeof tokenCharges === "object") {
      for (const t of Object.values(tokenCharges as Data)) {
        const tc = (t ?? {}) as Data;
        if (tc["status"] === "paid") return true;
        const tokenPaymentId = str(tc["paymentId"]);
        if (!tokenPaymentId) continue;
        const payment = await deps.getPayment(tokenPaymentId);
        if (PAID_STATUSES.has(str(payment.status).toUpperCase())) return true;
      }
    }
    return false;
  }
  return false;
}

export const expireArenaSchedulePendingPayments = onSchedule({
  schedule: "every 5 minutes",
  timeZone: "America/Sao_Paulo",
  secrets: [...asaasArenaSecrets, WEB_PUSH_PUBLIC_KEY, WEB_PUSH_PRIVATE_KEY, WEB_PUSH_SUBJECT],
}, async () => {
  const result = await expireSchedulePendingPayments(getFirestore(), new Date());
  if (result.expired || result.waitingWebhook) logger.info("expireArenaSchedulePendingPayments", result);
});

// ---------------------------------------------------------------------------
// "Pagar" do app
// ---------------------------------------------------------------------------

const NEEDS_NEW_GROUP = new Set(["", "needs_cpf", "void", "voiding"]);

/**
 * Link da fatura da mensalidade para quem a vê (`visibleTo`). Sem CPF guardado pede o CPF; com CPF
 * grava o cliente e, se o grupo não serve (sem CPF, anulado, ausente), cria um grupo novo cobrado
 * de quem pediu e gera o link na hora.
 */
export async function getScheduleChargePaymentLinkCore(
  db: Firestore,
  uid: string,
  chargeIdRaw: unknown,
  cpfRaw: unknown,
  deps: ScheduleAsaasDeps = defaultScheduleAsaasDeps,
  opts: {waitMs?: number; pollMs?: number} = {},
): Promise<{invoiceUrl: string}> {
  const chargeId = str(chargeIdRaw);
  if (!chargeId || chargeId.includes("/")) throw new HttpsError("invalid-argument", "Mensalidade inválida.");
  const chargeRef = db.collection(ARENA_SCHEDULE_CHARGES).doc(chargeId);
  let snap = await chargeRef.get();
  if (!snap.exists) throw new HttpsError("not-found", "Mensalidade não encontrada.");
  let charge = snap.data() as Data;
  const visibleTo = Array.isArray(charge["visibleTo"]) ? (charge["visibleTo"] as unknown[]).map(String) : [];
  if (!visibleTo.includes(uid)) throw new HttpsError("permission-denied", "Esta mensalidade não é sua.");

  if (charge["status"] === "open" && charge["billingMode"] === null) {
    // O gatilho ainda não decidiu: decide aqui (idempotente).
    await decideScheduleChargeBilling(db, chargeId);
    snap = await chargeRef.get();
    charge = snap.data() as Data;
  }
  if (charge["status"] === "paid") throw new HttpsError("failed-precondition", "Esta mensalidade já foi paga.");
  if (charge["status"] === "canceled") throw new HttpsError("failed-precondition", "Esta mensalidade foi cancelada.");
  if (charge["status"] !== "open" || charge["billingMode"] !== "asaas") {
    throw new HttpsError("failed-precondition", ONSITE_ONLY_MESSAGE);
  }

  // CPF digitado: grava o cliente antes de tudo (o worker acha o cliente pelo atleta).
  const cpfGiven = cpfRaw != null && str(cpfRaw) !== "";
  if (cpfGiven) {
    const digits = normalizeCpfCnpj(str(cpfRaw));
    if (!isValidCpfCnpj(digits)) throw new HttpsError("invalid-argument", "CPF inválido. Confira os números.");
    await deps.registerCustomer(uid, digits);
  }

  const deadline = Date.now() + (opts.waitMs ?? 10_000);
  const pollMs = opts.pollMs ?? 1_000;
  let createdHere = false;
  for (let i = 0; i < 40; i++) {
    const current = (await chargeRef.get()).data() as Data;
    if (current["status"] !== "open") throw new HttpsError("failed-precondition", "Esta mensalidade não está mais em aberto.");
    const groupId = str(asaasOf(current)["groupId"]);
    const group = groupId ? (await groupsCol(db).doc(groupId).get()).data() ?? {} : {};
    const state = str(group["state"]);
    const invoiceUrl = str(group["invoiceUrl"]);
    if (state === "open" && invoiceUrl) return {invoiceUrl};

    if (state === "pending" || state === "failed") {
      // Gera na hora (a disputa com o gatilho do grupo é decidida na transação do claim).
      const out = await ensureScheduleAsaasPayment(db, groupId, deps);
      if (out.state === "failed") break;
      if (out.state !== "creating") continue;
    }
    if (state === "creating" || state === "pending" || state === "failed" || state === "open") {
      // Outro worker está criando (ou aberto sem link ainda): espera curta relendo.
      if (Date.now() >= deadline) break;
      await deps.sleep(pollMs);
      continue;
    }
    if (!NEEDS_NEW_GROUP.has(state)) break;
    if (createdHere) {
      if (state === "needs_cpf") throw new HttpsError("failed-precondition", CPF_REQUIRED_MESSAGE);
      break;
    }
    // Grupo sem CPF, anulado ou ausente: cobra de quem está pedindo.
    if (!cpfGiven && !(await deps.resolveCustomer(uid))) {
      throw new HttpsError("failed-precondition", CPF_REQUIRED_MESSAGE);
    }
    await db.runTransaction(async (tx: Transaction) => {
      const fresh = await tx.get(chargeRef);
      const data = (fresh.data() ?? {}) as Data;
      if (data["status"] !== "open" || data["billingMode"] !== "asaas") return;
      const mirror = asaasOf(data);
      const currentGroupId = str(mirror["groupId"]);
      const oldRef = currentGroupId ? groupsCol(db).doc(currentGroupId) : null;
      const old = oldRef ? (await tx.get(oldRef)).data() : undefined;
      // Outro "Pagar" já trocou o grupo: usa o dele.
      if (currentGroupId !== groupId) return;
      const subSnap = await tx.get(db.collection(ARENA_SCHEDULE_SUBSCRIPTIONS).doc(str(data["subscriptionId"]) || "_"));
      if (oldRef && old?.["state"] === "needs_cpf") {
        tx.set(oldRef, {state: "void", voidReason: "replaced", voidedAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp()}, {merge: true});
      }
      const newRef = groupsCol(db).doc();
      tx.set(newRef, scheduleAsaasGroupData(chargeId, data, {
        customerAthleteId: uid, arenaName: str(subSnap.data()?.["arenaName"]), silentLink: true,
      }));
      tx.set(chargeRef, {asaas: chargeAsaasMirror(newRef.id, "pending")}, {merge: true});
    });
    createdHere = true;
  }

  const finalGroupId = str(asaasOf((await chargeRef.get()).data())["groupId"]);
  const finalState = finalGroupId ? str((await groupsCol(db).doc(finalGroupId).get()).data()?.["state"]) : "";
  if (finalState === "failed") {
    throw new HttpsError("unavailable", "Não foi possível gerar o link agora. Tente de novo em instantes.");
  }
  throw new HttpsError("unavailable", LINK_PENDING_MESSAGE);
}

export const PAYMENT_WINDOW_CLOSED_MESSAGE =
  "O prazo de 30 minutos para pagar acabou e o horário foi liberado. Assine de novo.";

/** Assinatura aguardando pagamento com o prazo vencido não gera mais cobrança. */
async function assertPaymentWindowOpen(db: Firestore, chargeId: string): Promise<void> {
  if (!chargeId || chargeId.includes("/")) return;
  const charge = (await db.collection(ARENA_SCHEDULE_CHARGES).doc(chargeId).get()).data();
  const subId = str(charge?.["subscriptionId"]);
  if (!subId) return;
  const sub = (await db.collection(ARENA_SCHEDULE_SUBSCRIPTIONS).doc(subId).get()).data() ?? {};
  if (sub["status"] === PENDING_PAYMENT_STATUS && millisOf(sub["pendingPaymentUntil"]) <= Date.now()) {
    throw new HttpsError("failed-precondition", PAYMENT_WINDOW_CLOSED_MESSAGE);
  }
}

export const PIX_UNAVAILABLE_MESSAGE = "Não foi possível gerar o Pix agora. Tente de novo ou pague com cartão.";

/**
 * Tela de pagamento do app: garante a cobrança como o "Pagar" e, com `method: "pix"`, devolve o QR
 * do Pix da MESMA cobrança — a fatura é `UNDEFINED`, que o Asaas aceita no QR. Cartão abre o link
 * (checkout hospedado). Uma cobrança só por mensalidade: webhook, estorno e anulação não mudam.
 */
export async function getScheduleChargeCheckoutCore(
  db: Firestore,
  uid: string,
  chargeIdRaw: unknown,
  cpfRaw: unknown,
  methodRaw: unknown,
  deps: ScheduleAsaasDeps = defaultScheduleAsaasDeps,
  opts: {waitMs?: number; pollMs?: number} = {},
): Promise<{
  invoiceUrl: string; amountReais: number; qrCode?: string; qrCodeBase64?: string;
  chargedReais?: number; cardFeeReais?: number; cardFeePercent?: number;
  cardProcessingPercent?: number; cardFixedReais?: number;
}> {
  await assertPaymentWindowOpen(db, str(chargeIdRaw));
  const {invoiceUrl} = await getScheduleChargePaymentLinkCore(db, uid, chargeIdRaw, cpfRaw, deps, opts);
  const charge = ((await db.collection(ARENA_SCHEDULE_CHARGES).doc(str(chargeIdRaw)).get()).data() ?? {}) as Data;
  const amountReais = Number(charge["amountReais"] ?? 0);
  const method = str(methodRaw);
  // `method` ausente (apps antigos) = a fatura de sempre, que aceita Pix e cartão sem taxa.
  if (method === "card") return scheduleCardCheckout(db, charge, amountReais, invoiceUrl, deps);
  if (method !== "pix") return {invoiceUrl, amountReais};
  const groupId = str(asaasOf(charge)["groupId"]);
  const paymentId = groupId ? str((await groupsCol(db).doc(groupId).get()).data()?.["paymentId"]) : "";
  if (!paymentId) throw new HttpsError("unavailable", LINK_PENDING_MESSAGE);
  try {
    const qr = await deps.fetchPixQrCode(paymentId);
    return {invoiceUrl, amountReais, qrCode: qr.qrCode, qrCodeBase64: qr.qrCodeBase64};
  } catch (e) {
    logger.warn(`getScheduleChargeCheckoutCore: QR do Pix de ${paymentId} falhou`, e);
    throw new HttpsError("unavailable", PIX_UNAVAILABLE_MESSAGE);
  }
}

/**
 * Cartão: cobrança à parte, só cartão, com as taxas do cartão por cima do valor do grupo. A fatura
 * do grupo segue viva para o Pix; a que for paga primeiro quita a mensalidade e a outra, se paga
 * depois, é estornada pelo webhook (mensalidade já resolvida). O acréscimo de cada cobrança de cartão
 * fica no grupo (`cardCharges.{paymentId}`: total e a parte do processamento), onde o webhook o tira
 * do bruto. Sem acréscimo, a fatura de sempre.
 */
async function scheduleCardCheckout(
  db: Firestore,
  charge: Data,
  amountReais: number,
  invoiceUrl: string,
  deps: ScheduleAsaasDeps,
) {
  const groupId = str(asaasOf(charge)["groupId"]);
  const groupRef = groupsCol(db).doc(groupId);
  const group = ((await groupRef.get()).data() ?? {}) as Data;
  const baseReais = Number(group["amountReais"] ?? amountReais);
  if (!deps.cardFeeTerms || !deps.createCardPayment) return {invoiceUrl, amountReais};
  const terms = await deps.cardFeeTerms();
  const surcharge = cardSurcharge(baseReais, terms);
  const feeCents = surcharge.totalCents;
  if (feeCents <= 0) return {invoiceUrl, amountReais};

  const customerAthleteId = str(group["customerAthleteId"]) || str(group["payerAthleteId"]);
  const customerId = customerAthleteId ? await deps.resolveCustomer(customerAthleteId) : null;
  if (!customerId) throw new Error("ASAAS_CUSTOMER_CPF_REQUIRED");
  const chargedReais = (Math.round(baseReais * 100) + feeCents) / 100;
  const card = await deps.createCardPayment({
    groupId,
    customerId,
    valueReais: chargedReais,
    description: str(group["description"]) || "Mensalidade",
    feeCents,
  });
  await groupRef.set({
    cardCharges: {[card.paymentId]: {feeCents, processingCents: surcharge.processingCents}},
    updatedAt: FieldValue.serverTimestamp(),
  }, {merge: true});
  return {
    invoiceUrl: card.invoiceUrl, amountReais, chargedReais, cardFeeReais: feeCents / 100,
    ...cardFeePreviewFields(terms),
  };
}

export const getArenaScheduleChargePaymentLink = onCall({
  region: CLIENT_FACING_REGIONS,
  timeoutSeconds: 60,
  secrets: [...asaasArenaSecrets, WEB_PUSH_PUBLIC_KEY, WEB_PUSH_PRIVATE_KEY, WEB_PUSH_SUBJECT],
}, async (request) => {
  const uid = requireUid(request.auth);
  const input = (request.data ?? {}) as Data;
  try {
    // `method` ausente (apps antigos) = só o link, como antes.
    return await getScheduleChargeCheckoutCore(getFirestore(), uid, input["chargeId"], input["cpfCnpj"], input["method"]);
  } catch (e) {
    if (e instanceof Error && e.message === "ASAAS_CUSTOMER_CPF_REQUIRED") {
      throw new HttpsError("failed-precondition", CPF_REQUIRED_MESSAGE);
    }
    return rethrowSchedule("getArenaScheduleChargePaymentLink", e);
  }
});
