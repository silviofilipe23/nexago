/**
 * Cobrança online das mensalidades de aula — o worker que fala com o Asaas.
 *
 * O billing (`arena-class-billing.ts`) só grava grupos `pending`/`voiding` nas transações dele; daqui:
 * - `ensureClassAsaasPayment`: assume o grupo (`pending|failed → creating`) numa transação, cria a
 *   cobrança no Asaas (fatura hospedada, PIX ou cartão) com chave de idempotência por grupo, grava o
 *   link e avisa o aluno com conta por push;
 * - `voidClassAsaasPayment`: apaga o pagamento no Asaas e reagrupa as mensalidades que ainda estão
 *   em aberto no grupo (baixa manual de uma parte do 1º pagamento, por exemplo);
 * - gatilho no grupo (criação/anulação na hora) e varredura a cada 30 min (grupo travado, webhook
 *   perdido — o `asaasWebhook` sempre responde 200, então o Asaas não reenvia).
 */
import * as logger from "firebase-functions/logger";
import {onDocumentWritten} from "firebase-functions/v2/firestore";
import {onSchedule} from "firebase-functions/v2/scheduler";
import {FieldValue, getFirestore, Timestamp, type Firestore, type Transaction} from "firebase-admin/firestore";
import {
  ARENA_CLASS_ASAAS_PAYMENTS,
  ARENA_CLASS_BILLING_PROFILES,
  ARENA_CLASS_CHARGES,
  CLASS_PAYMENT_REF_PREFIX,
  billingProfileId,
} from "./arena-class-constants";
import {chargeAsaasMirror, classAsaasGroupData} from "./arena-class-asaas-model";
import {asaasArenaSecrets, fetchAsaas, getAsaasEnvTag} from "./asaas-client";
import {
  createAsaasInvoiceCharge,
  deleteAsaasPaymentOrThrow,
  getAsaasPayment,
  type AsaasPaymentDetails,
} from "./asaas-booking-payment";
import {getOrCreateAsaasCustomer, isValidCpfCnpj, normalizeCpfCnpj, resolveAthleteCpfCnpj} from "./asaas-customer";
import {processArenaClassAsaasNotification} from "./asaas-arena-class-webhook";
import {getFirebaseProjectId} from "./firebase-paths";
import {dayKeyFromEventDate} from "./event-timezone";
import {addDaysToDateKey} from "./arena-recurring-booking";
import {deliverNotificationToUser, WEB_PUSH_PRIVATE_KEY, WEB_PUSH_PUBLIC_KEY, WEB_PUSH_SUBJECT} from "./notification-delivery";

export const CLASS_CHARGE_LINK_TYPE = "arena_class_charge_link";
/**
 * Rota do app no push da fatura: a agenda do atleta (existe nos builds da loja), onde a mensalidade
 * a pagar aparece. O app novo abre a fatura pelo tipo (antes do `url`); o antigo não conhece o tipo
 * e caía no ramo genérico de `arena` — a agenda do GESTOR. `webUrl` segue sendo a fatura (portal).
 */
export const CLASS_CHARGE_APP_URL = "/discover?tab=agenda";

export interface ClassAsaasDeps {
  /** Cliente Asaas do aluno; null = sem CPF (fica manual). */
  resolveCustomer: (input: {arenaId: string; studentId: string; athleteId: string | null; name: string}) => Promise<string | null>;
  createPayment: (input: {
    groupId: string; customerId: string; valueReais: number; dueDate: string; description: string;
  }) => Promise<{paymentId: string; invoiceUrl: string; status: string}>;
  /** Apaga a cobrança; lança se não der (já paga, por exemplo). 404 conta como apagada. */
  deletePayment: (paymentId: string) => Promise<void>;
  getPayment: (paymentId: string) => Promise<AsaasPaymentDetails>;
  notify: (input: {userId: string; title: string; body: string; type: string; data: Record<string, string>}) => Promise<void>;
}

