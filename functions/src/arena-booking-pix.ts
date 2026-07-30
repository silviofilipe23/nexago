import {onCall, HttpsError} from "firebase-functions/v2/https";
import {onSchedule} from "firebase-functions/v2/scheduler";
import {
  getFirestore,
  FieldValue,
  Timestamp,
  type QueryDocumentSnapshot,
} from "firebase-admin/firestore";
import {getAuth} from "firebase-admin/auth";
import * as logger from "firebase-functions/logger";
import {releaseArenaBookingHold} from "./mercadopago-arena-booking-webhook";
import {
  PLATFORM_FEE_FIXED_BRL,
  roundMoney,
  readArenaPayoutPixKey,
  readArenaPayoutPixKeyType,
} from "./mercadopago-arena-helpers";
import {
  reserveWithdrawalAmount,
  releaseWithdrawalReservation,
} from "./arena-wallet";
import {
  ARENA_BOOKING_PAYMENT_REF_PREFIX,
  ARENA_WITHDRAWAL_AUTO_MAX_REAIS,
} from "./arena-booking-payment-constants";
import {
  completeArenaWithdrawalPayout,
  isAsaasPayoutError,
} from "./arena-withdrawal-payout";
import {resolveWithdrawalPixFields} from "./asaas-payout";
import {resolveArenaWithdrawalFeeReais} from "./arena-entitlement";
import {AsaasApiError, asaasArenaSecrets} from "./asaas-client";
import {
  getOrCreateAsaasCustomer,
  resolveAthleteCpfCnpj,
} from "./asaas-customer";
import {
  createAsaasPixCharge,
  deleteAsaasPaymentIfOpen,
} from "./asaas-booking-payment";
import {callerIsOrganizer, callerIsSuperAdmin} from "./auth-roles";
import {ARENA_BOOKING_PAYMENT_EXPIRY_MINUTES} from "./arena-booking-constants";

const ARENA_BOOKINGS = "arenaBookings";
const ARENA_WITHDRAWALS = "arenaWithdrawals";

const pixPaymentSecrets = [...asaasArenaSecrets, PLATFORM_FEE_FIXED_BRL];

type PixPaymentResponse = {
  paymentId: string;
  qrCode: string;
  qrCodeBase64: string;
  expiresAt: string;
  amountToPayNowReais: number;
};

