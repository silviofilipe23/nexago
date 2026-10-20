/**
 * Ganhos e saque do professor de equipe (canvas C1–C9, decisão do dono 20/10/2026: o saldo nexaGO
 * é SÓ do repasse da equipe da arena; o independente recebe na conta Asaas própria).
 *
 * 1. A arena paga o repasse fechado "pelo nexaGO" (`payArenaClassPayoutViaNexago`): numa transação
 *    o valor sai do `arenaWallets/{arenaId}.availableReais`, entra em
 *    `professorEarningsWallets/{uid}.availableReais`, os dois ganham linha no extrato e o repasse vira
 *    `paid` com `paymentMethod: "nexago"` (que não pode ser desfeito pela arena).
 * 2. O professor saca por PIX (`requestProfessorWithdrawal`) pela MESMA máquina dos saques de arena
 *    e organizador: reserva → doc em `professorWithdrawals` → PIX Asaas com prefixo
 *    `professorWithdrawal:` (≤ R$ 500 automático; acima, revisão no backoffice) → webhook
 *    TRANSFER_* e validação de saque, que já reconhecem o tipo `professor`.
 *
 * Sem tarifa de saque (como o organizador). A chave PIX é a da pessoa (`organizerPayoutProfiles/{uid}`,
 * a mesma do organizador — o perfil de recebimento é do usuário, não do papel).
 */
import * as logger from "firebase-functions/logger";
import {onCall, HttpsError, type CallableRequest} from "firebase-functions/v2/https";
import {FieldValue, getFirestore, Timestamp, type DocumentReference, type Firestore} from "firebase-admin/firestore";
import {ARENA_WITHDRAWAL_AUTO_MAX_REAIS} from "./arena-booking-payment-constants";
import {ARENA_CLASS_PAYOUTS} from "./arena-class-constants";
import {requireClassPayoutManager} from "./arena-class-payout-model";
import {arenaWalletRef} from "./arena-wallet";
import {isAsaasPayoutError} from "./arena-withdrawal-payout";
import {asaasArenaSecrets} from "./asaas-client";
import {type PayoutSendResult, resolveWithdrawalPixFields, sendArenaWithdrawalPixTransfer} from "./asaas-payout";
import {dayKeyFromEventDate} from "./event-timezone";
import {CLIENT_FACING_REGIONS} from "./function-regions";
import {roundMoney} from "./mercadopago-arena-helpers";
import {deliverNotificationToUser, WEB_PUSH_PRIVATE_KEY, WEB_PUSH_PUBLIC_KEY, WEB_PUSH_SUBJECT} from "./notification-delivery";
import {loadPayoutPixKey, savePayoutPixKey} from "./organizer-payout-profile";
import {assertPlatformAdmin} from "./organizer-withdrawal";
import {
  assertProfessorWithdrawalReservationValid,
  PROFESSOR_WITHDRAWAL_REF_PREFIX,
  PROFESSOR_WITHDRAWALS,
  professorEarningsWalletRef,
  releaseProfessorWithdrawalReservation,
  reserveProfessorWithdrawalAmount,
} from "./professor-earnings-wallet";
import {finalizeApprovedWithdrawal, manualReviewBlockReason} from "./withdrawal-transfer-state";

export const PROFESSOR_REPASSE_TYPE = "professor_repasse_paid";
export const PROFESSOR_WITHDRAWAL_MIN_REAIS = 1;

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function brl(v: number): string {
  return v.toLocaleString("pt-BR", {style: "currency", currency: "BRL"});
}

// ---------------------------------------------------------------------------
// 1. Arena paga o repasse pelo nexaGO
// ---------------------------------------------------------------------------

export interface PayViaNexagoResult {
  payoutId: string;
  amountReais: number;
  professorUid: string;
  arenaName: string;
  month: string;
}

