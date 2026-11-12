/**
 * Plano de aula contratado pelo app com Pix/cartão: pagar ao assinar, como nos Planos de horário.
 *
 * - Assinar cria a matrícula em `pending_payment` com a vaga segurada por 30 min (o aluno já entra
 *   na turma, então ninguém pega a vaga) e o 1º pagamento online (grupo Asaas do worker de aulas).
 * - Pago (o webhook marca a mensalidade `paid`) → gatilho ativa a matrícula.
 * - Não pago até o prazo (+ folga do webhook) → agendador cancela matrícula, cobranças, grupo Asaas e
 *   o contrato; a vaga volta. Pagamento que chegar depois cai no estorno automático do webhook
 *   (mensalidade já não está em aberto).
 * - Um plano sem pagar por vez: com uma matrícula esperando pagamento, o aluno não contrata outra.
 * - Depois de ativa, as mensalidades seguem sozinhas pelo agendador (link + aviso todo mês).
 */
import * as logger from "firebase-functions/logger";
import {HttpsError, onCall} from "firebase-functions/v2/https";
import {onDocumentUpdated} from "firebase-functions/v2/firestore";
import {onSchedule} from "firebase-functions/v2/scheduler";
import {FieldValue, Timestamp, getFirestore, type Firestore} from "firebase-admin/firestore";
import {CLIENT_FACING_REGIONS} from "./function-regions";
import {asaasArenaSecrets} from "./asaas-client";
import {fetchAsaasPixQrCode} from "./asaas-booking-payment";
import {ARENA_CLASS_ASAAS_PAYMENTS, ARENA_CLASS_CHARGES, ARENA_CLASS_ENROLLMENTS} from "./arena-class-constants";
import {firstGroupId} from "./arena-class-asaas-model";
import {requestGroupVoid, setEnrollmentStatusCore, studentAgreementId} from "./arena-class-billing";
import {ARENA_AGREEMENTS} from "./arena-agreements-model";
import {penaltyChargeId} from "./arena-class-cancellation-model";
import {dayKeyFromEventDate} from "./event-timezone";
import {requireUid, str} from "./arena-class";

export const PENDING_PAYMENT_STATUS = "pending_payment";
/** Vaga segurada esperando o 1º pagamento. */
export const SIGNUP_PAYMENT_WINDOW_MS = 30 * 60_000;
/** Folga depois do prazo para o webhook do Asaas chegar antes de cancelar. */
export const SIGNUP_PAYMENT_GRACE_MS = 5 * 60_000;
/** Abaixo disso o Asaas recusa a fatura: a matrícula entra ativa e a cobrança segue normal. */
export const MIN_SIGNUP_ONLINE_REAIS = 5;

type Data = Record<string, unknown>;

function millis(v: unknown): number | null {
  return v instanceof Timestamp ? v.toMillis() : null;
}

/** Matrícula do aluno esperando pagamento ainda no prazo (qualquer arena), ou null. */
export async function myOpenPendingEnrollment(db: Firestore, uid: string, nowMs: number): Promise<{id: string; data: Data} | null> {
  const snap = await db.collection(ARENA_CLASS_ENROLLMENTS)
    .where("athleteId", "==", uid).where("status", "==", PENDING_PAYMENT_STATUS).limit(5).get();
  for (const d of snap.docs) {
    const until = millis(d.data()["pendingPaymentUntil"]);
    if (until == null || until + SIGNUP_PAYMENT_GRACE_MS > nowMs) return {id: d.id, data: d.data()};
  }
  return null;
}

export function pendingBlockMessage(planName: string): string {
  return `Pague o plano ${planName} primeiro: ele está esperando o pagamento.`;
}

// ---------------------------------------------------------------------------
// Tela de pagamento do app
// ---------------------------------------------------------------------------

export interface EnrollmentPaymentDeps {
  fetchPixQrCode: (paymentId: string) => Promise<{qrCode: string; qrCodeBase64: string}>;
  now: () => Date;
}

export const defaultEnrollmentPaymentDeps: EnrollmentPaymentDeps = {
  fetchPixQrCode: (paymentId) => fetchAsaasPixQrCode(paymentId),
  now: () => new Date(),
};

export type EnrollmentPaymentState = "preparing" | "ready" | "paid" | "expired" | "failed";

/**
 * O que a tela de pagamento mostra: valor, prazo e — com o pagamento criado no Asaas — o Pix (QR e
 * copia-e-cola) ou o link do cartão. `preparing` = o worker ainda está criando a fatura (o app tenta
 * de novo em segundos).
 */