export const createArenaBookingPixPayment = onCall({
  secrets: pixPaymentSecrets,
}, async (request): Promise<PixPaymentResponse> => {
  const callerUid = request.auth?.uid;
  if (!callerUid) {
    throw new HttpsError("unauthenticated", "Faça login para pagar.");
  }

  const data = (request.data ?? {}) as {
    bookingId?: string;
    cpf?: string;
    cpfCnpj?: string;
    paymentFraction?: number;
  };
  const bookingId = typeof data.bookingId === "string" ? data.bookingId.trim() : "";
  const cpfFromRequest =
    typeof data.cpfCnpj === "string" ? data.cpfCnpj :
      (typeof data.cpf === "string" ? data.cpf : "");
  if (!bookingId) {
    throw new HttpsError("invalid-argument", "bookingId é obrigatório");
  }

  const db = getFirestore();
  const bookingRef = db.collection(ARENA_BOOKINGS).doc(bookingId);
  const bookingSnap = await bookingRef.get();
  if (!bookingSnap.exists) {
    throw new HttpsError("not-found", "Reserva não encontrada");
  }

  const booking = bookingSnap.data()!;
  const athleteId = booking.athleteId as string | undefined;
  if (!athleteId || athleteId !== callerUid) {
    throw new HttpsError("permission-denied", "Você não é o titular desta reserva");
  }

  const status = (booking.status as string | undefined)?.toLowerCase();
  if (status !== "pending_payment") {
    throw new HttpsError(
      "failed-precondition",
      "Esta reserva não está aguardando pagamento PIX.",
    );
  }

  const paymentStatus = (booking.paymentStatus as string | undefined)?.toLowerCase();
  if (paymentStatus === "paid" || paymentStatus === "partial") {
    throw new HttpsError("failed-precondition", "Pagamento já registrado para esta reserva");
  }

  let amountToPayNow = Number(booking.amountToPayNowReais);
  const amountReais = Number(booking.amountReais);
  const requestedFraction = normalizePixPaymentFraction(data.paymentFraction);
  if (requestedFraction != null) {
    if (!Number.isFinite(amountReais) || amountReais <= 0) {
      throw new HttpsError("failed-precondition", "Valor da reserva inválido");
    }
    amountToPayNow = roundMoney(amountReais * requestedFraction);
    const amountDueOnsiteReais = roundMoney(amountReais - amountToPayNow);
    await bookingRef.update({
      paymentFraction: requestedFraction,
      amountToPayNowReais: amountToPayNow,
      amountDueOnsiteReais,
    });
  }

  if (!Number.isFinite(amountToPayNow) || amountToPayNow <= 0) {
    throw new HttpsError("failed-precondition", "Valor PIX inválido na reserva");
  }

  const arenaId = booking.arenaId as string | undefined;
  if (!arenaId) {
    throw new HttpsError("failed-precondition", "Reserva sem arena");
  }

  const arenaSnap = await db.collection("arenas").doc(arenaId).get();
  if (!arenaSnap.exists) {
    throw new HttpsError("not-found", "Arena não encontrada");
  }
  const arena = arenaSnap.data()!;

  let payerEmail = "pagamento@nexago.app";
  let payerName: string | undefined;
  try {
    const user = await getAuth().getUser(callerUid);
    if (user.email?.trim()) payerEmail = user.email!.trim();
    payerName = user.displayName?.trim() || undefined;
  } catch {
    // fallback
  }

  const existingAsaasId = (booking.asaasPaymentId as string | undefined)?.trim();
  if (existingAsaasId) {
    await deleteAsaasPaymentIfOpen(existingAsaasId);
  }

  let cpfCnpj: string;
  try {
    cpfCnpj = await resolveAthleteCpfCnpj(callerUid, cpfFromRequest);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === "ASAAS_CUSTOMER_CPF_REQUIRED") {
      throw new HttpsError(
        "failed-precondition",
        "Informe seu CPF para pagar com PIX.",
      );
    }
    throw e;
  }

  let customerId: string;
  try {
    customerId = await getOrCreateAsaasCustomer(
      callerUid,
      payerEmail,
      payerName,
      cpfCnpj,
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === "ASAAS_API_KEY_MISSING") {
      throw new HttpsError(
        "failed-precondition",
        "Pagamento online temporariamente indisponível. Tente pagar na arena.",
      );
    }
    if (msg === "ASAAS_CUSTOMER_CPF_REQUIRED") {
      throw new HttpsError(
        "failed-precondition",
        "Informe seu CPF para pagar com PIX.",
      );
    }
    logger.error("createArenaBookingPixPayment customer failed", e);
    throw new HttpsError("internal", "Não foi possível preparar o pagamento.");
  }

  const arenaName = (booking.arenaName as string) || (arena.name as string) || "Arena";
  const courtName = (booking.courtName as string) || "Quadra";
  const dateStr = (booking.date as string) || "";
  const startTime = (booking.startTime as string) || "";
  const endTime = (booking.endTime as string) || "";
  const timeStr = startTime && endTime ? `${startTime}-${endTime}` : startTime;
  const scheduleStr = [dateStr, timeStr].filter(Boolean).join(" ");
  const description = `Reserva ${arenaName} — ${courtName} - ${scheduleStr ? ` (${scheduleStr})` : ""}`;

  const expiresAtDate = booking.paymentExpiresAt instanceof Timestamp
    ? booking.paymentExpiresAt.toDate()
    : new Date(Date.now() + ARENA_BOOKING_PAYMENT_EXPIRY_MINUTES * 60 * 1000);

  let charge;
  try {
    charge = await createAsaasPixCharge({
      customerId,
      valueReais: roundMoney(amountToPayNow),
      dueDate: expiresAtDate,
      description,
      externalReference: `${ARENA_BOOKING_PAYMENT_REF_PREFIX}${bookingId}`,
      idempotencyKey: `arena-booking-pix-${bookingId}`,
    });
  } catch (e) {
    if (e instanceof AsaasApiError) {
      logger.error("createArenaBookingPixPayment Asaas failed:", e.httpStatus, e.body);
      const hint = e.message.toLowerCase();
      if (hint.includes("cpf") || hint.includes("cnpj")) {
        throw new HttpsError("failed-precondition", e.message);
      }
      throw new HttpsError("internal", "Não foi possível gerar o PIX. Tente novamente.");
    }
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === "ASAAS_API_KEY_MISSING") {
      throw new HttpsError(
        "failed-precondition",
        "Pagamento online temporariamente indisponível.",
      );
    }
    if (msg === "ASAAS_PIX_QR_MISSING") {
      throw new HttpsError(
        "failed-precondition",
        "PIX criado no Asaas, mas o QR Code ainda não está disponível. " +
        "Confirme que a conta tem chave PIX cadastrada e tente novamente em alguns segundos.",
      );
    }
    logger.error("createArenaBookingPixPayment charge failed", e);
    throw new HttpsError("internal", "Não foi possível gerar o PIX. Tente novamente.");
  }

  await bookingRef.update({
    asaasPaymentId: charge.paymentId,
    paymentProvider: "asaas",
    paymentStatus: "pending",
    paymentReceiver: FieldValue.delete(),
    pixCopyPaste: charge.qrCode,
    updatedAt: FieldValue.serverTimestamp(),
  });

  return {
    paymentId: charge.paymentId,
    qrCode: charge.qrCode,
    qrCodeBase64: charge.qrCodeBase64,
    expiresAt: expiresAtDate.toISOString(),
    amountToPayNowReais: amountToPayNow,
  };
});

