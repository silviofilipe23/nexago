/**
 * Cobrança online do Centro de Treinamento — o que fala com o Asaas.
 *
 * - `issueTrainingCenterInvoicePayment` (callable): gera a fatura Asaas (Pix ou cartão) de uma
 *   cobrança pendente, com split para a carteira do centro; grava `providerRef` + evento `provider`.
 * - `queryTrainingCenterInvoiceProvider` / `resendTrainingCenterInvoicePix` (callables): "Consultar
 *   provedor agora" e "Reenviar Pix" do drawer do financeiro.
 * - `applyCenterInvoicePayment`: o que o webhook (`asaas-webhook.ts`), a consulta e a varredura
 *   chamam — aprova a cobrança e ativa a matrícula pendente ligada NA MESMA transação. Idempotente:
 *   a transação relê a cobrança; notificação repetida vira no máximo um evento "sem efeito".
 * - Gatilho: cobrança que saiu de `pending` sem ser pelo provedor (baixa manual, cancelamento, vaga
 *   vencida) → apaga a fatura no Asaas, para o aluno não pagar duas vezes.
 * - Varredura (15 min): reserva vencida libera a vaga (cancela matrícula, devolve `seatsTaken`,
 *   cancela a cobrança) — antes, pergunta ao Asaas se já foi paga; e consulta as pendentes há >2h
 *   (webhook perdido: o `asaasWebhook` sempre responde 200, o Asaas não reenvia).
 *
 * Pago com a cobrança já fora de `pending` (cancelada, aprovada à mão) vira estorno: cobrar duas
 * vezes é pior que devolver.
 */
import * as logger from "firebase-functions/logger";
import {HttpsError, onCall, type CallableRequest} from "firebase-functions/v2/https";
import {onDocumentWritten} from "firebase-functions/v2/firestore";
import {onSchedule} from "firebase-functions/v2/scheduler";
import {Timestamp, getFirestore, type DocumentReference, type Firestore, type Transaction} from "firebase-admin/firestore";
import {AsaasApiError, asaasArenaSecrets, fetchAsaas, getAsaasEnvTag} from "./asaas-client";
import {
  deleteAsaasPaymentOrThrow,
  fetchAsaasPixQrCode,
  getAsaasPayment,
  refundAsaasPayment,
  type AsaasPaymentDetails,
} from "./asaas-booking-payment";
import {getOrCreateAsaasCustomer, isValidCpfCnpj, normalizeCpfCnpj, resolveAthleteCpfCnpj} from "./asaas-customer";
import {dayKeyFromEventDate} from "./event-timezone";
import {getFirebaseProjectId} from "./firebase-paths";
import {CLIENT_FACING_REGIONS} from "./function-regions";
import {deliverNotificationToUser, WEB_PUSH_PRIVATE_KEY, WEB_PUSH_PUBLIC_KEY, WEB_PUSH_SUBJECT} from "./notification-delivery";
import {
  CENTER_CHARGE_FEE_PERCENT,
  SYSTEM_ACTOR,
  TRAINING_CENTERS,
  TRAINING_CENTER_PAYERS,
  TRAINING_CENTER_RECEIVING,
  brlFromCents,
  canManageCenterBilling,
  centerEvent,
  centerInvoiceRef,
  centerSplitPercent,
  holdExpired,
  methodFromBillingType,
  methodLabel,
  nextProviderCheck,
  parseCenterInvoiceRef,
  providerDueDate,
  providerOutcome,
  reaisFromCents,
  withEvent,
  PROVIDER_FIRST_CHECK_MS,
} from "./training-center-billing-model";

export const CENTER_INVOICE_LINK_TYPE = "training_center_invoice_link";

type Data = Record<string, unknown>;

export interface CenterBillingDeps {
  now: () => Date;
  env: () => string;
  /** Cliente Asaas do pagador; null = sem CPF (o portal pede). */
  resolveCustomer: (input: {
    centerId: string; payerKey: string; uid: string | null; name: string; email: string; cpfCnpj: string | null;
  }) => Promise<string | null>;
  createPayment: (input: {
    externalReference: string; idempotencyKey: string; customerId: string; valueReais: number; dueDate: string;
    description: string; walletId: string; splitPercent: number;
  }) => Promise<{paymentId: string; invoiceUrl: string; status: string}>;
  /** Apaga a fatura; lança se não der (já paga, por exemplo). 404 conta como apagada. */
  deletePayment: (paymentId: string) => Promise<void>;
  getPayment: (paymentId: string) => Promise<AsaasPaymentDetails>;
  pixPayload: (paymentId: string) => Promise<string>;
  refund: (paymentId: string) => Promise<void>;
  notify: (input: {userId: string; title: string; body: string; type: string; data: Record<string, string>}) => Promise<void>;
}

/** No emulador, só sandbox: o projeto DEV aponta para o Asaas de produção. */
function assertAsaasAllowed(): void {
  if (process.env.FUNCTIONS_EMULATOR === "true" && getAsaasEnvTag() !== "sandbox") {
    throw new Error("ASAAS_BLOCKED_IN_EMULATOR");
  }
}

