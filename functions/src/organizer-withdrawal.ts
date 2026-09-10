/**
 * Saque do organizador — espelha os callables de saque de arena
 * (`arena-booking-pix.ts`). Carteira: `organizerWallets/{uid}` (id = uid do
 * organizador; a chave PIX de repasse fica no próprio doc da carteira).
 * Aprovação: auto até R$500, manual acima (revisão no backoffice).
 *
 * Desde 09/09/2026 o saque também pode ser pedido por um GESTOR da equipe de
 * um torneio do organizador (`organizerId` no payload). Nesse caminho a chave
 * PIX é sempre a que o dono cadastrou — o payload do gestor é ignorado — e o
 * dono é notificado. Ver `organizer-wallet-access.ts`.
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
import {
  assertCanAccessOrganizerWallet,
  listAccessibleOrganizerIds,
  maskDelegatePayoutPixKey,
  resolveWithdrawalPixSource,
} from "./organizer-wallet-access";
import {deliverNotificationToUser} from "./notification-delivery";
import {ARENA_WITHDRAWAL_AUTO_MAX_REAIS} from "./arena-booking-payment-constants";
import {CLIENT_FACING_REGIONS} from "./function-regions";

const ORGANIZER_WITHDRAWALS = "organizerWithdrawals";

async function assertPlatformAdmin(uid: string): Promise<void> {
  let caller;
  try {
    caller = await getAuth().getUser(uid);
  } catch (err: unknown) {
    const code = (err as {code?: string})?.code;
    if (code === "auth/user-not-found") {
      // Token ainda válido (JWT não expirou) mas a conta foi apagada depois
      // que o cliente o obteve — sessão órfã, não um erro interno real.
      throw new HttpsError(
        "unauthenticated",
        "Sua sessão expirou. Entre novamente para continuar."
      );
    }
    throw err;
  }
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

/** Cadastra/atualiza a chave PIX de repasse do organizador (no doc da carteira).
 *  Continua escrevendo SÓ na carteira de quem chama, de propósito: gestor da
 *  equipe saca, mas não escolhe destino do dinheiro. */