/** Cancela reserva PIX pendente (atleta) e libera horário + locks. */
export const cancelPendingArenaBookingPayment = onCall({
  secrets: pixPaymentSecrets,
}, async (request) => {
  const callerUid = request.auth?.uid;
  if (!callerUid) {
    throw new HttpsError("unauthenticated", "Faça login para continuar.");
  }

  const data = (request.data ?? {}) as {bookingId?: string};
  const bookingId = typeof data.bookingId === "string" ? data.bookingId.trim() : "";
  if (!bookingId) {
    throw new HttpsError("invalid-argument", "bookingId é obrigatório");
  }

  const db = getFirestore();
  const bookingRef = db.collection(ARENA_BOOKINGS).doc(bookingId);
  const bookingSnap = await bookingRef.get();
  if (!bookingSnap.exists) {
    throw new HttpsError("not-found", "Reserva não encontrada");
  }

  const booking = bookingSnap.data()!;
  const athleteId = booking.athleteId as string | undefined;
  if (!athleteId || athleteId !== callerUid) {
    throw new HttpsError("permission-denied", "Você não é o titular desta reserva");
  }

  const status = (booking.status as string | undefined)?.toLowerCase();
  if (status !== "pending_payment") {
    throw new HttpsError(
      "failed-precondition",
      "Esta reserva não está aguardando pagamento.",
    );
  }

  const paymentStatus = (booking.paymentStatus as string | undefined)?.toLowerCase();
  if (paymentStatus === "paid" || paymentStatus === "partial") {
    throw new HttpsError("failed-precondition", "Pagamento já registrado.");
  }

  const asaasId = (booking.asaasPaymentId as string | undefined)?.trim();
  if (asaasId) {
    await deleteAsaasPaymentIfOpen(asaasId);
  }

  await releaseArenaBookingHold(
    db,
    bookingRef,
    booking,
    bookingId,
    "user_cancel",
    "cancelled",
  );

  return {bookingId, status: "cancelled"};
});