async function resolveCenterCustomer(input: {
  centerId: string; payerKey: string; uid: string | null; name: string; email: string; cpfCnpj: string | null;
}): Promise<string | null> {
  assertAsaasAllowed();
  const db = getFirestore();
  const payerRef = db.collection(TRAINING_CENTER_PAYERS).doc(`${input.centerId}_${input.payerKey}`);
  const payer = (await payerRef.get()).data();
  const cpf = normalizeCpfCnpj(input.cpfCnpj ?? (payer?.["cpfCnpj"] as string | undefined));
  const env = getAsaasEnvTag();
  if (isValidCpfCnpj(cpf)) {
    const cached = typeof payer?.["asaasCustomerId"] === "string" ? payer["asaasCustomerId"] : "";
    if (cached && payer?.["asaasEnv"] === env && payer?.["cpfCnpj"] === cpf) return cached;
    const created = await fetchAsaas<{id?: string}>("/v3/customers", {
      method: "POST",
      body: {
        name: input.name || "Aluno",
        cpfCnpj: cpf,
        ...(input.email ? {email: input.email} : {}),
        externalReference: `centerPayer:${input.centerId}:${input.payerKey}`,
        notificationDisabled: true,
      },
      idempotencyKey: `asaas-center-customer-${env}-${input.centerId}-${input.payerKey}-${cpf}`,
    });
    const id = created.id?.trim() ?? "";
    if (!id) throw new Error("ASAAS_CUSTOMER_CREATE_FAILED");
    await payerRef.set({cpfCnpj: cpf, asaasCustomerId: id, asaasEnv: env, updatedAt: Timestamp.now()}, {merge: true});
    return id;
  }
  if (!input.uid) return null;
  let athleteCpf: string;
  try {
    athleteCpf = await resolveAthleteCpfCnpj(input.uid);
  } catch {
    return null;
  }
  return getOrCreateAsaasCustomer(input.uid, input.email, undefined, athleteCpf);
}

export const defaultCenterBillingDeps: CenterBillingDeps = {
  now: () => new Date(),
  env: () => getAsaasEnvTag(),
  resolveCustomer: resolveCenterCustomer,
  createPayment: async (input) => {
    assertAsaasAllowed();
    const payment = await fetchAsaas<{id?: string; invoiceUrl?: string; status?: string}>("/v3/payments", {
      method: "POST",
      body: {
        customer: input.customerId,
        // Fatura hospedada: o aluno escolhe Pix ou cartão.
        billingType: "UNDEFINED",
        value: input.valueReais,
        dueDate: input.dueDate,
        description: input.description.slice(0, 500),
        externalReference: input.externalReference,
        split: [{walletId: input.walletId, percentualValue: input.splitPercent}],
      },
      idempotencyKey: input.idempotencyKey,
    });
    const paymentId = payment.id?.trim() ?? "";
    const invoiceUrl = payment.invoiceUrl?.trim() ?? "";
    if (!paymentId || !invoiceUrl) throw new Error("ASAAS_PAYMENT_MISSING_ID");
    return {paymentId, invoiceUrl, status: payment.status ?? "PENDING"};
  },
  deletePayment: async (paymentId) => {
    assertAsaasAllowed();
    await deleteAsaasPaymentOrThrow(paymentId);
  },
  getPayment: (paymentId) => getAsaasPayment(paymentId),
  pixPayload: async (paymentId) => (await fetchAsaasPixQrCode(paymentId)).qrCode,
  refund: async (paymentId) => {
    assertAsaasAllowed();
    await refundAsaasPayment(paymentId);
  },
  notify: async (input) => {
    await deliverNotificationToUser({...input, requireInteraction: false});
  },
};

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function millisOf(v: unknown): number | null {
  if (v instanceof Timestamp) return v.toMillis();
  if (v instanceof Date) return v.getTime();
  return null;
}

const centerRef = (db: Firestore, centerId: string) => db.collection(TRAINING_CENTERS).doc(centerId);
const invoiceRef = (db: Firestore, centerId: string, invoiceId: string) =>
  centerRef(db, centerId).collection("invoices").doc(invoiceId);

function auditData(at: Timestamp, actor: {uid: string; name: string}, action: string, entityId: string, detail: string, reason = ""): Data {
  return {at, actorUid: actor.uid, actorName: actor.name, action, entity: "invoice", entityId, detail, reason};
}

const SYSTEM = {uid: "system", name: SYSTEM_ACTOR};

function processedRefFor(db: Firestore, paymentId: string): DocumentReference {
  return db.doc(`artifacts/${getFirebaseProjectId()}/public/data/asaas_processed_payments/${paymentId}`);
}

// ---------------------------------------------------------------------------
// Callables: quem pode
// ---------------------------------------------------------------------------

interface CenterCallInput {
  centerId: string;
  invoiceId: string;
}

function parseCallInput(raw: unknown): CenterCallInput & {cpfCnpj: string | null} {
  const d = (raw && typeof raw === "object" ? raw : {}) as Data;
  const centerId = str(d["centerId"]);
  const invoiceId = str(d["invoiceId"]);
  if (!centerId || !invoiceId || centerId.includes("/") || invoiceId.includes("/")) {
    throw new HttpsError("invalid-argument", "Cobrança inválida.");
  }
  const rawCpf = str(d["cpfCnpj"]);
  const cpfCnpj = rawCpf ? normalizeCpfCnpj(rawCpf) : null;
  if (cpfCnpj !== null && !isValidCpfCnpj(cpfCnpj)) {
    throw new HttpsError("invalid-argument", "CPF/CNPJ inválido.");
  }
  return {centerId, invoiceId, cpfCnpj};
}