export async function payArenaClassPayoutViaNexagoCore(
  db: Firestore,
  actorUid: string,
  payoutId: string,
  now: Date,
): Promise<PayViaNexagoResult> {
  if (!payoutId || payoutId.includes("/")) throw new HttpsError("invalid-argument", "Repasse inválido.");
  const ref = db.collection(ARENA_CLASS_PAYOUTS).doc(payoutId);
  const first = (await ref.get()).data();
  if (!first) throw new HttpsError("not-found", "Repasse não encontrado.");
  const arenaId = str(first["arenaId"]);
  await requireClassPayoutManager(db, arenaId, actorUid);
  const arena = (await db.collection("arenas").doc(arenaId).get()).data();
  const arenaName = str(arena?.["name"]) || "Arena";
  const todayKey = dayKeyFromEventDate(now);

  return db.runTransaction(async (tx) => {
    const payout = (await tx.get(ref)).data() ?? {};
    if (payout["status"] !== "closed") {
      throw new HttpsError("failed-precondition",
        payout["status"] === "paid" ? "Este repasse já foi pago." : "Feche o repasse do mês antes de pagar.");
    }
    const professorUid = str(payout["teacherUserId"]);
    if (!professorUid) {
      throw new HttpsError("failed-precondition",
        "Este professor não tem conta nexaGO ligada às Aulas — pague por fora (PIX, transferência ou dinheiro).");
    }
    const amount = roundMoney(Number(payout["amountReais"]) || 0);
    if (!(amount > 0)) throw new HttpsError("failed-precondition", "Repasse sem valor a pagar.");

    const arenaWalletDoc = arenaWalletRef(db, arenaId);
    const professorWalletDoc = professorEarningsWalletRef(db, professorUid);
    const [arenaWallet, professorWallet] = await Promise.all([tx.get(arenaWalletDoc), tx.get(professorWalletDoc)]);
    const available = Number(arenaWallet.data()?.["availableReais"]) || 0;
    if (available + 0.001 < amount) {
      throw new HttpsError("failed-precondition",
        `Saldo disponível do caixa (${brl(available)}) não cobre o repasse de ${brl(amount)}.`);
    }
    const month = str(payout["month"]);
    const teacherName = str(payout["teacherName"]) || "Professor";

    tx.set(arenaWalletDoc, {
      availableReais: roundMoney(available - amount), updatedAt: FieldValue.serverTimestamp(),
    }, {merge: true});
    tx.set(arenaWalletDoc.collection("ledger").doc(), {
      type: "class_payout",
      payoutId,
      teacherUserId: professorUid,
      teacherName,
      month,
      grossReais: amount,
      platformFeeReais: 0,
      netReais: -amount,
      createdAt: FieldValue.serverTimestamp(),
    });
    const professorAvailable = Number(professorWallet.data()?.["availableReais"]) || 0;
    tx.set(professorWalletDoc, {
      professorUid,
      availableReais: roundMoney(professorAvailable + amount),
      pendingReais: Number(professorWallet.data()?.["pendingReais"]) || 0,
      updatedAt: FieldValue.serverTimestamp(),
    }, {merge: true});
    tx.set(professorWalletDoc.collection("ledger").doc(), {
      type: "repasse",
      arenaId,
      arenaName,
      payoutId,
      month,
      amountReais: amount,
      createdAt: FieldValue.serverTimestamp(),
    });
    tx.set(ref, {
      status: "paid",
      paidOn: todayKey,
      paidAt: FieldValue.serverTimestamp(),
      paymentMethod: "nexago",
      paidByUid: actorUid,
      updatedAt: FieldValue.serverTimestamp(),
    }, {merge: true});
    return {payoutId, amountReais: amount, professorUid, arenaName, month};
  });
}

// ---------------------------------------------------------------------------
// 2. Repasses fechados ainda não pagos ("em liberação")
// ---------------------------------------------------------------------------

export interface PendingPayoutItem {
  payoutId: string;
  arenaId: string;
  arenaName: string;
  month: string;
  amountReais: number;
  closedAt: string | null;
}

export async function loadMyPendingClassPayouts(db: Firestore, uid: string): Promise<PendingPayoutItem[]> {
  const snap = await db.collection(ARENA_CLASS_PAYOUTS)
    .where("teacherUserId", "==", uid)
    .where("status", "==", "closed")
    .limit(24)
    .get();
  const arenaIds = [...new Set(snap.docs.map((d) => str(d.data()["arenaId"])).filter(Boolean))];
  const arenas = arenaIds.length ? await db.getAll(...arenaIds.map((id) => db.collection("arenas").doc(id))) : [];
  const names = new Map(arenas.map((a) => [a.id, str(a.data()?.["name"]) || "Arena"]));
  return snap.docs.map((d) => {
    const p = d.data();
    const closedAt = p["closedAt"] instanceof Timestamp ? p["closedAt"].toDate().toISOString() : null;
    return {
      payoutId: d.id,
      arenaId: str(p["arenaId"]),
      arenaName: names.get(str(p["arenaId"])) ?? "Arena",
      month: str(p["month"]),
      amountReais: roundMoney(Number(p["amountReais"]) || 0),
      closedAt,
    };
  }).filter((p) => p.amountReais > 0).sort((a, b) => b.month.localeCompare(a.month));
}