/** No emulador, só sandbox: o projeto DEV aponta para o Asaas de produção. */
function assertAsaasAllowed(): void {
  if (process.env.FUNCTIONS_EMULATOR === "true" && getAsaasEnvTag() !== "sandbox") {
    throw new Error("ASAAS_BLOCKED_IN_EMULATOR");
  }
}

async function resolveClassCustomer(input: {arenaId: string; studentId: string; athleteId: string | null; name: string}): Promise<string | null> {
  assertAsaasAllowed();
  const db = getFirestore();
  const profileRef = db.collection(ARENA_CLASS_BILLING_PROFILES).doc(billingProfileId(input.arenaId, input.studentId));
  const profile = (await profileRef.get()).data();
  const cpf = normalizeCpfCnpj(profile?.["cpfCnpj"] as string | undefined);
  const env = getAsaasEnvTag();
  if (isValidCpfCnpj(cpf)) {
    const cached = typeof profile?.["asaasCustomerId"] === "string" ? profile["asaasCustomerId"] : "";
    if (cached && profile?.["asaasEnv"] === env) return cached;
    const created = await fetchAsaas<{id?: string}>("/v3/customers", {
      method: "POST",
      body: {
        name: input.name || "Aluno",
        cpfCnpj: cpf,
        externalReference: `classStudent:${input.arenaId}:${input.studentId}`,
        notificationDisabled: true,
      },
      idempotencyKey: `asaas-class-customer-${env}-${input.arenaId}-${input.studentId}-${cpf}`,
    });
    const id = created.id?.trim() ?? "";
    if (!id) throw new Error("ASAAS_CUSTOMER_CREATE_FAILED");
    await profileRef.set({asaasCustomerId: id, asaasEnv: env, updatedAt: FieldValue.serverTimestamp()}, {merge: true});
    return id;
  }
  if (!input.athleteId) return null;
  let athleteCpf: string;
  try {
    athleteCpf = await resolveAthleteCpfCnpj(input.athleteId);
  } catch {
    return null;
  }
  const email = String((await db.collection("users").doc(input.athleteId).get()).data()?.["email"] ?? "");
  return getOrCreateAsaasCustomer(input.athleteId, email, undefined, athleteCpf);
}

export const defaultClassAsaasDeps: ClassAsaasDeps = {
  resolveCustomer: resolveClassCustomer,
  createPayment: async (input) => {
    assertAsaasAllowed();
    return createAsaasInvoiceCharge({
      customerId: input.customerId,
      valueReais: input.valueReais,
      dueDate: input.dueDate,
      description: input.description,
      externalReference: `${CLASS_PAYMENT_REF_PREFIX}${input.groupId}`,
      // Mesmo grupo = mesma cobrança: retentativa do worker ou da varredura não duplica.
      idempotencyKey: `class-pay-${getAsaasEnvTag()}-${input.groupId}`,
    });
  },
  deletePayment: async (paymentId) => {
    assertAsaasAllowed();
    await deleteAsaasPaymentOrThrow(paymentId);
  },
  getPayment: (paymentId) => getAsaasPayment(paymentId),
  notify: async (input) => {
    await deliverNotificationToUser({...input, requireInteraction: false});
  },
};

function brl(value: number): string {
  return value.toLocaleString("pt-BR", {style: "currency", currency: "BRL"});
}

/** Mensalidades do grupo que seguem "em aberto" e apontam para ele. */
function chargesOfGroup(snaps: FirebaseFirestore.DocumentSnapshot[], groupId: string): FirebaseFirestore.DocumentSnapshot[] {
  return snaps.filter((c) => {
    const d = c.data();
    return c.exists && d?.["status"] === "open" && (d?.["asaas"] as Record<string, unknown> | undefined)?.["groupId"] === groupId;
  });
}

async function readCharges(tx: Transaction, db: Firestore, group: Record<string, unknown>) {
  const ids = Array.isArray(group["chargeIds"]) ? (group["chargeIds"] as unknown[]).map(String) : [];
  return Promise.all(ids.map((id) => tx.get(db.collection(ARENA_CLASS_CHARGES).doc(id))));
}