/** Owner/admin ativo no centro; devolve o nome para eventos e auditoria. */
async function requireManager(db: Firestore, uid: string | undefined, centerId: string): Promise<{uid: string; name: string}> {
  if (!uid) throw new HttpsError("unauthenticated", "Entre de novo.");
  const member = (await centerRef(db, centerId).collection("centerMembers").doc(uid).get()).data();
  if (!canManageCenterBilling(member)) {
    throw new HttpsError("permission-denied", "Só owner ou admin do centro mexe na cobrança online.");
  }
  return {uid, name: str(member?.["displayName"]) || "Gestor"};
}

function asaasFailure(e: unknown, fallback: string): HttpsError {
  if (e instanceof HttpsError) return e;
  if (e instanceof AsaasApiError) return new HttpsError("failed-precondition", e.message || fallback);
  logger.error(fallback, e);
  return new HttpsError("internal", fallback);
}

// ---------------------------------------------------------------------------
// Gerar a fatura
// ---------------------------------------------------------------------------

export interface IssueResult {
  invoiceUrl: string;
  providerRef: string;
  /** true = já existia (clique duplo, outra aba): nada foi criado agora. */
  existing: boolean;
}

export async function issueCenterInvoicePaymentCore(
  db: Firestore,
  uid: string | undefined,
  raw: unknown,
  deps: CenterBillingDeps = defaultCenterBillingDeps,
): Promise<IssueResult> {
  const {centerId, invoiceId, cpfCnpj} = parseCallInput(raw);
  const actor = await requireManager(db, uid, centerId);
  const center = (await centerRef(db, centerId).get()).data();
  if (!center) throw new HttpsError("not-found", "Centro não encontrado.");
  if (center["status"] !== "active") {
    throw new HttpsError("failed-precondition", "A cobrança online libera depois que o centro for ativado.");
  }
  const receiving = (await db.collection(TRAINING_CENTER_RECEIVING).doc(centerId).get()).data();
  const walletId = str(receiving?.["walletId"]);
  if (center["receivingConnected"] !== true || !walletId) {
    throw new HttpsError("failed-precondition", "A conta de recebimento do centro ainda não foi conectada pelo time NexaGO.");
  }
  if (receiving?.["asaasEnv"] && receiving["asaasEnv"] !== deps.env()) {
    throw new HttpsError("failed-precondition", "A conta de recebimento do centro é de outro ambiente do provedor.");
  }

  const ref = invoiceRef(db, centerId, invoiceId);
  const inv = (await ref.get()).data();
  if (!inv) throw new HttpsError("not-found", "Cobrança não encontrada.");
  if (inv["status"] !== "pending") throw new HttpsError("failed-precondition", "Esta cobrança não está mais pendente.");
  if (str(inv["providerRef"])) {
    return {invoiceUrl: str(inv["providerUrl"]), providerRef: str(inv["providerRef"]), existing: true};
  }
  const amountCents = Math.round(Number(inv["amountCents"] ?? 0));
  if (amountCents < 500) {
    throw new HttpsError("failed-precondition", "O provedor só cobra online a partir de R$ 5,00.");
  }

  const studentId = str(inv["studentId"]);
  const student = studentId ? (await centerRef(db, centerId).collection("students").doc(studentId).get()).data() : undefined;
  const studentUid = str(student?.["uid"]) || null;
  const now = deps.now();
  const attempt = Number(inv["providerAttempt"] ?? 0);

  let created: {paymentId: string; invoiceUrl: string; status: string};
  try {
    const customerId = await deps.resolveCustomer({
      centerId,
      payerKey: studentId || `invoice_${invoiceId}`,
      uid: studentUid,
      name: str(inv["payerName"]) || str(student?.["name"]),
      email: str(student?.["email"]),
      cpfCnpj,
    });
    if (!customerId) {
      throw new HttpsError("failed-precondition", "Informe o CPF do pagador para gerar a cobrança online.", {reason: "needs_cpf"});
    }
    const feePercent = Number(receiving?.["feePercent"] ?? CENTER_CHARGE_FEE_PERCENT);
    created = await deps.createPayment({
      externalReference: centerInvoiceRef(centerId, invoiceId),
      // Mesma cobrança + mesma tentativa = mesma fatura: clique duplo não cobra duas vezes.
      idempotencyKey: `center-inv-${deps.env()}-${centerId}-${invoiceId}-${attempt}`,
      customerId,
      valueReais: reaisFromCents(amountCents),
      dueDate: providerDueDate(str(inv["dueDate"]), dayKeyFromEventDate(now)),
      description: `${str(inv["reference"]) || "Mensalidade"} · ${str(center["name"]) || "Centro de Treinamento"}`,
      walletId,
      splitPercent: centerSplitPercent(feePercent),
    });
  } catch (e) {
    throw asaasFailure(e, "Não foi possível gerar a cobrança online. Tente de novo.");
  }

  const at = Timestamp.fromDate(now);
  const outcome = await db.runTransaction(async (tx: Transaction) => {
    const snap = await tx.get(ref);
    const cur = snap.data();
    if (!cur || cur["status"] !== "pending") return "gone" as const;
    const curRef = str(cur["providerRef"]);
    if (curRef) return curRef === created.paymentId ? ("same" as const) : ("other" as const);
    tx.update(ref, {
      providerRef: created.paymentId,
      providerUrl: created.invoiceUrl,
      providerStatus: created.status,
      providerIssuedAt: at,
      providerCheckAt: Timestamp.fromMillis(now.getTime() + PROVIDER_FIRST_CHECK_MS),
      events: withEvent(cur["events"], centerEvent(at, "provider", "Cobrança gerada no provedor",
        `Pix ou cartão · Asaas ${created.paymentId}`, actor.name)),
    });
    tx.set(centerRef(db, centerId).collection("auditLogs").doc(), auditData(at, actor, "invoice.provider_issued", invoiceId,
      `${str(cur["payerName"])} · ${brlFromCents(amountCents)} · cobrança online gerada (${created.paymentId})`));
    return "issued" as const;
  });

  if (outcome === "gone" || outcome === "other") {
    // Saiu de pendente (ou outra aba gerou outra) enquanto a fatura nascia: ela não pode ficar viva.
    await deps.deletePayment(created.paymentId).catch((e) =>
      logger.warn(`issueCenterInvoicePayment ${centerId}/${invoiceId}: não apagou ${created.paymentId}`, e));
    throw new HttpsError("failed-precondition", "A cobrança mudou enquanto a fatura era gerada. Confira e tente de novo.");
  }
  if (outcome === "issued" && studentUid) {
    await pushInvoiceLink(deps, studentUid, centerId, invoiceId, str(center["name"]), amountCents, created.invoiceUrl, str(inv["reference"]));
  }
  return {invoiceUrl: created.invoiceUrl, providerRef: created.paymentId, existing: outcome === "same"};
}

