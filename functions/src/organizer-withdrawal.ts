/**
 * Saque do organizador — espelha os callables de saque de arena
 * (`arena-booking-pix.ts`). Carteira: `organizerWallets/{uid}` (id = uid do
 * organizador; a chave PIX de repasse fica no próprio doc da carteira).
 * Aprovação: auto até R$500, manual acima (revisão no backoffice).
 */
import {onCall, HttpsError} from "firebase-functions/v2/https";
import {
  getFirestore,
  FieldValue,
  Timestamp,
  type QueryDocumentSnapshot,
} from "firebase-admin/firestore";
import {getAuth} from "firebase-admin/auth";
import * as logger from "firebase-functions/logger";
import {roundMoney} from "./mercadopago-arena-helpers";
import {
  reserveOrganizerWithdrawalAmount,
  releaseOrganizerWithdrawalReservation,
  organizerWalletRef,
} from "./organizer-wallet";
import {
  completeOrganizerWithdrawalPayout,
} from "./organizer-withdrawal-payout";
import {isAsaasPayoutError} from "./arena-withdrawal-payout";
import {resolveWithdrawalPixFields} from "./asaas-payout";
import {asaasArenaSecrets} from "./asaas-client";
import {callerIsOrganizer, callerIsSuperAdmin} from "./auth-roles";
import {ARENA_WITHDRAWAL_AUTO_MAX_REAIS} from "./arena-booking-payment-constants";

const ORGANIZER_WITHDRAWALS = "organizerWithdrawals";

async function assertPlatformAdmin(uid: string): Promise<void> {
  const caller = await getAuth().getUser(uid);
  if (!callerIsOrganizer(caller) && !callerIsSuperAdmin(caller)) {
    throw new HttpsError(
      "permission-denied",
      "Apenas administradores da plataforma podem acessar saques.",
    );
  }
}

function isFirestoreIndexError(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  const code = (err as {code?: number}).code;
  const message = err instanceof Error ? err.message : "";
  return code === 9 || message.includes("requires an index");
}

async function assertNoPendingOrganizerWithdrawal(
  db: ReturnType<typeof getFirestore>,
  organizerId: string,
): Promise<void> {
  const col = db.collection(ORGANIZER_WITHDRAWALS);
  const snap = await col
    .where("organizerId", "==", organizerId)
    .where("status", "==", "pending")
    .limit(1)
    .get()
    .catch(async (err) => {
      if (!isFirestoreIndexError(err)) throw err;
      return col.where("organizerId", "==", organizerId).limit(20).get();
    });
  const hasPending = snap.docs.some(
    (d) => (d.data().status as string | undefined)?.toLowerCase() === "pending",
  );
  if (hasPending) {
    throw new HttpsError(
      "failed-precondition",
      "Já existe um saque pendente. Aguarde a conclusão ou contate o suporte.",
    );
  }
}

/** Cadastra/atualiza a chave PIX de repasse do organizador (no doc da carteira). */
export const setOrganizerPayoutPixKey = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Faça login para continuar.");

  const data = (request.data ?? {}) as {pixKey?: string; pixKeyType?: string};
  const pixKey = data.pixKey?.trim() ?? "";
  const pixKeyType = data.pixKeyType?.trim().toUpperCase() ?? "";

  const {pixAddressKey, pixAddressKeyType} = resolveWithdrawalPixFields(
    pixKey,
    pixKeyType || undefined,
  );
  if (pixAddressKey.length < 5) {
    throw new HttpsError("invalid-argument", "Chave PIX inválida.");
  }

  const db = getFirestore();
  await organizerWalletRef(db, uid).set(
    {
      organizerId: uid,
      payoutPixKey: pixAddressKey,
      payoutPixKeyType: pixAddressKeyType,
      updatedAt: FieldValue.serverTimestamp(),
    },
    {merge: true},
  );
  return {success: true, pixKey: pixAddressKey, pixKeyType: pixAddressKeyType};
});