// ---------------------------------------------------------------------------
// 3. Saque
// ---------------------------------------------------------------------------

export type ProfessorPixSender = (
  withdrawalRef: DocumentReference,
  withdrawal: Record<string, unknown>,
  externalRefPrefix: string,
) => Promise<PayoutSendResult>;

/** Valida a reserva, manda o PIX e consome o reservado (mesmo desenho do organizador). */
export async function completeProfessorWithdrawalPayout(
  db: Firestore,
  withdrawalRef: DocumentReference,
  withdrawal: Record<string, unknown>,
  reviewedBy: string,
  reviewNote?: string,
  sendPixTransfer: ProfessorPixSender = sendArenaWithdrawalPixTransfer,
): Promise<{withdrawalId: string; status: "approved"; payoutId: string | null; payoutStatus: string}> {
  const professorUid = str(withdrawal["professorUid"]);
  const amountReais = Number(withdrawal["amountReais"]) || 0;
  if (!professorUid || amountReais <= 0) throw new Error("WITHDRAWAL_DATA_INVALID");
  await assertProfessorWithdrawalReservationValid(db, professorUid, amountReais);
  const payout = await sendPixTransfer(withdrawalRef, withdrawal, PROFESSOR_WITHDRAWAL_REF_PREFIX);
  await finalizeApprovedWithdrawal(db, "professor", withdrawalRef, amountReais, {reviewedBy, reviewNote});
  return {
    withdrawalId: withdrawalRef.id,
    status: "approved",
    payoutId: (payout as {payoutId?: string | null}).payoutId ?? null,
    payoutStatus: (payout as {payoutStatus?: string}).payoutStatus ?? "sent",
  };
}

/** O MESMO objeto é gravado e entregue ao envio (a lição do saque do organizador). */
export function buildProfessorWithdrawalDoc(input: {
  professorUid: string;
  amountReais: number;
  pixKey: string;
  pixKeyType: string;
  processingMode: "auto" | "manual_review";
}): Record<string, unknown> {
  return {
    professorUid: input.professorUid,
    requestedBy: input.professorUid,
    amountReais: input.amountReais,
    feeReais: 0,
    netReais: input.amountReais,
    pixKey: input.pixKey,
    pixKeyType: input.pixKeyType,
    processingMode: input.processingMode,
    status: "pending",
    payoutStatus: "pending",
    payoutProvider: "asaas",
  };
}

export async function requestProfessorWithdrawalCore(
  db: Firestore,
  uid: string,
  rawAmount: unknown,
  sendPixTransfer: ProfessorPixSender = sendArenaWithdrawalPixTransfer,
): Promise<{
  withdrawalId: string; status: string; payoutStatus: string; autoProcessed: boolean;
  processingMode: string; message?: string;
}> {
  const amount = roundMoney(typeof rawAmount === "number" ? rawAmount : Number(rawAmount));
  if (!Number.isFinite(amount) || amount < PROFESSOR_WITHDRAWAL_MIN_REAIS) {
    throw new HttpsError("invalid-argument", `Saque mínimo de ${brl(PROFESSOR_WITHDRAWAL_MIN_REAIS)}.`);
  }
  const profile = await loadPayoutPixKey(db, uid);
  if (!profile.pixKey) throw new HttpsError("failed-precondition", "Cadastre sua chave PIX antes de sacar.");
  const {pixAddressKey, pixAddressKeyType} = resolveWithdrawalPixFields(profile.pixKey, profile.pixKeyType || undefined);
  if (pixAddressKey.length < 5) throw new HttpsError("invalid-argument", "Chave PIX inválida.");

  const pending = await db.collection(PROFESSOR_WITHDRAWALS)
    .where("professorUid", "==", uid).where("status", "==", "pending").limit(1).get();
  if (!pending.empty) {
    throw new HttpsError("failed-precondition", "Você já tem um saque em andamento. Aguarde ele terminar.");
  }

  try {
    await reserveProfessorWithdrawalAmount(db, uid, amount);
  } catch (e) {
    if (e instanceof Error && e.message === "INSUFFICIENT_BALANCE") {
      throw new HttpsError("failed-precondition", "Saldo insuficiente para este saque.");
    }
    throw e;
  }

  const autoEligible = amount <= ARENA_WITHDRAWAL_AUTO_MAX_REAIS + 0.001;
  const processingMode = autoEligible ? "auto" : "manual_review";
  const withdrawalRef = db.collection(PROFESSOR_WITHDRAWALS).doc();
  const withdrawalData = buildProfessorWithdrawalDoc({
    professorUid: uid, amountReais: amount, pixKey: pixAddressKey, pixKeyType: pixAddressKeyType, processingMode,
  });
  await withdrawalRef.set({...withdrawalData, createdAt: FieldValue.serverTimestamp()});

  if (!autoEligible) {
    return {
      withdrawalId: withdrawalRef.id, status: "pending", payoutStatus: "pending", autoProcessed: false, processingMode,
      message: `Saque acima de ${brl(ARENA_WITHDRAWAL_AUTO_MAX_REAIS)}. Aguardando aprovação da plataforma.`,
    };
  }
  try {
    const result = await completeProfessorWithdrawalPayout(
      db, withdrawalRef, withdrawalData, uid, "PIX automático na solicitação", sendPixTransfer);
    return {
      withdrawalId: withdrawalRef.id, status: result.status, payoutStatus: result.payoutStatus,
      autoProcessed: true, processingMode,
    };
  } catch (e) {
    logger.warn(`requestProfessorWithdrawal: PIX automático falhou ${withdrawalRef.id}`, e);
    const snap = await withdrawalRef.get();
    return {
      withdrawalId: withdrawalRef.id,
      status: "pending",
      payoutStatus: (snap.data()?.["payoutStatus"] as string | undefined) ?? "failed",
      autoProcessed: false,
      processingMode,
      message: isAsaasPayoutError(e) ? e.message : "Não foi possível enviar o PIX agora. Nossa equipe vai revisar.",
    };
  }
}