export async function enrollmentPaymentCore(db: Firestore, uid: string, input: Data, deps: EnrollmentPaymentDeps) {
  const enrollmentId = str(input["enrollmentId"]);
  const method = input["method"] === "card" ? "card" : "pix";
  if (!enrollmentId || enrollmentId.includes("/")) throw new HttpsError("invalid-argument", "Matrícula inválida.");
  const snap = await db.collection(ARENA_CLASS_ENROLLMENTS).doc(enrollmentId).get();
  const e = snap.data();
  if (!e || e["athleteId"] !== uid) throw new HttpsError("not-found", "Matrícula não encontrada.");
  const status = str(e["status"]);
  // `kind: penalty` = a multa do cancelamento (mesma tela, outro grupo do Asaas).
  const penalty = input["kind"] === "penalty";
  const groupId = penalty ? penaltyChargeId(enrollmentId) : firstGroupId(enrollmentId);
  const group = (await db.collection(ARENA_CLASS_ASAAS_PAYMENTS).doc(groupId).get()).data() ?? {};
  const base = {
    enrollmentId,
    planName: str((e["plan"] as Data | undefined)?.["name"]) || "Plano",
    amountReais: Number(group["amountReais"] ?? 0),
    description: str(group["description"]),
    pendingPaymentUntil: millis(e["pendingPaymentUntil"]) != null ? new Date(millis(e["pendingPaymentUntil"])!).toISOString() : null,
    method,
  };
  if (penalty) {
    const charge = (await db.collection(ARENA_CLASS_CHARGES).doc(groupId).get()).data();
    if (!charge) throw new HttpsError("not-found", "Multa não encontrada.");
    base.amountReais = Number(charge["amountReais"] ?? base.amountReais);
    base.description = str(charge["description"]) || base.description;
    if (charge["status"] === "paid") return {...base, state: "paid" as EnrollmentPaymentState};
    if (charge["status"] !== "open") return {...base, state: "expired" as EnrollmentPaymentState};
  } else {
    if (status === "active") return {...base, state: "paid" as EnrollmentPaymentState};
    if (status !== PENDING_PAYMENT_STATUS) return {...base, state: "expired" as EnrollmentPaymentState};
  }
  const groupState = str(group["state"]);
  if (groupState === "paid") return {...base, state: "paid" as EnrollmentPaymentState};
  if (groupState === "failed" || groupState === "void" || groupState === "voiding") {
    return {...base, state: "failed" as EnrollmentPaymentState};
  }
  const paymentId = str(group["paymentId"]);
  if (!paymentId) return {...base, state: "preparing" as EnrollmentPaymentState};
  if (method === "card") {
    const invoiceUrl = str(group["invoiceUrl"]);
    return invoiceUrl ?
      {...base, state: "ready" as EnrollmentPaymentState, invoiceUrl} :
      {...base, state: "preparing" as EnrollmentPaymentState};
  }
  try {
    const pix = await deps.fetchPixQrCode(paymentId);
    return {...base, state: "ready" as EnrollmentPaymentState, pix, invoiceUrl: str(group["invoiceUrl"]) || null};
  } catch (error) {
    logger.warn("getMyClassEnrollmentPayment: QR do Pix ainda não saiu", {enrollmentId, error});
    return {...base, state: "preparing" as EnrollmentPaymentState};
  }
}

export const getMyClassEnrollmentPayment = onCall({
  region: CLIENT_FACING_REGIONS,
  timeoutSeconds: 60,
  secrets: [...asaasArenaSecrets],
}, async (request) =>
  enrollmentPaymentCore(getFirestore(), requireUid(request.auth), (request.data ?? {}) as Data, defaultEnrollmentPaymentDeps));

// ---------------------------------------------------------------------------
// Pago → ativa
// ---------------------------------------------------------------------------

/** Matrícula esperando pagamento vira ativa (idempotente). */
export async function activatePaidEnrollmentCore(db: Firestore, enrollmentId: string): Promise<boolean> {
  const ref = db.collection(ARENA_CLASS_ENROLLMENTS).doc(enrollmentId);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (snap.data()?.["status"] !== PENDING_PAYMENT_STATUS) return false;
    tx.set(ref, {
      status: "active",
      pendingPaymentUntil: null,
      paymentConfirmedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    }, {merge: true});
    return true;
  });
}