export const requestOrganizerWithdrawal = onCall(
  {secrets: [...asaasArenaSecrets]},
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "Faça login para continuar.");

    const data = (request.data ?? {}) as {
      amountReais?: number;
      pixKey?: string;
      pixKeyType?: string;
    };
    const amountReais = typeof data.amountReais === "number" ? data.amountReais : 0;
    if (!Number.isFinite(amountReais) || amountReais <= 0) {
      throw new HttpsError("invalid-argument", "Informe um valor válido para saque.");
    }

    const db = getFirestore();
    const walletSnap = await organizerWalletRef(db, uid).get();
    const wallet = walletSnap.data() ?? {};

    let pixKey = data.pixKey?.trim() ?? "";
    let pixKeyType = data.pixKeyType?.trim().toUpperCase() ?? "";
    if (pixKey.length < 5) {
      pixKey = (wallet.payoutPixKey as string | undefined)?.trim() ?? "";
      if (!pixKeyType) {
        pixKeyType = (wallet.payoutPixKeyType as string | undefined)?.trim() ?? "";
      }
    }
    if (pixKey.length < 5) {
      throw new HttpsError(
        "invalid-argument",
        "Cadastre uma chave PIX de repasse antes de sacar.",
      );
    }

    const {pixAddressKey, pixAddressKeyType} = resolveWithdrawalPixFields(
      pixKey,
      pixKeyType || undefined,
    );
    if (pixAddressKey.length < 5) {
      throw new HttpsError("invalid-argument", "Chave PIX inválida.");
    }

    await assertNoPendingOrganizerWithdrawal(db, uid);

    const amount = roundMoney(amountReais);
    try {
      await reserveOrganizerWithdrawalAmount(db, uid, amount);
    } catch (e) {
      if (e instanceof Error && e.message === "INSUFFICIENT_BALANCE") {
        throw new HttpsError("failed-precondition", "Saldo insuficiente para este saque.");
      }
      throw e;
    }

    const autoEligible = amount <= ARENA_WITHDRAWAL_AUTO_MAX_REAIS + 0.001;
    const processingMode = autoEligible ? "auto" : "manual_review";

    const withdrawalRef = db.collection(ORGANIZER_WITHDRAWALS).doc();
    await withdrawalRef.set({
      organizerId: uid,
      amountReais: amount,
      pixKey: pixAddressKey,
      pixKeyType: pixAddressKeyType,
      processingMode,
      status: "pending",
      payoutStatus: "pending",
      payoutProvider: "asaas",
      createdAt: FieldValue.serverTimestamp(),
    });

    const withdrawalId = withdrawalRef.id;
    if (autoEligible) {
      try {
        const result = await completeOrganizerWithdrawalPayout(
          db,
          withdrawalRef,
          {organizerId: uid, amountReais: amount, pixKey: pixAddressKey, pixKeyType: pixAddressKeyType},
          uid,
          "PIX automático na solicitação",
        );
        return {
          withdrawalId,
          status: result.status,
          payoutStatus: result.payoutStatus,
          asaasTransferId: result.payoutId,
          autoProcessed: true,
          processingMode,
        };
      } catch (e) {
        const message = isAsaasPayoutError(e) ?
          e.message :
          "Não foi possível enviar o PIX automaticamente. Nossa equipe vai revisar.";
        logger.warn(`requestOrganizerWithdrawal auto payout failed ${withdrawalId}`, e);
        const snap = await withdrawalRef.get();
        const payoutStatus = (snap.data()?.payoutStatus as string | undefined) ?? "failed";
        return {
          withdrawalId,
          status: "pending",
          payoutStatus,
          autoProcessed: false,
          processingMode,
          message,
        };
      }
    }

    return {
      withdrawalId,
      status: "pending",
      payoutStatus: "pending",
      autoProcessed: false,
      processingMode,
      message:
        `Saque acima de R$ ${ARENA_WITHDRAWAL_AUTO_MAX_REAIS}. Aguardando aprovação da plataforma.`,
    };
  },
);

async function fetchPendingOrganizerWithdrawalDocs(
  db: ReturnType<typeof getFirestore>,
): Promise<QueryDocumentSnapshot[]> {
  const col = db.collection(ORGANIZER_WITHDRAWALS);
  try {
    const snap = await col
      .where("status", "==", "pending")
      .orderBy("createdAt", "desc")
      .limit(100)
      .get();
    return snap.docs;
  } catch (err) {
    if (!isFirestoreIndexError(err)) throw err;
    const snap = await col.where("status", "==", "pending").limit(100).get();
    return [...snap.docs].sort((a, b) => {
      const ta = (a.data().createdAt as Timestamp | undefined)?.toMillis?.() ?? 0;
      const tb = (b.data().createdAt as Timestamp | undefined)?.toMillis?.() ?? 0;
      return tb - ta;
    });
  }
}