export const setOrganizerPayoutPixKey = onCall({
  region: CLIENT_FACING_REGIONS,
}, async (request) => {
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
  {region: CLIENT_FACING_REGIONS, secrets: [...asaasArenaSecrets]},
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "Faça login para continuar.");

    const data = (request.data ?? {}) as {
      amountReais?: number;
      pixKey?: string;
      pixKeyType?: string;
      organizerId?: string;
    };
    const amountReais = typeof data.amountReais === "number" ? data.amountReais : 0;
    if (!Number.isFinite(amountReais) || amountReais <= 0) {
      throw new HttpsError("invalid-argument", "Informe um valor válido para saque.");
    }

    const db = getFirestore();
    // Carteira alvo: a própria por omissão (contrato antigo intacto) ou a de um
    // organizador de quem o chamador é gestor de equipe.
    const organizerId = data.organizerId?.trim() || uid;
    const delegated = organizerId !== uid;
    if (delegated) {
      await assertCanAccessOrganizerWallet(db, uid, organizerId);
    }

    const walletSnap = await organizerWalletRef(db, organizerId).get();
    const wallet = walletSnap.data() ?? {};
    const walletPixKey = (wallet.payoutPixKey as string | undefined)?.trim() ?? "";
    const walletPixKeyType =
      (wallet.payoutPixKeyType as string | undefined)?.trim() ?? "";

    const {pixKey, pixKeyType} = resolveWithdrawalPixSource({
      delegated,
      walletPixKey,
      walletPixKeyType,
      payloadPixKey: data.pixKey,
      payloadPixKeyType: data.pixKeyType,
    });

    const {pixAddressKey, pixAddressKeyType} = resolveWithdrawalPixFields(
      pixKey,
      pixKeyType || undefined,
    );
    if (pixAddressKey.length < 5) {
      throw new HttpsError("invalid-argument", "Chave PIX inválida.");
    }

    await assertNoPendingOrganizerWithdrawal(db, organizerId);

    const amount = roundMoney(amountReais);
    try {
      await reserveOrganizerWithdrawalAmount(db, organizerId, amount);
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
      organizerId,
      amountReais: amount,
      pixKey: pixAddressKey,
      pixKeyType: pixAddressKeyType,
      processingMode,
      status: "pending",
      payoutStatus: "pending",
      payoutProvider: "asaas",
      // Rastro de quem pediu: no saque do próprio dono é ele mesmo; delegado
      // guarda o gestor, e é isso que o dono vê na notificação.
      requestedBy: uid,
      requestedByStaff: delegated,
      createdAt: FieldValue.serverTimestamp(),
    });

    const withdrawalId = withdrawalRef.id;
    if (delegated) {
      await notifyOwnerOfDelegatedWithdrawal(db, {
        organizerId,
        requestedBy: uid,
        amountReais: amount,
        pixKey: pixAddressKey,
      });
    }

    if (autoEligible) {
      try {
        const result = await completeOrganizerWithdrawalPayout(
          db,
          withdrawalRef,
          {organizerId, amountReais: amount, pixKey: pixAddressKey, pixKeyType: pixAddressKeyType},
          uid,
          delegated ?
            "PIX automático na solicitação (gestor da equipe)" :
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

/** O dono sempre fica sabendo que alguém da equipe mexeu no dinheiro dele.
 *  Falha de notificação nunca derruba o saque já registrado. */
async function notifyOwnerOfDelegatedWithdrawal(
  db: ReturnType<typeof getFirestore>,
  params: {
    organizerId: string;
    requestedBy: string;
    amountReais: number;
    pixKey: string;
  },
): Promise<void> {
  try {
    const requesterSnap = await db.doc(`users/${params.requestedBy}`).get();
    const requesterName =
      (requesterSnap.data()?.displayName as string | undefined)?.trim() ||
      "Um gestor da sua equipe";
    await deliverNotificationToUser({
      userId: params.organizerId,
      title: "Saque solicitado pela sua equipe",
      body:
        `${requesterName} solicitou um saque de ` +
        `R$ ${params.amountReais.toFixed(2).replace(".", ",")} para a sua chave PIX ` +
        `${maskDelegatePayoutPixKey(params.pixKey)}.`,
      type: "organizer_withdrawal_requested",
      data: {url: "/painel/financeiro"},
    });
  } catch (err) {
    logger.warn("notifyOwnerOfDelegatedWithdrawal falhou", err);
  }
}

/**
 * Tudo que a tela Financeiro precisa numa chamada só: as carteiras que o
 * chamador alcança (a própria + a dos donos dos torneios em que ele é gestor)
 * e o extrato/saques da carteira escolhida.
 *
 * Existe como callable porque a relação gestor → dono não cabe nas rules
 * (`organizerWallets` só libera leitura para o próprio dono, e continua assim).
 */
export const loadOrganizerWalletView = onCall({
  region: CLIENT_FACING_REGIONS,
}, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Faça login para continuar.");

  const db = getFirestore();
  const organizerIds = await listAccessibleOrganizerIds(db, uid);

  const payload = (request.data ?? {}) as {
    organizerId?: string;
    ledgerLimit?: number;
  };
  const requested = payload.organizerId?.trim() ?? "";
  // A tela soma as taxas da plataforma pelo extrato, então precisa de mais que
  // a primeira página; o teto evita que um cliente peça a coleção inteira.
  const ledgerLimit = Math.min(
    500,
    Math.max(1, Math.trunc(Number(payload.ledgerLimit) || 30)),
  );
  // Pedido fora da lista cai na própria carteira em vez de estourar: a lista
  // muda quando alguém sai da equipe, e o cliente pode ter guardado a antiga.
  const selectedId = organizerIds.includes(requested) ? requested : uid;
  const isOwn = selectedId === uid;

  const userSnaps = organizerIds.length > 0 ?
    await db.getAll(...organizerIds.map((id) => db.doc(`users/${id}`))) :
    [];
  const wallets = organizerIds.map((organizerId, i) => ({
    organizerId,
    organizerName:
      (userSnaps[i]?.data()?.displayName as string | undefined)?.trim() ||
      (organizerId === uid ? "Minha carteira" : "Organizador"),
    isOwn: organizerId === uid,
  }));

  const walletSnap = await organizerWalletRef(db, selectedId).get();
  const w = walletSnap.data() ?? {};
  const payoutPixKey = (w.payoutPixKey as string | undefined)?.trim() ?? "";

  const ledgerSnap = await organizerWalletRef(db, selectedId)
    .collection("ledger")
    .orderBy("createdAt", "desc")
    .limit(ledgerLimit)
    .get()
    .catch(() => null);

  const withdrawalsSnap = await db
    .collection(ORGANIZER_WITHDRAWALS)
    .where("organizerId", "==", selectedId)
    .orderBy("createdAt", "desc")
    .limit(20)
    .get()
    .catch(async (err) => {
      if (!isFirestoreIndexError(err)) return null;
      return db
        .collection(ORGANIZER_WITHDRAWALS)
        .where("organizerId", "==", selectedId)
        .limit(20)
        .get();
    });

  return {
    wallets,
    selected: {
      organizerId: selectedId,
      organizerName:
        wallets.find((x) => x.organizerId === selectedId)?.organizerName ?? "",
      isOwn,
      availableReais: Number(w.availableReais) || 0,
      pendingReais: Number(w.pendingReais) || 0,
      // A chave inteira é do dono; o gestor vê só as pontas, o bastante para
      // conferir o destino sem levar o CPF/telefone dele embora.
      payoutPixKey: isOwn ? payoutPixKey : maskDelegatePayoutPixKey(payoutPixKey),
      payoutPixKeyType: isOwn ?
        ((w.payoutPixKeyType as string | undefined)?.trim() ?? "") :
        "",
      hasPayoutPixKey: payoutPixKey.length >= 5,
      canEditPixKey: isOwn,
    },
    ledger: (ledgerSnap?.docs ?? []).map((d) => {
      const e = d.data();
      return {
        id: d.id,
        netReais: Number(e.netReais) || 0,
        grossReais: Number(e.grossReais) || 0,
        platformFeeReais: Number(e.platformFeeReais) || 0,
        createdAt: (e.createdAt as Timestamp | undefined)?.toDate?.()?.toISOString() ?? null,
      };
    }),
    withdrawals: (withdrawalsSnap?.docs ?? []).map((d) => {
      const x = d.data();
      return {
        id: d.id,
        amountReais: Number(x.amountReais) || 0,
        status: (x.status as string | undefined) ?? "pending",
        // Mesma regra do card da chave: na carteira alheia a coluna "Chave PIX"
        // do histórico não pode entregar o CPF do dono por inteiro.
        pixKey: isOwn ?
          ((x.pixKey as string | undefined) ?? "") :
          maskDelegatePayoutPixKey((x.pixKey as string | undefined) ?? ""),
        payoutStatus: (x.payoutStatus as string | undefined) ?? null,
        requestedByStaff: x.requestedByStaff === true,
        createdAt: (x.createdAt as Timestamp | undefined)?.toDate?.()?.toISOString() ?? null,
      };
    }),
  };
});

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

export const listPendingOrganizerWithdrawals = onCall({
  region: CLIENT_FACING_REGIONS,
}, async (request) => {
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
  {region: CLIENT_FACING_REGIONS, secrets: [...asaasArenaSecrets]},
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