/** Multa do cancelamento paga: a gaveta da arena e o app mostram "Paga". */
export async function markPenaltyPaid(db: Firestore, enrollmentId: string): Promise<void> {
  const ref = db.collection(ARENA_CLASS_ENROLLMENTS).doc(enrollmentId);
  await db.runTransaction(async (tx) => {
    const e = (await tx.get(ref)).data();
    const req = e?.["cancelRequest"];
    if (req == null || typeof req !== "object") return;
    tx.set(ref, {cancelRequest: {...(req as Data), penaltyStatus: "paid"}, updatedAt: FieldValue.serverTimestamp()}, {merge: true});
  });
}

export const onArenaClassChargePaidActivateEnrollment = onDocumentUpdated(`${ARENA_CLASS_CHARGES}/{chargeId}`, async (event) => {
  const before = event.data?.before.data();
  const after = event.data?.after.data();
  if (!after || before?.["status"] === "paid" || after["status"] !== "paid") return;
  const enrollmentId = str(after["enrollmentId"]);
  if (!enrollmentId) return;
  if (event.params.chargeId === penaltyChargeId(enrollmentId)) {
    await markPenaltyPaid(getFirestore(), enrollmentId);
    return;
  }
  const activated = await activatePaidEnrollmentCore(getFirestore(), enrollmentId);
  if (activated) logger.info("matrícula paga e ativada", {enrollmentId, chargeId: event.params.chargeId});
});

// ---------------------------------------------------------------------------
// Prazo vencido → cancela e devolve a vaga
// ---------------------------------------------------------------------------

/** Cancela a matrícula que não foi paga: turma, cobranças em aberto, fatura do Asaas e o contrato. */
export async function expirePendingEnrollmentCore(db: Firestore, enrollmentId: string, now: Date): Promise<"expired" | "activated" | "skipped"> {
  const ref = db.collection(ARENA_CLASS_ENROLLMENTS).doc(enrollmentId);
  const e = (await ref.get()).data();
  if (!e || e["status"] !== PENDING_PAYMENT_STATUS) return "skipped";
  const group = (await db.collection(ARENA_CLASS_ASAAS_PAYMENTS).doc(firstGroupId(enrollmentId)).get()).data();
  // Pago sem o gatilho ter rodado ainda: ativa em vez de cancelar.
  if (group?.["state"] === "paid") {
    await activatePaidEnrollmentCore(db, enrollmentId);
    return "activated";
  }
  const todayKey = dayKeyFromEventDate(now);
  await setEnrollmentStatusCore(db, enrollmentId, "canceled", todayKey);
  const at = Timestamp.fromDate(now);
  await db.runTransaction(async (tx) => {
    const charges = await tx.get(db.collection(ARENA_CLASS_CHARGES).where("enrollmentId", "==", enrollmentId));
    const agreementRef = db.collection(ARENA_AGREEMENTS).doc(studentAgreementId(enrollmentId));
    const agreement = await tx.get(agreementRef);
    for (const c of charges.docs) {
      if (c.data()["status"] === "open") tx.set(c.ref, {status: "canceled", canceledAt: at, cancelReason: "payment_expired"}, {merge: true});
    }
    if (group && group["state"] !== "void") requestGroupVoid(tx, db, firstGroupId(enrollmentId), "payment_expired");
    tx.set(ref, {canceledReason: "payment_expired", pendingPaymentUntil: null, updatedAt: at}, {merge: true});
    if (agreement.exists) {
      tx.set(agreementRef, {status: "canceled", endReason: "payment_expired", canceledAt: at, updatedAt: at}, {merge: true});
    }
  });
  return "expired";
}

export async function expirePendingEnrollmentsCore(db: Firestore, now: Date): Promise<{expired: number; activated: number}> {
  const snap = await db.collection(ARENA_CLASS_ENROLLMENTS).where("status", "==", PENDING_PAYMENT_STATUS).limit(200).get();
  let expired = 0;
  let activated = 0;
  for (const d of snap.docs) {
    const until = millis(d.data()["pendingPaymentUntil"]);
    if (until == null || until + SIGNUP_PAYMENT_GRACE_MS > now.getTime()) continue;
    try {
      const out = await expirePendingEnrollmentCore(db, d.id, now);
      if (out === "expired") expired += 1;
      if (out === "activated") activated += 1;
    } catch (error) {
      logger.error("expirar matrícula sem pagamento falhou", {enrollmentId: d.id, error});
    }
  }
  return {expired, activated};
}

export const expireArenaClassPendingEnrollments = onSchedule({
  schedule: "every 5 minutes",
  timeZone: "America/Sao_Paulo",
}, async () => {
  const out = await expirePendingEnrollmentsCore(getFirestore(), new Date());
  if (out.expired || out.activated) logger.info("expireArenaClassPendingEnrollments", out);
});