/** Cria (uma vez) a cobrança Asaas do grupo e espelha o link nas mensalidades. */
export async function ensureClassAsaasPayment(
  db: Firestore,
  groupId: string,
  deps: ClassAsaasDeps = defaultClassAsaasDeps,
): Promise<{state: string}> {
  const groupRef = db.collection(ARENA_CLASS_ASAAS_PAYMENTS).doc(groupId);
  const claimed = await db.runTransaction(async (tx: Transaction) => {
    const snap = await tx.get(groupRef);
    const group = snap.data();
    if (!snap.exists || !group) return null;
    if (group["state"] !== "pending" && group["state"] !== "failed") return null;
    tx.set(groupRef, {
      state: "creating",
      attempt: Number(group["attempt"] ?? 0) + 1,
      claimedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    }, {merge: true});
    return group as Record<string, unknown>;
  });
  if (!claimed) return {state: String((await groupRef.get()).data()?.["state"] ?? "missing")};

  const owner = {
    arenaId: String(claimed["arenaId"] ?? ""),
    studentId: String(claimed["studentId"] ?? ""),
    athleteId: typeof claimed["athleteId"] === "string" ? claimed["athleteId"] : null,
    name: String(claimed["name"] ?? ""),
  };
  let customerId: string | null;
  let created: {paymentId: string; invoiceUrl: string; status: string};
  try {
    customerId = await deps.resolveCustomer(owner);
    if (!customerId) {
      await settle(db, groupId, "needs_cpf", {});
      return {state: "needs_cpf"};
    }
    created = await deps.createPayment({
      groupId,
      customerId,
      valueReais: Number(claimed["amountReais"] ?? 0),
      dueDate: String(claimed["dueDate"] ?? ""),
      description: String(claimed["description"] ?? "Mensalidade"),
    });
  } catch (e) {
    logger.error(`ensureClassAsaasPayment ${groupId}: falhou`, e);
    await groupRef.set({
      state: "failed", lastError: e instanceof Error ? e.message : String(e), updatedAt: FieldValue.serverTimestamp(),
    }, {merge: true});
    return {state: "failed"};
  }

  const state = await settle(db, groupId, "open", created);
  if (state === "void") {
    // Anularam o grupo enquanto a cobrança nascia: ela não pode ficar viva no Asaas.
    await deps.deletePayment(created.paymentId).catch((e) =>
      logger.warn(`ensureClassAsaasPayment ${groupId}: não apagou ${created.paymentId} criado após a anulação`, e));
  }
  if (state === "open" && owner.athleteId) {
    const amount = Number(claimed["amountReais"] ?? 0);
    try {
      await deps.notify({
        userId: owner.athleteId,
        title: "Mensalidade disponível",
        body: `${String(claimed["description"] ?? "Mensalidade")} · ${brl(amount)}. Toque para pagar com PIX ou cartão.`,
        type: CLASS_CHARGE_LINK_TYPE,
        data: {
          groupId, arenaId: owner.arenaId, invoiceUrl: created.invoiceUrl, webUrl: created.invoiceUrl, url: CLASS_CHARGE_APP_URL,
        },
      });
    } catch (e) {
      logger.warn(`ensureClassAsaasPayment ${groupId}: push falhou`, e);
    }
  }
  return {state};
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
  const groupRef = db.collection(ARENA_CLASS_ASAAS_PAYMENTS).doc(groupId);
  return db.runTransaction(async (tx: Transaction) => {
    const snap = await tx.get(groupRef);
    const group = (snap.data() ?? {}) as Record<string, unknown>;
    const charges = await readCharges(tx, db, group);
    const ids = {paymentId: created.paymentId ?? null, invoiceUrl: created.invoiceUrl ?? null};
    if (group["state"] !== "creating") {
      tx.set(groupRef, {...ids, updatedAt: FieldValue.serverTimestamp()}, {merge: true});
      return String(group["state"] ?? "");
    }
    tx.set(groupRef, {
      ...ids, state: next, asaasStatus: created.status ?? null, updatedAt: FieldValue.serverTimestamp(),
    }, {merge: true});
    for (const c of chargesOfGroup(charges, groupId)) {
      tx.set(c.ref, {asaas: chargeAsaasMirror(groupId, next, {invoiceUrl: ids.invoiceUrl, status: created.status ?? null})}, {merge: true});
    }
    return next;
  });
}