async function pushInvoiceLink(
  deps: CenterBillingDeps, userId: string, centerId: string, invoiceId: string, centerName: string,
  amountCents: number, invoiceUrl: string, reference: string,
): Promise<boolean> {
  try {
    await deps.notify({
      userId,
      title: `Cobrança de ${centerName || "seu centro de treinamento"}`,
      body: `${reference || "Mensalidade"} · ${brlFromCents(amountCents)}. Toque para pagar com Pix ou cartão.`,
      type: CENTER_INVOICE_LINK_TYPE,
      data: {centerId, invoiceId, invoiceUrl, webUrl: invoiceUrl},
    });
    return true;
  } catch (e) {
    logger.warn(`centerInvoice ${centerId}/${invoiceId}: push falhou`, e);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Reenviar Pix
// ---------------------------------------------------------------------------

export interface ResendResult {
  invoiceUrl: string;
  pixPayload: string;
  pushed: boolean;
}

export async function resendCenterInvoicePixCore(
  db: Firestore,
  uid: string | undefined,
  raw: unknown,
  deps: CenterBillingDeps = defaultCenterBillingDeps,
): Promise<ResendResult> {
  const {centerId, invoiceId} = parseCallInput(raw);
  const actor = await requireManager(db, uid, centerId);
  const ref = invoiceRef(db, centerId, invoiceId);
  const inv = (await ref.get()).data();
  if (!inv) throw new HttpsError("not-found", "Cobrança não encontrada.");
  const paymentId = str(inv["providerRef"]);
  if (inv["status"] !== "pending" || !paymentId) {
    throw new HttpsError("failed-precondition", "Só dá para reenviar o Pix de cobrança pendente gerada no provedor.");
  }
  let pixPayload = "";
  try {
    pixPayload = await deps.pixPayload(paymentId);
  } catch (e) {
    // Sem copia-e-cola (fatura só cartão, Pix fora do ar): o link da fatura ainda serve.
    logger.warn(`resendCenterInvoicePix ${centerId}/${invoiceId}: sem Pix copia-e-cola`, e);
  }
  const studentId = str(inv["studentId"]);
  const student = studentId ? (await centerRef(db, centerId).collection("students").doc(studentId).get()).data() : undefined;
  const studentUid = str(student?.["uid"]);
  const center = (await centerRef(db, centerId).get()).data() ?? {};
  const invoiceUrl = str(inv["providerUrl"]);
  const pushed = studentUid ?
    await pushInvoiceLink(deps, studentUid, centerId, invoiceId, str(center["name"]), Number(inv["amountCents"] ?? 0), invoiceUrl, str(inv["reference"])) :
    false;

  const at = Timestamp.fromDate(deps.now());
  await db.runTransaction(async (tx: Transaction) => {
    const cur = (await tx.get(ref)).data();
    if (!cur) return;
    tx.update(ref, {
      events: withEvent(cur["events"], centerEvent(at, "provider", "Pix reenviado",
        pushed ? "Link enviado ao app do aluno · copia-e-cola gerado" : "Copia-e-cola gerado para enviar ao aluno", actor.name)),
    });
  });
  return {invoiceUrl, pixPayload, pushed};
}

// ---------------------------------------------------------------------------
// Aplicar o status do provedor (webhook, consulta, varredura)
// ---------------------------------------------------------------------------

export type ApplySource = "webhook" | "query" | "sweep";

export interface ApplyResult {
  outcome: "approved" | "duplicate" | "refund_stale" | "refunded" | "disputed" | "cleared" | "status" | "ignored" | "orphan";
  invoiceStatus: string | null;
}

const SOURCE_EVENT = {webhook: "webhook", query: "query", sweep: "query"} as const;
const SOURCE_TITLE = {
  webhook: "Pagamento confirmado pelo provedor",
  query: "Pagamento confirmado na consulta ao provedor",
  sweep: "Pagamento confirmado na consulta automática",
} as const;

/**
 * Leva o status do pagamento Asaas para a cobrança do centro. Age pelo status do GET fresco (o
 * roteador sempre relê), então a ordem dos eventos não importa.
 */
export async function applyCenterInvoicePayment(
  db: Firestore,
  paymentId: string,
  payment: AsaasPaymentDetails,
  processedRef: DocumentReference,
  source: ApplySource,
  deps: CenterBillingDeps = defaultCenterBillingDeps,
): Promise<ApplyResult> {
  const parsed = parseCenterInvoiceRef(str(payment.externalReference));
  if (!parsed) return {outcome: "ignored", invoiceStatus: null};
  const {centerId, invoiceId} = parsed;
  const status = str(payment.status).toUpperCase();
  const outcome = providerOutcome(status, payment.deleted === true);
  const method = methodFromBillingType(payment.billingType);
  const ref = invoiceRef(db, centerId, invoiceId);
  const now = deps.now();
  const at = Timestamp.fromDate(now);
  const base = {kind: "trainingCenterInvoice", centerId, invoiceId, paymentStatus: status};

  const result = await db.runTransaction(async (tx: Transaction): Promise<ApplyResult & {refund?: boolean}> => {
    const snap = await tx.get(ref);
    const processed = (await tx.get(processedRef)).data() ?? {};
    const inv = snap.data();
    if (!inv) {
      if (outcome === "paid") {
        tx.set(processedRef, {...base, outcome: "orphan", refundRequired: true, processedAt: at}, {merge: true});
      }
      return {outcome: "orphan", invoiceStatus: null};
    }
    const invStatus = str(inv["status"]);
    const isOurs = str(inv["providerRef"]) === paymentId;
    const approvedByProvider = inv["providerApprovedAt"] != null && isOurs;
    const seen = (processed["seen"] ?? {}) as Data;
    const firstTime = seen[status] !== true;
    const markSeen = () => tx.set(processedRef, {...base, seen: {[status]: true}, processedAt: at}, {merge: true});

    if (outcome === "paid") {
      if (invStatus === "pending" && isOurs) {
        const enrollmentId = str(inv["enrollmentId"]);
        const enrRef = enrollmentId ? centerRef(db, centerId).collection("enrollments").doc(enrollmentId) : null;
        const enr = enrRef ? (await tx.get(enrRef)).data() : undefined;
        tx.update(ref, {
          status: "approved",
          method,
          approvedAt: at,
          providerApprovedAt: at,
          providerStatus: status,
          providerCheckAt: null,
          events: withEvent(inv["events"], centerEvent(at, SOURCE_EVENT[source], SOURCE_TITLE[source],
            `${methodLabel(method)} · ${status} · Asaas ${paymentId}`)),
        });
        if (enrRef && enr?.["status"] === "pending") {
          tx.update(enrRef, {status: "active", holdUntil: null});
        }
        tx.set(centerRef(db, centerId).collection("auditLogs").doc(), auditData(at, SYSTEM, "invoice.provider_approved", invoiceId,
          `${str(inv["payerName"])} · ${brlFromCents(Number(inv["amountCents"] ?? 0))} aprovado pelo provedor (${methodLabel(method)})` +
          (enr?.["status"] === "pending" ? " · matrícula ativada" : "")));
        tx.set(processedRef, {...base, outcome: "approved", seen: {[status]: true}, confirmedAt: at, processedAt: at}, {merge: true});
        return {outcome: "approved", invoiceStatus: "approved"};
      }
      if (approvedByProvider) {
        // Cartão: CONFIRMED e depois RECEIVED; ou o mesmo webhook reenviado. Fica registrado uma vez.
        if (firstTime) {
          tx.update(ref, {
            providerStatus: status,
            events: withEvent(inv["events"], centerEvent(at, "duplicate", "Confirmação repetida do provedor",
              `${status} · Asaas ${paymentId} · sem efeito`)),
          });
          markSeen();
        }
        return {outcome: "duplicate", invoiceStatus: invStatus};
      }
      // Pago com a cobrança cancelada, aprovada à mão ou trocada de fatura: devolve.
      const alreadyRefunded = processed["refundedAt"] != null || processed["outcome"] === "refund_stale";
      if (!alreadyRefunded) {
        tx.set(processedRef, {...base, outcome: "refund_stale", seen: {[status]: true}, processedAt: at}, {merge: true});
        tx.update(ref, {
          events: withEvent(inv["events"], centerEvent(at, "refund", "Pagamento online será estornado",
            `Asaas ${paymentId} pago com a cobrança ${invStatus === "approved" ? "já aprovada" : invStatus === "cancelled" ? "cancelada" : invStatus} · estorno automático`)),
        });
      }
      return {outcome: "refund_stale", invoiceStatus: invStatus, refund: !alreadyRefunded};
    }

    if (outcome === "refunded" || outcome === "disputed") {
      if (!approvedByProvider || !firstTime) {
        markSeen();
        return {outcome: "status", invoiceStatus: invStatus};
      }
      const next = outcome === "refunded" ? "refunded" : "disputed";
      if (invStatus === "approved" || (invStatus === "disputed" && next === "refunded")) {
        const amount = Number(inv["amountCents"] ?? 0);
        tx.update(ref, {
          status: next,
          providerStatus: status,
          ...(next === "refunded" ? {refundedCents: amount} : {}),
          events: withEvent(inv["events"], centerEvent(at, "webhook",
            next === "refunded" ? "Estornado no provedor" : "Contestação no provedor", `${status} · Asaas ${paymentId}`)),
        });
        tx.set(centerRef(db, centerId).collection("auditLogs").doc(), auditData(at, SYSTEM, `invoice.provider_${next}`, invoiceId,
          `${str(inv["payerName"])} · ${brlFromCents(amount)} ${next === "refunded" ? "estornado" : "contestado"} no provedor`));
      }
      markSeen();
      return {outcome: next, invoiceStatus: next};
    }

    if (outcome === "deleted") {
      if (invStatus === "pending" && isOurs) {
        // Removida no painel do Asaas: a cobrança volta a poder gerar outra fatura (tentativa nova).
        tx.update(ref, {
          providerRef: "",
          providerUrl: "",
          providerStatus: "DELETED",
          providerCheckAt: null,
          providerAttempt: Number(inv["providerAttempt"] ?? 0) + 1,
          events: withEvent(inv["events"], centerEvent(at, SOURCE_EVENT[source], "Fatura removida no provedor",
            `Asaas ${paymentId} · gere de novo para cobrar online`)),
        });
        markSeen();
        return {outcome: "cleared", invoiceStatus: invStatus};
      }
      return {outcome: "status", invoiceStatus: invStatus};
    }

    if (isOurs && invStatus === "pending" && str(inv["providerStatus"]) !== status) {
      tx.update(ref, {providerStatus: status});
    }
    return {outcome: "status", invoiceStatus: invStatus};
  });

  if (result.outcome === "orphan" && outcome === "paid") {
    logger.error(`Asaas centro: cobrança ${centerId}/${invoiceId} não existe para o pagamento ${paymentId} — estornar à mão`);
  }
  if (result.refund) {
    logger.warn(`Asaas centro ${centerId}/${invoiceId}: pago fora de pendente — estornando ${paymentId}`);
    try {
      await deps.refund(paymentId);
      await processedRef.set({refundedAt: Timestamp.fromDate(deps.now())}, {merge: true});
    } catch (e) {
      logger.error(`Asaas centro ${centerId}/${invoiceId}: estorno de ${paymentId} falhou — fazer à mão`, e);
      await processedRef.set({refundRequired: true}, {merge: true});
    }
  }
  return {outcome: result.outcome, invoiceStatus: result.invoiceStatus};
}

/** Entrada do roteador `asaasWebhook`. */
export async function processTrainingCenterInvoiceAsaasNotification(
  db: Firestore,
  paymentId: string,
  payment: AsaasPaymentDetails,
  processedRef: DocumentReference,
): Promise<void> {
  await applyCenterInvoicePayment(db, paymentId, payment, processedRef, "webhook");
}

// ---------------------------------------------------------------------------
// Consultar provedor agora
// ---------------------------------------------------------------------------

export interface QueryResult {
  providerStatus: string;
  invoiceStatus: string | null;
  outcome: ApplyResult["outcome"];
}

export async function queryCenterInvoiceProviderCore(
  db: Firestore,
  uid: string | undefined,
  raw: unknown,
  deps: CenterBillingDeps = defaultCenterBillingDeps,
): Promise<QueryResult> {
  const {centerId, invoiceId} = parseCallInput(raw);
  const actor = await requireManager(db, uid, centerId);
  const ref = invoiceRef(db, centerId, invoiceId);
  const inv = (await ref.get()).data();
  if (!inv) throw new HttpsError("not-found", "Cobrança não encontrada.");
  const paymentId = str(inv["providerRef"]);
  if (!paymentId) throw new HttpsError("failed-precondition", "Esta cobrança não foi gerada no provedor.");
  let payment: AsaasPaymentDetails;
  try {
    payment = await deps.getPayment(paymentId);
  } catch (e) {
    throw asaasFailure(e, "Não foi possível consultar o provedor agora. Tente de novo.");
  }
  // O GET devolve a referência da cobrança; se faltar, é a nossa (veio do `providerRef`).
  const withRef = {...payment, externalReference: str(payment.externalReference) || centerInvoiceRef(centerId, invoiceId)};
  const result = await applyCenterInvoicePayment(db, paymentId, withRef, processedRefFor(db, paymentId), "query", deps);
  const providerStatus = payment.deleted ? "DELETED" : str(payment.status).toUpperCase();
  if (result.outcome !== "approved") {
    // Aprovação já registra o evento; o resto ganha um "consultado" para o histórico.
    const at = Timestamp.fromDate(deps.now());
    await db.runTransaction(async (tx: Transaction) => {
      const cur = (await tx.get(ref)).data();
      if (!cur) return;
      tx.update(ref, {
        events: withEvent(cur["events"], centerEvent(at, "query", "Provedor consultado",
          `${providerStatus || "sem status"} · Asaas ${paymentId}`, actor.name)),
      });
    });
  }
  return {providerStatus, invoiceStatus: result.invoiceStatus, outcome: result.outcome};
}

// ---------------------------------------------------------------------------
// Gatilho: cobrança saiu de pendente sem o provedor → apaga a fatura
// ---------------------------------------------------------------------------

/** Precisa apagar a fatura no Asaas? (baixa manual, cancelamento, reserva vencida) */
export function invoiceNeedsProviderVoid(before: Data | undefined, after: Data | undefined): string | null {
  if (!before || !after) return null;
  const paymentId = str(before["providerRef"]);
  if (!paymentId || before["status"] !== "pending" || after["status"] === "pending") return null;
  if (after["providerApprovedAt"] != null) return null;
  return paymentId;
}

export async function voidCenterInvoicePayment(
  db: Firestore,
  centerId: string,
  invoiceId: string,
  paymentId: string,
  deps: CenterBillingDeps = defaultCenterBillingDeps,
): Promise<boolean> {
  const ref = invoiceRef(db, centerId, invoiceId);
  let detail: string;
  let ok = true;
  try {
    await deps.deletePayment(paymentId);
    detail = `Asaas ${paymentId} · o aluno não consegue mais pagar por ela`;
  } catch (e) {
    // Já paga (ou o Asaas recusou): o webhook vê a cobrança fora de pendente e estorna.
    ok = false;
    detail = `Asaas ${paymentId} · não foi possível remover (${e instanceof Error ? e.message : String(e)})`.slice(0, 300);
    logger.warn(`voidCenterInvoicePayment ${centerId}/${invoiceId}: não apagou ${paymentId}`, e);
  }
  const at = Timestamp.fromDate(deps.now());
  await db.runTransaction(async (tx: Transaction) => {
    const cur = (await tx.get(ref)).data();
    if (!cur) return;
    tx.update(ref, {
      providerCheckAt: null,
      ...(ok ? {providerStatus: "DELETED"} : {}),
      events: withEvent(cur["events"], centerEvent(at, "provider", ok ? "Fatura removida do provedor" : "Fatura não removida do provedor", detail)),
    });
  });
  return ok;
}

export const onTrainingCenterInvoiceWritten = onDocumentWritten({
  document: `${TRAINING_CENTERS}/{centerId}/invoices/{invoiceId}`,
  secrets: [...asaasArenaSecrets],
}, async (event) => {
  const paymentId = invoiceNeedsProviderVoid(event.data?.before?.data(), event.data?.after?.data());
  if (!paymentId) return;
  await voidCenterInvoicePayment(getFirestore(), event.params.centerId, event.params.invoiceId, paymentId);
});

// ---------------------------------------------------------------------------
// Varredura
// ---------------------------------------------------------------------------

/**
 * Reserva vencida: cancela a matrícula, devolve a vaga e cancela as cobranças pendentes dela —
 * tudo numa transação, que relê a matrícula (pode ter sido paga/ativada no meio).
 */
export async function releaseExpiredHold(
  db: Firestore,
  enrollmentRef: DocumentReference,
  now: Date,
): Promise<boolean> {
  const center = enrollmentRef.parent.parent;
  if (!center) return false;
  const at = Timestamp.fromDate(now);
  return db.runTransaction(async (tx: Transaction) => {
    const enr = (await tx.get(enrollmentRef)).data();
    if (!holdExpired(enr, now.getTime(), millisOf(enr?.["holdUntil"]))) return false;
    const classId = str(enr?.["classId"]);
    const classRef = classId ? center.collection("classes").doc(classId) : null;
    const cls = classRef ? await tx.get(classRef) : null;
    const invoices = await tx.get(
      center.collection("invoices").where("enrollmentId", "==", enrollmentRef.id).where("status", "==", "pending"),
    ) as unknown as {docs: FirebaseFirestore.QueryDocumentSnapshot[]};
    if (classRef && cls?.exists) {
      tx.update(classRef, {seatsTaken: Math.max(0, Number(cls.data()?.["seatsTaken"] ?? 0) - 1)});
    }
    tx.update(enrollmentRef, {status: "cancelled", holdUntil: null, endedAt: at, cancelReason: "hold_expired"});
    for (const doc of invoices.docs) {
      tx.update(doc.ref, {
        status: "cancelled",
        providerCheckAt: null,
        events: withEvent(doc.data()["events"], centerEvent(at, "cancel", "Cobrança cancelada",
          "Reserva da vaga venceu sem pagamento · vaga liberada")),
      });
    }
    tx.set(center.collection("auditLogs").doc(), {
      ...auditData(at, SYSTEM, "enrollment.hold_expired", enrollmentRef.id,
        `${str(enr?.["studentName"])} → ${str(enr?.["className"])} · reserva vencida, vaga liberada` +
        (invoices.docs.length ? ` · ${invoices.docs.length} cobrança(s) cancelada(s)` : "")),
      entity: "enrollment",
    });
    return true;
  });
}

/** Collection group pega `enrollments`/`invoices` de qualquer lugar: só os do centro interessam. */
function isCenterDoc(ref: DocumentReference | null): ref is DocumentReference {
  const parts = ref?.path.split("/") ?? [];
  return parts.length === 2 && parts[0] === TRAINING_CENTERS;
}

async function checkProvider(db: Firestore, centerId: string, invoiceId: string, paymentId: string, deps: CenterBillingDeps) {
  const payment = await deps.getPayment(paymentId);
  const withRef = {...payment, externalReference: str(payment.externalReference) || centerInvoiceRef(centerId, invoiceId)};
  return applyCenterInvoicePayment(db, paymentId, withRef, processedRefFor(db, paymentId), "sweep", deps);
}

export async function sweepTrainingCenterBillingCore(
  db: Firestore,
  deps: CenterBillingDeps = defaultCenterBillingDeps,
): Promise<{released: number; approved: number; checked: number}> {
  const now = deps.now();
  const nowTs = Timestamp.fromDate(now);
  let released = 0;
  let approved = 0;
  let checked = 0;

  // 1) Reservas vencidas. `holdUntil` só existe (não-nulo) em matrícula pendente.
  const holds = await db.collectionGroup("enrollments").where("holdUntil", "<=", nowTs).limit(200).get();
  for (const doc of holds.docs) {
    const center = doc.ref.parent.parent;
    if (!isCenterDoc(center)) continue;
    if (!holdExpired(doc.data(), now.getTime(), millisOf(doc.data()["holdUntil"]))) continue;
    try {
      // Antes de soltar a vaga: o aluno pode ter pagado e o webhook ainda não chegou.
      const pending = await center.collection("invoices")
        .where("enrollmentId", "==", doc.id).where("status", "==", "pending").get();
      let paid = false;
      for (const inv of pending.docs) {
        const paymentId = str(inv.data()["providerRef"]);
        if (!paymentId) continue;
        checked += 1;
        if ((await checkProvider(db, center.id, inv.id, paymentId, deps)).outcome === "approved") {
          approved += 1;
          paid = true;
        }
      }
      if (!paid && await releaseExpiredHold(db, doc.ref, now)) released += 1;
    } catch (e) {
      logger.warn(`sweepTrainingCenterBilling: reserva ${doc.ref.path} falhou`, e);
    }
  }

  // 2) Pendentes geradas no provedor há >2h (e de novo a cada 2h/12h): webhook perdido.
  const due = await db.collectionGroup("invoices").where("providerCheckAt", "<=", nowTs).limit(200).get();
  for (const doc of due.docs) {
    const centerDoc = doc.ref.parent.parent;
    if (!isCenterDoc(centerDoc)) continue;
    const data = doc.data();
    const paymentId = str(data["providerRef"]);
    if (data["status"] !== "pending" || !paymentId) {
      await doc.ref.update({providerCheckAt: null});
      continue;
    }
    try {
      checked += 1;
      const result = await checkProvider(db, centerDoc.id, doc.id, paymentId, deps);
      if (result.outcome === "approved") {
        approved += 1;
        continue;
      }
      const cur = (await doc.ref.get()).data();
      if (cur?.["status"] === "pending" && str(cur["providerRef"])) {
        const issued = millisOf(cur["providerIssuedAt"]) ?? now.getTime();
        await doc.ref.update({providerCheckAt: Timestamp.fromMillis(nextProviderCheck(issued, now.getTime()))});
      }
    } catch (e) {
      logger.warn(`sweepTrainingCenterBilling: consulta ${doc.ref.path} falhou`, e);
      await doc.ref.update({providerCheckAt: Timestamp.fromMillis(now.getTime() + PROVIDER_FIRST_CHECK_MS)}).catch(() => undefined);
    }
  }
  return {released, approved, checked};
}

export const sweepTrainingCenterBilling = onSchedule({
  schedule: "every 15 minutes",
  timeZone: "America/Sao_Paulo",
  secrets: [...asaasArenaSecrets],
}, async () => {
  const result = await sweepTrainingCenterBillingCore(getFirestore());
  if (result.released || result.approved || result.checked) logger.info("sweepTrainingCenterBilling", result);
});

// ---------------------------------------------------------------------------
// Callables
// ---------------------------------------------------------------------------

const CALL_OPTS = {
  region: CLIENT_FACING_REGIONS,
  secrets: [...asaasArenaSecrets, WEB_PUSH_PUBLIC_KEY, WEB_PUSH_PRIVATE_KEY, WEB_PUSH_SUBJECT],
};

export const issueTrainingCenterInvoicePayment = onCall(CALL_OPTS, async (request: CallableRequest) =>
  issueCenterInvoicePaymentCore(getFirestore(), request.auth?.uid, request.data));

export const resendTrainingCenterInvoicePix = onCall(CALL_OPTS, async (request: CallableRequest) =>
  resendCenterInvoicePixCore(getFirestore(), request.auth?.uid, request.data));

export const queryTrainingCenterInvoiceProvider = onCall({region: CLIENT_FACING_REGIONS, secrets: [...asaasArenaSecrets]},
  async (request: CallableRequest) => queryCenterInvoiceProviderCore(getFirestore(), request.auth?.uid, request.data));