/** Revisão no backoffice (saque acima do limite ou PIX automático que falhou). */
export async function reviewProfessorWithdrawalCore(
  db: Firestore,
  adminUid: string,
  input: {withdrawalId: string; decision: string; note?: string},
  sendPixTransfer: ProfessorPixSender = sendArenaWithdrawalPixTransfer,
): Promise<Record<string, unknown>> {
  const ref = db.collection(PROFESSOR_WITHDRAWALS).doc(input.withdrawalId || "_");
  const snap = await ref.get();
  if (!input.withdrawalId || !snap.exists) throw new HttpsError("not-found", "Solicitação de saque não encontrada");
  const w = snap.data()!;
  if (str(w["status"]).toLowerCase() !== "pending") throw new HttpsError("failed-precondition", "Saque já foi revisado.");
  const decision = input.decision;
  if (!["approved", "approved_manual", "rejected"].includes(decision)) {
    throw new HttpsError("invalid-argument", "decision deve ser approved, approved_manual ou rejected");
  }
  const block = decision === "approved" ? null : manualReviewBlockReason(w);
  if (block) throw new HttpsError("failed-precondition", block);
  const amount = Number(w["amountReais"]) || 0;
  const professorUid = str(w["professorUid"]);
  const note = input.note?.trim() ?? "";
  if (decision === "rejected") {
    await releaseProfessorWithdrawalReservation(db, professorUid, amount, false);
    await ref.update({status: "rejected", reviewedBy: adminUid, reviewedAt: FieldValue.serverTimestamp(), reviewNote: note || null});
    return {withdrawalId: ref.id, status: "rejected"};
  }
  if (decision === "approved_manual") {
    await releaseProfessorWithdrawalReservation(db, professorUid, amount, true);
    await ref.update({
      status: "approved", payoutStatus: "manual", payoutError: FieldValue.delete(), reviewedBy: adminUid,
      reviewedAt: FieldValue.serverTimestamp(), reviewNote: note || "PIX enviado manualmente fora do sistema",
    });
    return {withdrawalId: ref.id, status: "approved", payoutStatus: "manual"};
  }
  try {
    const result = await completeProfessorWithdrawalPayout(db, ref, w, adminUid, note, sendPixTransfer);
    return {withdrawalId: ref.id, status: result.status, payoutStatus: result.payoutStatus, asaasTransferId: result.payoutId};
  } catch (e) {
    if (isAsaasPayoutError(e)) throw new HttpsError("failed-precondition", e.message);
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === "WITHDRAWAL_RESERVATION_INVALID") {
      throw new HttpsError("failed-precondition", "Reserva de saldo inconsistente. Rejeite o saque e peça nova solicitação.");
    }
    if (msg === "WITHDRAWAL_ALREADY_REVIEWED") throw new HttpsError("failed-precondition", "Saque já foi revisado.");
    if (msg === "TRANSFER_NOT_CONCLUDED") {
      throw new HttpsError("failed-precondition", "O Asaas não concluiu a transferência. O saque segue na fila.");
    }
    throw new HttpsError("internal", "Falha ao processar o saque.");
  }
}