/** Apaga o pagamento do grupo no Asaas e reagrupa o que ainda estiver em aberto. */
export async function voidClassAsaasPayment(
  db: Firestore,
  groupId: string,
  deps: ClassAsaasDeps = defaultClassAsaasDeps,
): Promise<{state: string; regroupedAs: string | null}> {
  const groupRef = db.collection(ARENA_CLASS_ASAAS_PAYMENTS).doc(groupId);
  const before = (await groupRef.get()).data();
  if (!before || before["state"] !== "voiding") return {state: String(before?.["state"] ?? "missing"), regroupedAs: null};
  const paymentId = typeof before["paymentId"] === "string" ? before["paymentId"] : "";
  let voidError: string | null = null;
  if (paymentId) {
    try {
      await deps.deletePayment(paymentId);
    } catch (e) {
      // Já pago (ou o Asaas recusou): o webhook vê o grupo anulado e estorna.
      voidError = e instanceof Error ? e.message : String(e);
      logger.warn(`voidClassAsaasPayment ${groupId}: não apagou ${paymentId} no Asaas`, e);
    }
  }

  return db.runTransaction(async (tx: Transaction) => {
    const snap = await tx.get(groupRef);
    const group = (snap.data() ?? {}) as Record<string, unknown>;
    if (group["state"] !== "voiding") return {state: String(group["state"] ?? ""), regroupedAs: null};
    // Criação ainda em voo sem `paymentId`: espera o worker gravar o id (o gatilho roda de novo).
    if (!paymentId && group["paymentId"]) return {state: "voiding", regroupedAs: null};
    const charges = await readCharges(tx, db, group);
    const remaining = chargesOfGroup(charges, groupId);
    let regroupedAs: string | null = null;
    if (remaining.length > 0) {
      const attempt = Number(group["voidCount"] ?? 0) + 1;
      regroupedAs = `${groupId}_v${attempt}`;
      tx.set(db.collection(ARENA_CLASS_ASAAS_PAYMENTS).doc(regroupedAs), classAsaasGroupData({
        arenaId: String(group["arenaId"] ?? ""), enrollmentId: String(group["enrollmentId"] ?? ""),
        studentId: String(group["studentId"] ?? ""),
        athleteId: typeof group["athleteId"] === "string" ? group["athleteId"] : null, name: String(group["name"] ?? ""),
      }, remaining.map((c) => ({
        id: c.id,
        description: String(c.data()?.["description"] ?? "Mensalidade"),
        amountReais: Number(c.data()?.["amountReais"] ?? 0),
        dueDate: String(c.data()?.["dueDate"] ?? ""),
      }))));
      for (const c of remaining) tx.set(c.ref, {asaas: chargeAsaasMirror(regroupedAs, "pending")}, {merge: true});
    }
    tx.set(groupRef, {
      state: "void", voidedAt: FieldValue.serverTimestamp(), voidError, voidCount: Number(group["voidCount"] ?? 0) + 1,
      ...(regroupedAs ? {regroupedAs} : {}), updatedAt: FieldValue.serverTimestamp(),
    }, {merge: true});
    return {state: "void", regroupedAs};
  });
}