/** Expira reservas PIX não pagas e libera locks + documentos em arenaSlots. */
export const expirePendingArenaBookingPayments = onSchedule(
  {
    schedule: "every 1 minutes",
    secrets: pixPaymentSecrets,
  },
  async () => {
    const db = getFirestore();
    const now = Timestamp.now();
    const snap = await db
      .collection(ARENA_BOOKINGS)
      .where("status", "==", "pending_payment")
      .where("paymentExpiresAt", "<", now)
      .limit(50)
      .get();

    for (const doc of snap.docs) {
      const booking = doc.data();
      const bookingId = doc.id;
      try {
        const asaasId = (booking.asaasPaymentId as string | undefined)?.trim();
        if (asaasId) {
          await deleteAsaasPaymentIfOpen(asaasId);
        }
        await releaseArenaBookingHold(
          db,
          doc.ref,
          booking,
          bookingId,
          "expiry",
          "expired",
        );
        logger.info(`expirePendingArenaBookingPayments: cancelled ${bookingId}`);
      } catch (e) {
        logger.error(`expirePendingArenaBookingPayments failed ${bookingId}`, e);
      }
    }
  },
);

/** Impede segunda reserva enquanto houver saque pendente na arena. */
async function assertNoPendingArenaWithdrawal(
  db: ReturnType<typeof getFirestore>,
  arenaId: string,
): Promise<void> {
  const col = db.collection(ARENA_WITHDRAWALS);
  try {
    const snap = await col
      .where("arenaId", "==", arenaId)
      .where("status", "==", "pending")
      .limit(1)
      .get();
    if (!snap.empty) {
      throw new HttpsError(
        "failed-precondition",
        "Já existe um saque pendente para esta arena. Aguarde a conclusão ou contate o suporte.",
      );
    }
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    if (!isFirestoreIndexError(err)) throw err;
    const snap = await col.where("arenaId", "==", arenaId).limit(20).get();
    const hasPending = snap.docs.some(
      (d) => (d.data().status as string | undefined)?.toLowerCase() === "pending",
    );
    if (hasPending) {
      throw new HttpsError(
        "failed-precondition",
        "Já existe um saque pendente para esta arena. Aguarde a conclusão ou contate o suporte.",
      );
    }
  }
}

const requestWithdrawalSecrets = [...asaasArenaSecrets];