// ---------------------------------------------------------------------------
// Callables
// ---------------------------------------------------------------------------

function requireUid(r: CallableRequest): string {
  const uid = r.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Faça login para continuar.");
  return uid;
}
const dataOf = (r: CallableRequest) => (r.data ?? {}) as Record<string, unknown>;

export const payArenaClassPayoutViaNexago = onCall({
  region: CLIENT_FACING_REGIONS,
  secrets: [WEB_PUSH_PUBLIC_KEY, WEB_PUSH_PRIVATE_KEY, WEB_PUSH_SUBJECT],
}, async (r) => {
  const uid = requireUid(r);
  const result = await payArenaClassPayoutViaNexagoCore(getFirestore(), uid, str(dataOf(r)["payoutId"]), new Date());
  try {
    await deliverNotificationToUser({
      userId: result.professorUid,
      title: "Repasse disponível para saque",
      body: `${result.arenaName} pagou ${brl(result.amountReais)} do repasse de ${result.month}. Saque pelo app.`,
      type: PROFESSOR_REPASSE_TYPE,
      data: {payoutId: result.payoutId, url: "/professor/mais/ganhos"},
      requireInteraction: false,
    });
  } catch (e) {
    logger.warn(`payArenaClassPayoutViaNexago ${result.payoutId}: push falhou`, e);
  }
  return {payoutId: result.payoutId, status: "paid", paymentMethod: "nexago", amountReais: result.amountReais};
});

export const getMyPendingClassPayouts = onCall({region: CLIENT_FACING_REGIONS}, async (r) =>
  ({items: await loadMyPendingClassPayouts(getFirestore(), requireUid(r))}));

export const setProfessorPayoutPixKey = onCall({region: CLIENT_FACING_REGIONS}, async (r) => {
  const uid = requireUid(r);
  const pixKey = str(dataOf(r)["pixKey"]);
  const {pixAddressKey, pixAddressKeyType} = resolveWithdrawalPixFields(pixKey, str(dataOf(r)["pixKeyType"]) || undefined);
  if (pixAddressKey.length < 5) throw new HttpsError("invalid-argument", "Chave PIX inválida.");
  await savePayoutPixKey(getFirestore(), uid, {pixKey: pixAddressKey, pixKeyType: pixAddressKeyType});
  return {pixKey: pixAddressKey, pixKeyType: pixAddressKeyType};
});

export const requestProfessorWithdrawal = onCall({region: CLIENT_FACING_REGIONS, secrets: [...asaasArenaSecrets]}, async (r) =>
  requestProfessorWithdrawalCore(getFirestore(), requireUid(r), dataOf(r)["amountReais"]));

export const listPendingProfessorWithdrawals = onCall({region: CLIENT_FACING_REGIONS}, async (r) => {
  const uid = requireUid(r);
  await assertPlatformAdmin(uid);
  const db = getFirestore();
  const snap = await db.collection(PROFESSOR_WITHDRAWALS).where("status", "==", "pending").limit(100).get();
  const uids = [...new Set(snap.docs.map((d) => str(d.data()["professorUid"])).filter(Boolean))];
  const users = uids.length ? await db.getAll(...uids.map((id) => db.collection("users").doc(id))) : [];
  const names = new Map(users.map((u) => [u.id, str(u.data()?.["fullName"]) || u.id]));
  return {
    items: snap.docs.map((d) => {
      const w = d.data();
      const createdAt = w["createdAt"] instanceof Timestamp ? w["createdAt"].toDate().toISOString() : null;
      return {
        id: d.id,
        professorUid: str(w["professorUid"]),
        professorName: names.get(str(w["professorUid"])) ?? "",
        amountReais: Number(w["amountReais"]) || 0,
        pixKey: str(w["pixKey"]),
        status: str(w["status"]) || "pending",
        payoutStatus: str(w["payoutStatus"]) || null,
        payoutError: str(w["payoutError"]) || null,
        asaasTransferId: str(w["asaasTransferId"]) || null,
        createdAt,
      };
    }),
  };
});

export const reviewProfessorWithdrawal = onCall({region: CLIENT_FACING_REGIONS, secrets: [...asaasArenaSecrets]}, async (r) => {
  const uid = requireUid(r);
  await assertPlatformAdmin(uid);
  const data = dataOf(r);
  return reviewProfessorWithdrawalCore(getFirestore(), uid, {
    withdrawalId: str(data["withdrawalId"]),
    decision: str(data["decision"]).toLowerCase(),
    note: str(data["note"]),
  });
});