/** Gatilho: grupo novo/retentado → cria no Asaas; pedido de anulação → apaga. */
export const onArenaClassAsaasPaymentWritten = onDocumentWritten({
  document: `${ARENA_CLASS_ASAAS_PAYMENTS}/{groupId}`,
  secrets: [...asaasArenaSecrets, WEB_PUSH_PUBLIC_KEY, WEB_PUSH_PRIVATE_KEY, WEB_PUSH_SUBJECT],
}, async (event) => {
  const after = event.data?.after?.data();
  if (!after) return;
  const before = event.data?.before?.data();
  const groupId = event.params.groupId;
  const db = getFirestore();
  if (after["state"] === "pending" && before?.["state"] !== "pending") {
    await ensureClassAsaasPayment(db, groupId);
  } else if (after["state"] === "voiding" &&
    (before?.["state"] !== "voiding" || (!before?.["paymentId"] && after["paymentId"]))) {
    await voidClassAsaasPayment(db, groupId);
  }
});

const STUCK_CREATING_MS = 15 * 60_000;
const RETRY_AFTER_MS = 2 * 60_000;
/** Consulta ao Asaas de uma cobrança aberta: no máximo a cada 6h (vencida e nunca paga não vira martelo). */
const RECHECK_OPEN_MS = 6 * 60 * 60_000;
const PAID_STATUSES = new Set(["RECEIVED", "RECEIVED_IN_CASH", "CONFIRMED"]);

function millisOf(v: unknown): number {
  return v instanceof Timestamp ? v.toMillis() : 0;
}

/**
 * Varredura: retenta criação/anulação paradas, destrava `creating` velho (a chave de idempotência
 * devolve a mesma cobrança) e consulta o status das cobranças abertas perto do vencimento — é o
 * que cobre webhook perdido.
 */
export async function reconcileClassAsaasPayments(
  db: Firestore,
  now: Date,
  deps: ClassAsaasDeps = defaultClassAsaasDeps,
): Promise<{created: number; voided: number; reconciled: number}> {
  const col = db.collection(ARENA_CLASS_ASAAS_PAYMENTS);
  let created = 0;
  let voided = 0;
  let reconciled = 0;

  for (const state of ["pending", "failed", "creating"]) {
    const snap = await col.where("state", "==", state).limit(100).get();
    for (const doc of snap.docs) {
      const age = now.getTime() - millisOf(doc.data()["updatedAt"]);
      if (state === "creating") {
        if (age < STUCK_CREATING_MS) continue;
        await doc.ref.set({state: "failed", lastError: "stuck_creating", updatedAt: FieldValue.serverTimestamp()}, {merge: true});
      } else if (age < RETRY_AFTER_MS) {
        continue;
      }
      if ((await ensureClassAsaasPayment(db, doc.id, deps)).state === "open") created += 1;
    }
  }

  const voiding = await col.where("state", "==", "voiding").limit(100).get();
  for (const doc of voiding.docs) {
    if (now.getTime() - millisOf(doc.data()["updatedAt"]) < RETRY_AFTER_MS) continue;
    if ((await voidClassAsaasPayment(db, doc.id, deps)).state === "void") voided += 1;
  }

  // Abertas que já venceram ou vencem em até 3 dias: é aí que o pagamento acontece.
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
      await processArenaClassAsaasNotification(db, paymentId, payment, processedRef);
      if (PAID_STATUSES.has(status)) reconciled += 1;
    } catch (e) {
      logger.warn(`reconcileClassAsaasPayments: ${doc.id} falhou`, e);
    }
  }
  return {created, voided, reconciled};
}

export const reconcileArenaClassAsaasPayments = onSchedule({
  schedule: "every 30 minutes",
  timeZone: "America/Sao_Paulo",
  secrets: [...asaasArenaSecrets, WEB_PUSH_PUBLIC_KEY, WEB_PUSH_PRIVATE_KEY, WEB_PUSH_SUBJECT],
}, async () => {
  const result = await reconcileClassAsaasPayments(getFirestore(), new Date());
  if (result.created || result.voided || result.reconciled) logger.info("reconcileArenaClassAsaasPayments", result);
});