export const listPendingOrganizerWithdrawals = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Faça login para continuar.");
  await assertPlatformAdmin(uid);

  const db = getFirestore();
  const docs = await fetchPendingOrganizerWithdrawalDocs(db);
  const organizerIds = new Set<string>();
  const items = docs.map((docSnap) => {
    const data = docSnap.data();
    const organizerId = (data.organizerId as string | undefined)?.trim() ?? "";
    if (organizerId) organizerIds.add(organizerId);
    const createdAt = data.createdAt as Timestamp | undefined;
    return {
      id: docSnap.id,
      organizerId,
      amountReais: Number(data.amountReais) || 0,
      pixKey: (data.pixKey as string | undefined) ?? "",
      status: (data.status as string | undefined) ?? "pending",
      payoutStatus: (data.payoutStatus as string | undefined) ?? null,
      payoutError: (data.payoutError as string | undefined) ?? null,
      asaasTransferId: (data.asaasTransferId as string | undefined) ?? null,
      createdAt: createdAt?.toDate?.()?.toISOString() ?? null,
    };
  });

  const names: Record<string, string> = {};
  await Promise.all(
    [...organizerIds].map(async (organizerId) => {
      const userSnap = await db.collection("users").doc(organizerId).get();
      names[organizerId] =
        (userSnap.data()?.displayName as string | undefined)?.trim() || organizerId;
    }),
  );

  return {
    items: items.map((row) => ({
      ...row,
      organizerName: names[row.organizerId] ?? row.organizerId,
    })),
  };
});

export const reviewOrganizerWithdrawal = onCall(
  {secrets: [...asaasArenaSecrets]},
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "Faça login para continuar.");
    await assertPlatformAdmin(uid);

    const data = (request.data ?? {}) as {
      withdrawalId?: string;
      decision?: string;
      note?: string;
    };
    const withdrawalId = data.withdrawalId?.trim() ?? "";
    const decision = data.decision?.trim().toLowerCase() ?? "";
    const note = data.note?.trim() ?? "";

    if (!withdrawalId) {
      throw new HttpsError("invalid-argument", "withdrawalId é obrigatório");
    }
    if (
      decision !== "approved" &&
      decision !== "approved_manual" &&
      decision !== "rejected"
    ) {
      throw new HttpsError(
        "invalid-argument",
        "decision deve ser approved, approved_manual ou rejected",
      );
    }

    const db = getFirestore();
    const ref = db.collection(ORGANIZER_WITHDRAWALS).doc(withdrawalId);
    const snap = await ref.get();
    if (!snap.exists) {
      throw new HttpsError("not-found", "Solicitação de saque não encontrada");
    }
    const w = snap.data()!;
    if ((w.status as string | undefined)?.toLowerCase() !== "pending") {
      throw new HttpsError("failed-precondition", "Saque já foi revisado.");
    }

    const organizerId = w.organizerId as string;
    const amountReais = Number(w.amountReais) || 0;

    if (decision === "rejected") {
      await releaseOrganizerWithdrawalReservation(db, organizerId, amountReais, false);
      await ref.update({
        status: "rejected",
        reviewedBy: uid,
        reviewedAt: FieldValue.serverTimestamp(),
        reviewNote: note || null,
      });
      return {withdrawalId, status: "rejected"};
    }

    if (decision === "approved_manual") {
      await releaseOrganizerWithdrawalReservation(db, organizerId, amountReais, true);
      await ref.update({
        status: "approved",
        payoutStatus: "manual",
        payoutError: FieldValue.delete(),
        reviewedBy: uid,
        reviewedAt: FieldValue.serverTimestamp(),
        reviewNote: note || "PIX enviado manualmente fora do sistema",
      });
      return {withdrawalId, status: "approved", payoutStatus: "manual"};
    }

    try {
      const result = await completeOrganizerWithdrawalPayout(db, ref, w, uid, note);
      return {
        withdrawalId,
        status: result.status,
        payoutStatus: result.payoutStatus,
        asaasTransferId: result.payoutId,
      };
    } catch (e) {
      if (isAsaasPayoutError(e)) {
        throw new HttpsError("failed-precondition", e.message);
      }
      const msg = e instanceof Error ? e.message : String(e);
      if (msg === "PIX_KEY_INVALID") {
        throw new HttpsError("invalid-argument", "Chave PIX do saque inválida.");
      }
      if (msg === "WITHDRAWAL_RESERVATION_INVALID") {
        throw new HttpsError(
          "failed-precondition",
          "Reserva de saldo inconsistente. Rejeite o saque e peça nova solicitação.",
        );
      }
      throw new HttpsError("internal", "Falha ao processar o saque.");
    }
  },
);