export const requestArenaWithdrawal = onCall({
  secrets: requestWithdrawalSecrets,
}, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", "Faça login para continuar.");
  }

  const data = (request.data ?? {}) as {
    arenaId?: string;
    amountReais?: number;
    pixKey?: string;
    pixKeyType?: string;
  };
  const arenaId = data.arenaId?.trim() ?? "";
  const amountReais = typeof data.amountReais === "number" ? data.amountReais : 0;
  let pixKey = data.pixKey?.trim() ?? "";
  let pixKeyType = data.pixKeyType?.trim().toUpperCase() ?? "";

  if (!arenaId) {
    throw new HttpsError("invalid-argument", "arenaId é obrigatório");
  }
  if (!Number.isFinite(amountReais) || amountReais <= 0) {
    throw new HttpsError("invalid-argument", "Informe um valor válido para saque.");
  }

  const db = getFirestore();
  const arenaSnap = await db.collection("arenas").doc(arenaId).get();
  if (!arenaSnap.exists) {
    throw new HttpsError("not-found", "Arena não encontrada");
  }
  const arena = arenaSnap.data()!;
  const managerId = arena.managerUserId as string | undefined;
  if (managerId !== uid) {
    throw new HttpsError("permission-denied", "Apenas o gestor pode solicitar saque.");
  }

  if (pixKey.length < 5) {
    pixKey = readArenaPayoutPixKey(arena);
    if (!pixKeyType) {
      pixKeyType = readArenaPayoutPixKeyType(arena);
    }
  }
  if (pixKey.length < 5) {
    throw new HttpsError(
      "invalid-argument",
      "Cadastre uma chave PIX no perfil da arena ou informe uma chave válida.",
    );
  }
  if (!pixKeyType) {
    pixKeyType = readArenaPayoutPixKeyType(arena);
  }

  const {pixAddressKey, pixAddressKeyType} = resolveWithdrawalPixFields(
    pixKey,
    pixKeyType || undefined,
  );
  if (pixAddressKey.length < 5) {
    throw new HttpsError("invalid-argument", "Chave PIX inválida.");
  }

  await assertNoPendingArenaWithdrawal(db, arenaId);

  const amount = roundMoney(amountReais);
  const feeReais = resolveArenaWithdrawalFeeReais(arena, Date.now());
  const netReais = roundMoney(amount - feeReais);
  if (netReais <= 0) {
    throw new HttpsError(
      "invalid-argument",
      `O valor do saque precisa ser maior que a tarifa de R$ ${feeReais.toFixed(2)}.`,
    );
  }
  try {
    await reserveWithdrawalAmount(db, arenaId, amount);
  } catch (e) {
    if (e instanceof Error && e.message === "INSUFFICIENT_BALANCE") {
      throw new HttpsError("failed-precondition", "Saldo insuficiente para este saque.");
    }
    throw e;
  }

  const autoEligible = amount <= ARENA_WITHDRAWAL_AUTO_MAX_REAIS + 0.001;
  const processingMode = autoEligible ? "auto" : "manual_review";

  const withdrawalRef = db.collection(ARENA_WITHDRAWALS).doc();
  await withdrawalRef.set({
    arenaId,
    managerUserId: uid,
    amountReais: amount,
    feeReais,
    netReais,
    pixKey: pixAddressKey,
    pixKeyType: pixAddressKeyType,
    processingMode,
    status: "pending",
    payoutStatus: "pending",
    payoutProvider: "asaas",
    createdAt: FieldValue.serverTimestamp(),
  });

  const withdrawalId = withdrawalRef.id;
  const withdrawalData = {
    arenaId,
    amountReais: amount,
    feeReais,
    netReais,
    pixKey: pixAddressKey,
    pixKeyType: pixAddressKeyType,
    payoutStatus: "pending",
  };

  if (autoEligible) {
    try {
      const result = await completeArenaWithdrawalPayout(
        db,
        withdrawalRef,
        withdrawalData,
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
      const message = isAsaasPayoutError(e)
        ? e.message
        : "Não foi possível enviar o PIX automaticamente. Nossa equipe vai revisar.";
      logger.warn(`requestArenaWithdrawal auto payout failed ${withdrawalId}`, e);
      const snap = await withdrawalRef.get();
      const payoutStatus =
        (snap.data()?.payoutStatus as string | undefined) ?? "failed";
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
});

async function assertArenaWithdrawalAdmin(uid: string): Promise<void> {
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
  const details = String((err as {details?: string}).details ?? "");
  const message = err instanceof Error ? err.message : "";
  return (
    code === 9 ||
    details.includes("index") ||
    message.includes("FAILED_PRECONDITION") ||
    message.includes("requires an index")
  );
}

/** Busca saques pendentes; fallback sem orderBy enquanto o índice composto termina de criar. */
async function fetchPendingWithdrawalDocs(
  db: ReturnType<typeof getFirestore>,
): Promise<QueryDocumentSnapshot[]> {
  const col = db.collection(ARENA_WITHDRAWALS);
  try {
    const snap = await col
      .where("status", "==", "pending")
      .orderBy("createdAt", "desc")
      .limit(100)
      .get();
    return snap.docs;
  } catch (err) {
    if (!isFirestoreIndexError(err)) throw err;
    logger.warn(
      "fetchPendingWithdrawalDocs: índice em construção, usando fallback sem orderBy",
    );
    const snap = await col.where("status", "==", "pending").limit(100).get();
    return [...snap.docs].sort((a, b) => {
      const ta = (a.data().createdAt as Timestamp | undefined)?.toMillis?.() ?? 0;
      const tb = (b.data().createdAt as Timestamp | undefined)?.toMillis?.() ?? 0;
      return tb - ta;
    });
  }
}

/** Lista saques pendentes (admin) — evita falha de query/regras no cliente. */
export const listPendingArenaWithdrawals = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", "Faça login para continuar.");
  }
  await assertArenaWithdrawalAdmin(uid);

  try {
  const db = getFirestore();
  const docs = await fetchPendingWithdrawalDocs(db);

  const arenaIds = new Set<string>();
  const items = docs.map((docSnap) => {
    const data = docSnap.data();
    const arenaId = (data.arenaId as string | undefined)?.trim() ?? "";
    if (arenaId) arenaIds.add(arenaId);
    const createdAt = data.createdAt as Timestamp | undefined;
    return {
      id: docSnap.id,
      arenaId,
      managerUserId: (data.managerUserId as string | undefined) ?? "",
      amountReais: Number(data.amountReais) || 0,
      pixKey: (data.pixKey as string | undefined) ?? "",
      status: (data.status as string | undefined) ?? "pending",
      payoutStatus: (data.payoutStatus as string | undefined) ?? null,
      payoutError: (data.payoutError as string | undefined) ?? null,
      asaasTransferId: (data.asaasTransferId as string | undefined) ?? null,
      mercadopagoPayoutId: (data.mercadopagoPayoutId as string | undefined) ?? null,
      createdAt: createdAt?.toDate?.()?.toISOString() ?? null,
    };
  });

  const arenaNames: Record<string, string> = {};
  await Promise.all(
    [...arenaIds].map(async (arenaId) => {
      const arenaSnap = await db.collection("arenas").doc(arenaId).get();
      arenaNames[arenaId] =
        (arenaSnap.data()?.name as string | undefined)?.trim() || arenaId;
    }),
  );

  return {
    items: items.map((row) => ({
      ...row,
      arenaName: arenaNames[row.arenaId] ?? row.arenaId,
    })),
  };
  } catch (err) {
    logger.error("listPendingArenaWithdrawals failed", err);
    if (err instanceof HttpsError) throw err;
    if (isFirestoreIndexError(err)) {
      throw new HttpsError(
        "failed-precondition",
        "Índice do Firestore em construção. Aguarde alguns minutos e clique em Atualizar.",
      );
    }
    throw new HttpsError("internal", "Falha ao listar saques pendentes.");
  }
});

const reviewWithdrawalSecrets = [...asaasArenaSecrets];

export const reviewArenaWithdrawal = onCall({
  secrets: reviewWithdrawalSecrets,
}, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", "Faça login para continuar.");
  }

  await assertArenaWithdrawalAdmin(uid);

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
  const ref = db.collection(ARENA_WITHDRAWALS).doc(withdrawalId);
  const snap = await ref.get();
  if (!snap.exists) {
    throw new HttpsError("not-found", "Solicitação de saque não encontrada");
  }

  const w = snap.data()!;
  const status = (w.status as string | undefined)?.toLowerCase();
  if (status !== "pending") {
    throw new HttpsError("failed-precondition", "Saque já foi revisado.");
  }

  const arenaId = w.arenaId as string;
  const amountReais = Number(w.amountReais) || 0;

  if (decision === "rejected") {
    await releaseWithdrawalReservation(db, arenaId, amountReais, false);
    await ref.update({
      status: "rejected",
      reviewedBy: uid,
      reviewedAt: FieldValue.serverTimestamp(),
      reviewNote: note || null,
    });
    return {withdrawalId, status: "rejected"};
  }

  if (decision === "approved_manual") {
    await releaseWithdrawalReservation(db, arenaId, amountReais, true);
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
    const result = await completeArenaWithdrawalPayout(db, ref, w, uid, note);
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
      throw new HttpsError(
        "invalid-argument",
        "Chave PIX do saque inválida. Peça ao gestor atualizar no perfil da arena.",
      );
    }
    if (msg === "WITHDRAWAL_RESERVATION_INVALID") {
      throw new HttpsError(
        "failed-precondition",
        "Reserva de saldo inconsistente. Rejeite o saque e peça nova solicitação.",
      );
    }
    if (msg === "ASAAS_API_KEY_MISSING") {
      throw new HttpsError(
        "failed-precondition",
        "Integração Asaas não configurada no servidor.",
      );
    }
    throw new HttpsError("internal", "Falha ao processar repasse PIX.");
  }
});

/** 0.5 (sinal) ou 1 (integral) — alinhado a createArenaBooking. */
function normalizePixPaymentFraction(raw: unknown): number | null {
  const n = Number(raw);
  if (n === 0.5 || n === 1) return n;
  return null;
}
