/**
 * Split de pagamento em reserva de quadra: quem reserva convida N pessoas,
 * cada uma recebe uma cobrança PIX da sua fatia (`arenaBookings/{bookingId}/paymentShares/{shareId}`).
 * Se alguém não pagar até `expiresAt` (2h antes do horário, mesmo prazo de
 * `booking.confirmationDeadline`), a fatia vira `covered_by_organizer` e o
 * valor é somado a `amountDueOnsiteReais` — a reserva nunca é cancelada por
 * causa de uma fatia não paga, só o valor devido no local aumenta.
 */

import {onCall, HttpsError} from "firebase-functions/v2/https";
import {onSchedule} from "firebase-functions/v2/scheduler";
import {
  getFirestore,
  FieldValue,
  Timestamp,
  type Firestore,
  type DocumentReference,
} from "firebase-admin/firestore";
import {getAuth} from "firebase-admin/auth";
import * as logger from "firebase-functions/logger";
import {roundMoney, PLATFORM_FEE_FIXED_BRL} from "./mercadopago-arena-helpers";
import {ARENA_BOOKING_SHARE_PAYMENT_REF_PREFIX} from "./arena-booking-payment-constants";
import {asaasArenaSecrets, AsaasApiError} from "./asaas-client";
import {getOrCreateAsaasCustomer, resolveAthleteCpfCnpj} from "./asaas-customer";
import {
  createAsaasPixCharge,
  deleteAsaasPaymentIfOpen,
  deleteAsaasPaymentOrThrow,
  getAsaasPayment,
} from "./asaas-booking-payment";
import {deliverNotificationToUser} from "./notification-delivery";
import {CLIENT_FACING_REGIONS} from "./function-regions";

const ARENA_BOOKINGS = "arenaBookings";
const PAYMENT_SHARES = "paymentShares";
const MAX_SHARES = 20;
const AMOUNT_TOLERANCE_REAIS = 0.02;
/** Piso de segurança para não gerar cobrança de expiração já vencida. */
const MIN_MINUTES_UNTIL_DEADLINE = 5;

export type ArenaBookingPaymentShareStatus =
  | "pending"
  | "paid"
  | "expired"
  | "covered_by_organizer";

export type SplitShareInput = {athleteId: string; amountReais: number};

export type SplitNotification = {
  userId: string;
  title: string;
  body: string;
  type: string;
  data: Record<string, string>;
};

/** `arenaBookingShare:{bookingId}:{shareId}`. */
export function buildArenaBookingShareExternalReference(
  bookingId: string,
  shareId: string,
): string {
  return `${ARENA_BOOKING_SHARE_PAYMENT_REF_PREFIX}${bookingId}:${shareId}`;
}

export function parseArenaBookingShareExternalReference(
  externalRef: string,
): {bookingId: string; shareId: string} | null {
  const trimmed = externalRef.trim();
  if (!trimmed.startsWith(ARENA_BOOKING_SHARE_PAYMENT_REF_PREFIX)) return null;
  const rest = trimmed.slice(ARENA_BOOKING_SHARE_PAYMENT_REF_PREFIX.length);
  const colon = rest.indexOf(":");
  if (colon <= 0) return null;
  const bookingId = rest.slice(0, colon).trim();
  const shareId = rest.slice(colon + 1).trim();
  if (!bookingId || !shareId) return null;
  return {bookingId, shareId};
}

/** Ids das cobranças da reserva inteira já substituídas pela divisão (só strings). */
export function supersededPaymentIdsOf(booking: Record<string, unknown>): string[] {
  return Array.isArray(booking.supersededAsaasPaymentIds) ?
    (booking.supersededAsaasPaymentIds as unknown[])
      .filter((v): v is string => typeof v === "string") :
    [];
}

/** Só o dono da reserva pode dividir, e só enquanto o PIX da reserva estiver pendente. */
export function assertBookingOwnerForSplit(
  callerUid: string,
  booking: Record<string, unknown> | undefined,
): void {
  if (!booking) {
    throw new HttpsError("not-found", "Reserva não encontrada.");
  }
  const athleteId = booking.athleteId as string | undefined;
  if (!athleteId || athleteId !== callerUid) {
    throw new HttpsError(
      "permission-denied",
      "Só quem fez a reserva pode dividir o pagamento.",
    );
  }
  const channel = (booking.paymentChannel as string | undefined)?.toLowerCase();
  if (channel !== "pix") {
    throw new HttpsError(
      "failed-precondition",
      "Só é possível dividir o pagamento de reservas PIX.",
    );
  }
  const status = (booking.status as string | undefined)?.toLowerCase();
  if (status !== "pending_payment") {
    throw new HttpsError(
      "failed-precondition",
      "Esta reserva não está mais aguardando pagamento.",
    );
  }
}

/** Valida a lista de fatias: atletas únicos, valores positivos, soma bate com o esperado. */
export function validateSplitShares(
  shares: unknown,
  expectedTotalReais: number,
): SplitShareInput[] {
  if (!Array.isArray(shares) || shares.length === 0) {
    throw new HttpsError("invalid-argument", "Informe ao menos uma fatia para dividir.");
  }
  if (shares.length > MAX_SHARES) {
    throw new HttpsError("invalid-argument", `No máximo ${MAX_SHARES} fatias por reserva.`);
  }

  const parsed: SplitShareInput[] = [];
  const seen = new Set<string>();
  for (const raw of shares) {
    if (!raw || typeof raw !== "object") {
      throw new HttpsError("invalid-argument", "Fatia inválida.");
    }
    const row = raw as Record<string, unknown>;
    const athleteId = typeof row.athleteId === "string" ? row.athleteId.trim() : "";
    const amountReais = Number(row.amountReais);
    if (!athleteId) {
      throw new HttpsError("invalid-argument", "athleteId é obrigatório em cada fatia.");
    }
    if (seen.has(athleteId)) {
      throw new HttpsError("invalid-argument", "Cada atleta só pode receber uma fatia.");
    }
    seen.add(athleteId);
    if (!Number.isFinite(amountReais) || amountReais <= 0) {
      throw new HttpsError("invalid-argument", "Valor da fatia inválido.");
    }
    parsed.push({athleteId, amountReais: roundMoney(amountReais)});
  }

  const sum = roundMoney(parsed.reduce((acc, s) => acc + s.amountReais, 0));
  const expected = roundMoney(expectedTotalReais);
  if (Math.abs(sum - expected) > AMOUNT_TOLERANCE_REAIS) {
    throw new HttpsError(
      "failed-precondition",
      `A soma das fatias (R$ ${sum.toFixed(2)}) precisa ser igual ao valor a pagar agora ` +
      `(R$ ${expected.toFixed(2)}).`,
    );
  }

  return parsed;
}

export type CreateShareChargeFn = (params: {
  athleteId: string;
  amountReais: number;
  bookingId: string;
  shareId: string;
  description: string;
  dueDate: Date;
}) => Promise<{paymentId: string; qrCode: string; qrCodeBase64: string}>;

export type SplitArenaBookingPaymentResult = {
  bookingId: string;
  shareIds: string[];
  notifications: SplitNotification[];
};

/** Status Asaas em que a cobrança da reserva inteira já recebeu — dividir cobraria duas vezes. */
const ORIGINAL_CHARGE_PAID_STATUSES = new Set(["RECEIVED", "RECEIVED_IN_CASH", "CONFIRMED"]);
const ORIGINAL_CHARGE_GONE_STATUS = "DELETED";

/**
 * Operações sobre a cobrança PIX da reserva inteira — a que
 * `createArenaBookingPixPayment` gerou antes de o atleta escolher dividir.
 * Injetadas (como `createCharge`) para testar sem o Asaas.
 */
export type OriginalChargeOps = {
  /** Status normalizado por `normalizeOriginalChargeStatus`; `DELETED` se já não existe. */
  getStatus: (paymentId: string) => Promise<string>;
  /** Cancela e PROPAGA a falha: a divisão não pode seguir com a original viva. */
  cancelOrThrow: (paymentId: string) => Promise<void>;
  /** Cancela sem propagar: limpeza das cobranças das fatias num rollback. */
  cancelIfOpen: (paymentId: string) => Promise<void>;
};

/** `DELETED` para cobrança removida (o GET do Asaas ainda a devolve, com `deleted: true`). */
export function normalizeOriginalChargeStatus(
  payment: {status?: string; deleted?: boolean},
): string {
  if (payment.deleted === true) return ORIGINAL_CHARGE_GONE_STATUS;
  return (payment.status || "").trim().toUpperCase();
}

/**
 * Lógica principal do callable (sem I/O de push — o wrapper entrega as
 * notificações retornadas). `createCharge` e `originalCharge` são injetados
 * para permitir teste sem chamar o Asaas de verdade.
 */
export async function splitArenaBookingPaymentCore(
  db: Firestore,
  callerUid: string,
  invitedByName: string,
  input: {bookingId?: unknown; shares?: unknown},
  createCharge: CreateShareChargeFn,
  originalCharge: OriginalChargeOps,
  nowMs: number = Date.now(),
): Promise<SplitArenaBookingPaymentResult> {
  const bookingId = typeof input.bookingId === "string" ? input.bookingId.trim() : "";
  if (!bookingId) {
    throw new HttpsError("invalid-argument", "bookingId é obrigatório.");
  }

  const bookingRef = db.collection(ARENA_BOOKINGS).doc(bookingId);
  const bookingSnap = await bookingRef.get();
  if (!bookingSnap.exists) {
    throw new HttpsError("not-found", "Reserva não encontrada.");
  }
  const booking = bookingSnap.data() as Record<string, unknown>;

  assertBookingOwnerForSplit(callerUid, booking);

  const sharesCol = bookingRef.collection(PAYMENT_SHARES);
  const existingSnap = await sharesCol.limit(1).get();
  if (!existingSnap.empty) {
    throw new HttpsError(
      "failed-precondition",
      "Esta reserva já tem uma divisão de pagamento em andamento.",
    );
  }

  const expectedTotal = Number(booking.amountToPayNowReais) || 0;
  if (expectedTotal <= 0) {
    throw new HttpsError("failed-precondition", "Reserva sem valor pendente para dividir.");
  }

  const shares = validateSplitShares(input.shares, expectedTotal);

  const deadline = booking.confirmationDeadline instanceof Timestamp ?
    booking.confirmationDeadline.toDate() :
    null;
  if (!deadline || deadline.getTime() - nowMs < MIN_MINUTES_UNTIL_DEADLINE * 60 * 1000) {
    throw new HttpsError(
      "failed-precondition",
      "Está muito perto do horário da reserva para dividir o pagamento com amigos.",
    );
  }

  // A reserva pode já ter o PIX da reserva inteira (o atleta gerou o QR, voltou e
  // escolheu dividir). Pago → dividir cobraria duas vezes. Aberto → é cancelado
  // DEPOIS das fatias, para que qualquer falha deixe a reserva como estava.
  const originalPaymentId = typeof booking.asaasPaymentId === "string" ?
    booking.asaasPaymentId.trim() :
    "";
  let originalStillOpen = false;
  if (originalPaymentId) {
    let originalStatus: string;
    try {
      originalStatus = await originalCharge.getStatus(originalPaymentId);
    } catch (e) {
      logger.error(
        `splitArenaBookingPayment: falha ao consultar a cobrança original ${originalPaymentId}`,
        e,
      );
      throw new HttpsError(
        "unavailable",
        "Não foi possível conferir o PIX desta reserva. Tente novamente.",
      );
    }
    if (ORIGINAL_CHARGE_PAID_STATUSES.has(originalStatus)) {
      throw new HttpsError(
        "failed-precondition",
        "O PIX desta reserva já foi pago. Não é possível dividir o pagamento.",
      );
    }
    originalStillOpen = originalStatus !== ORIGINAL_CHARGE_GONE_STATUS;
  }

  const arenaName = (booking.arenaName as string) || "Arena";
  const courtName = (booking.courtName as string) || "Quadra";
  const dateLabel = (booking.date as string) || "";
  const startTime = (booking.startTime as string) || "";

  const shareIds: string[] = [];
  const createdRefs: DocumentReference[] = [];
  const createdPaymentIds: string[] = [];
  const notifications: SplitNotification[] = [];

  // Desfaz as fatias já criadas: cancela as cobranças delas no Asaas (sem isso
  // ficam vivas, sem doc que o webhook ache) e apaga os docs, para a checagem de
  // "já tem split" acima não bloquear uma nova tentativa.
  const rollbackShares = async (): Promise<void> => {
    for (const paymentId of createdPaymentIds) {
      try {
        await originalCharge.cancelIfOpen(paymentId);
      } catch (cleanupErr) {
        logger.error(
          `splitArenaBookingPayment: falha ao cancelar a cobrança da fatia ${paymentId}`,
          cleanupErr,
        );
      }
    }
    for (const ref of createdRefs) {
      try {
        await ref.delete();
      } catch (cleanupErr) {
        logger.error("splitArenaBookingPayment: falha ao limpar fatia após erro", cleanupErr);
      }
    }
  };

  try {
    for (const share of shares) {
      const shareRef = sharesCol.doc();
      const charge = await createCharge({
        athleteId: share.athleteId,
        amountReais: share.amountReais,
        bookingId,
        shareId: shareRef.id,
        description: `Sua parte da reserva ${arenaName} — ${courtName}`,
        dueDate: deadline,
      });
      createdPaymentIds.push(charge.paymentId);

      await shareRef.set({
        payerAthleteId: share.athleteId,
        amountReais: share.amountReais,
        status: "pending" as ArenaBookingPaymentShareStatus,
        asaasPaymentId: charge.paymentId,
        pixCopyPaste: charge.qrCode,
        qrCodeBase64: charge.qrCodeBase64,
        expiresAt: Timestamp.fromDate(deadline),
        createdBy: callerUid,
        createdAt: FieldValue.serverTimestamp(),
      });

      createdRefs.push(shareRef);
      shareIds.push(shareRef.id);

      if (share.athleteId !== callerUid) {
        notifications.push({
          userId: share.athleteId,
          title: "Você foi convidado a pagar sua parte",
          body: `${invitedByName} te chamou pra jogar em ${arenaName} (${courtName})` +
            `${dateLabel ? ` · ${dateLabel}` : ""}${startTime ? ` ${startTime}` : ""}. ` +
            `Sua parte: R$ ${share.amountReais.toFixed(2)}.`,
          type: "arena_booking_share_payment_pending",
          data: {
            bookingId,
            shareId: shareRef.id,
            amountReais: String(share.amountReais),
            url: `/reservas/${bookingId}/parcela/${shareRef.id}`,
          },
        });
      }
    }
  } catch (e) {
    await rollbackShares();
    if (e instanceof HttpsError) throw e;
    logger.error("splitArenaBookingPayment: falha ao criar cobrança de fatia", e);
    throw new HttpsError(
      "internal",
      "Não foi possível preparar a divisão de pagamento. Tente novamente.",
    );
  }

  const previousSuperseded = supersededPaymentIdsOf(booking);

  if (originalStillOpen) {
    // Marca a original como substituída ANTES de cancelar: o cancelamento
    // dispara um webhook do Asaas, e se ele chegar antes do write final deste
    // callable (mais abaixo), o guard do webhook (Task 2) precisa achar o
    // paymentId aqui pra não cancelar a reserva por engano.
    await bookingRef.set({
      supersededAsaasPaymentIds: [...previousSuperseded, originalPaymentId],
      updatedAt: FieldValue.serverTimestamp(),
    }, {merge: true});

    try {
      await originalCharge.cancelOrThrow(originalPaymentId);
    } catch (e) {
      logger.error(
        `splitArenaBookingPayment: falha ao cancelar a cobrança original ${originalPaymentId}`,
        e,
      );

      // A falha pode ter sido um timeout DEPOIS de o Asaas já ter apagado a
      // cobrança (ou de tê-la recebido) — reconfere o status antes de desfazer
      // tudo, pra não fazer rollback de uma divisão que na verdade já está
      // correta, e pra dar uma mensagem melhor se a original foi paga.
      let stillOpenAfterFailure = true;
      let statusAfterFailure: string | null = null;
      try {
        statusAfterFailure = await originalCharge.getStatus(originalPaymentId);
        stillOpenAfterFailure = statusAfterFailure !== ORIGINAL_CHARGE_GONE_STATUS;
      } catch (statusErr) {
        logger.error(
          `splitArenaBookingPayment: falha ao reconferir status da original ` +
          `${originalPaymentId} após erro no cancelamento`,
          statusErr,
        );
      }

      if (stillOpenAfterFailure) {
        await rollbackShares();
        await bookingRef.set({
          supersededAsaasPaymentIds: previousSuperseded,
          updatedAt: FieldValue.serverTimestamp(),
        }, {merge: true});

        if (statusAfterFailure && ORIGINAL_CHARGE_PAID_STATUSES.has(statusAfterFailure)) {
          throw new HttpsError(
            "failed-precondition",
            "O PIX desta reserva já foi pago. Não é possível dividir o pagamento.",
          );
        }

        throw new HttpsError(
          "unavailable",
          "Não foi possível cancelar o PIX anterior desta reserva. Tente novamente.",
        );
      }

      logger.info(
        `splitArenaBookingPayment: cancelamento da original ${originalPaymentId} falhou mas ` +
        "ela já estava apagada no Asaas; seguindo com a divisão",
      );
    }
  }

  // Releitura final dentro de uma transação: o cron de expiração
  // (expirePendingArenaBookingPayments) ou o próprio atleta
  // (cancelPendingArenaBookingPayment) podem cancelar a reserva — status vira
  // "cancelled", slots e locks são liberados — enquanto esperávamos as idas e
  // vindas com o Asaas acima. Sem essa checagem este write ressuscitaria a
  // reserva como "confirmed" sem quadra reservada, e ainda chamaria os amigos
  // pra pagar uma fatia que não existe mais.
  const stillPendingPayment = await db.runTransaction<boolean>(async (tx) => {
    const freshSnap = await tx.get(bookingRef);
    if (!freshSnap.exists) return false;
    const freshBooking = freshSnap.data() as Record<string, unknown>;
    if ((freshBooking.status as string | undefined)?.toLowerCase() !== "pending_payment") {
      return false;
    }

    tx.set(bookingRef, {
      hasSplitShares: true,
      splitShareCount: shares.length,
      status: "confirmed",
      paymentStatus: "split_pending",
      ...(originalPaymentId ? {
        asaasPaymentId: null,
        pixCopyPaste: null,
        supersededAsaasPaymentIds: [...previousSuperseded, originalPaymentId],
      } : {}),
      updatedAt: FieldValue.serverTimestamp(),
    }, {merge: true});
    return true;
  });

  if (!stillPendingPayment) {
    await rollbackShares();
    throw new HttpsError(
      "failed-precondition",
      "Esta reserva não está mais aguardando pagamento.",
    );
  }

  return {bookingId, shareIds, notifications};
}

/**
 * Reavalia o pagamento da reserva quando não sobra nenhuma fatia `pending`:
 * `paid` se tudo foi pago online, `partial` se alguma fatia virou conta do
 * dono (`covered_by_organizer`).
 */
export async function finalizeArenaBookingIfAllSharesResolved(
  db: Firestore,
  bookingId: string,
): Promise<void> {
  const bookingRef = db.collection(ARENA_BOOKINGS).doc(bookingId);
  const sharesSnap = await bookingRef.collection(PAYMENT_SHARES).get();
  if (sharesSnap.empty) return;

  const shares = sharesSnap.docs.map((d) => d.data() as Record<string, unknown>);
  const stillPending = shares.some((s) => (s.status as string) === "pending");
  if (stillPending) return;

  const hasCovered = shares.some(
    (s) => (s.status as string) === "covered_by_organizer",
  );

  await bookingRef.set({
    status: "confirmed",
    paymentStatus: hasCovered ? "partial" : "paid",
    updatedAt: FieldValue.serverTimestamp(),
  }, {merge: true});
}

export type ExpireShareResult = {
  expired: boolean;
  amountReais: number;
  asaasPaymentId: string | null;
};

/**
 * Expira UMA fatia `pending` vencida: soma o valor a `amountDueOnsiteReais`
 * da reserva original e marca a fatia como `covered_by_organizer`. Idempotente
 * (só age se a fatia ainda estiver `pending`).
 */
export async function expireArenaBookingPaymentShareIfDue(
  db: Firestore,
  bookingId: string,
  shareId: string,
  nowMs: number = Date.now(),
): Promise<ExpireShareResult> {
  const bookingRef = db.collection(ARENA_BOOKINGS).doc(bookingId);
  const shareRef = bookingRef.collection(PAYMENT_SHARES).doc(shareId);

  return db.runTransaction<ExpireShareResult>(async (tx) => {
    const shareSnap = await tx.get(shareRef);
    if (!shareSnap.exists) {
      return {expired: false, amountReais: 0, asaasPaymentId: null};
    }
    const share = shareSnap.data() as Record<string, unknown>;
    if ((share.status as string) !== "pending") {
      return {expired: false, amountReais: 0, asaasPaymentId: null};
    }
    const expiresAt = share.expiresAt as Timestamp | undefined;
    if (!expiresAt || expiresAt.toMillis() > nowMs) {
      return {expired: false, amountReais: 0, asaasPaymentId: null};
    }

    const bookingSnap = await tx.get(bookingRef);
    if (!bookingSnap.exists) {
      return {expired: false, amountReais: 0, asaasPaymentId: null};
    }
    const booking = bookingSnap.data() as Record<string, unknown>;

    const amountReais = roundMoney(Number(share.amountReais) || 0);
    const currentDueOnsite = roundMoney(Number(booking.amountDueOnsiteReais) || 0);
    const asaasPaymentId = typeof share.asaasPaymentId === "string" ?
      share.asaasPaymentId :
      null;

    tx.set(shareRef, {
      status: "covered_by_organizer" as ArenaBookingPaymentShareStatus,
      resolvedAt: Timestamp.fromMillis(nowMs),
    }, {merge: true});

    tx.set(bookingRef, {
      amountDueOnsiteReais: roundMoney(currentDueOnsite + amountReais),
      updatedAt: Timestamp.fromMillis(nowMs),
    }, {merge: true});

    return {expired: true, amountReais, asaasPaymentId};
  });
}

// ---------------------------------------------------------------------------
// Wrappers
// ---------------------------------------------------------------------------

const splitPaymentSecrets = [...asaasArenaSecrets, PLATFORM_FEE_FIXED_BRL];

export const splitArenaBookingPayment = onCall({
  region: CLIENT_FACING_REGIONS,
  secrets: splitPaymentSecrets,
}, async (request) => {
  const callerUid = request.auth?.uid;
  if (!callerUid) {
    throw new HttpsError("unauthenticated", "Faça login para continuar.");
  }

  let invitedByName = "Um amigo";
  try {
    const caller = await getAuth().getUser(callerUid);
    invitedByName = caller.displayName?.trim() || invitedByName;
  } catch {
    // segue com fallback
  }

  const createCharge: CreateShareChargeFn = async ({
    athleteId,
    amountReais,
    bookingId,
    shareId,
    description,
    dueDate,
  }) => {
    let payerEmail = "pagamento@nexago.app";
    let payerName: string | undefined;
    try {
      const payer = await getAuth().getUser(athleteId);
      if (payer.email?.trim()) payerEmail = payer.email!.trim();
      payerName = payer.displayName?.trim() || undefined;
    } catch {
      // segue com fallback
    }

    let cpfCnpj: string;
    try {
      cpfCnpj = await resolveAthleteCpfCnpj(athleteId);
    } catch {
      throw new HttpsError(
        "failed-precondition",
        `${payerName ?? "Um dos atletas convidados"} ainda não tem CPF cadastrado ` +
        "no NexaGO e por isso não pode receber a cobrança PIX.",
      );
    }

    let customerId: string;
    try {
      customerId = await getOrCreateAsaasCustomer(athleteId, payerEmail, payerName, cpfCnpj);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg === "ASAAS_API_KEY_MISSING") {
        throw new HttpsError(
          "failed-precondition",
          "Pagamento online temporariamente indisponível. Tente novamente mais tarde.",
        );
      }
      logger.error("splitArenaBookingPayment: falha ao preparar cliente Asaas", e);
      throw new HttpsError("internal", "Não foi possível preparar o pagamento de uma das fatias.");
    }

    try {
      return await createAsaasPixCharge({
        customerId,
        valueReais: roundMoney(amountReais),
        dueDate,
        description,
        externalReference: buildArenaBookingShareExternalReference(bookingId, shareId),
        idempotencyKey: `arena-booking-share-pix-${bookingId}-${shareId}`,
      });
    } catch (e) {
      if (e instanceof AsaasApiError) {
        logger.error("splitArenaBookingPayment Asaas failed:", e.httpStatus, e.body);
        throw new HttpsError("internal", "Não foi possível gerar o PIX de uma das fatias.");
      }
      throw e;
    }
  };

  const originalCharge: OriginalChargeOps = {
    getStatus: async (paymentId) => {
      try {
        return normalizeOriginalChargeStatus(await getAsaasPayment(paymentId));
      } catch (e) {
        if (e instanceof AsaasApiError && e.httpStatus === 404) return ORIGINAL_CHARGE_GONE_STATUS;
        throw e;
      }
    },
    cancelOrThrow: deleteAsaasPaymentOrThrow,
    cancelIfOpen: deleteAsaasPaymentIfOpen,
  };

  const result = await splitArenaBookingPaymentCore(
    getFirestore(),
    callerUid,
    invitedByName,
    (request.data ?? {}) as {bookingId?: unknown; shares?: unknown},
    createCharge,
    originalCharge,
  );

  await Promise.all(
    result.notifications.map((n) =>
      deliverNotificationToUser({
        userId: n.userId,
        title: n.title,
        body: n.body,
        type: n.type,
        data: n.data,
      }).catch((err) => {
        logger.warn(`splitArenaBookingPayment: notificação falhou para ${n.userId}`, err);
      }),
    ),
  );

  return {bookingId: result.bookingId, shareIds: result.shareIds};
});

/** Fatias `pending` vencidas viram conta do dono da reserva (2h antes do jogo, em média). */
export const expireArenaBookingPaymentShares = onSchedule({
  schedule: "every 15 minutes",
  secrets: [...asaasArenaSecrets],
}, async () => {
  const db = getFirestore();
  const now = Timestamp.now();

  const snap = await db
    .collectionGroup(PAYMENT_SHARES)
    .where("status", "==", "pending")
    .where("expiresAt", "<", now)
    .limit(100)
    .get();

  if (snap.empty) {
    logger.info("expireArenaBookingPaymentShares: nenhuma fatia vencida");
    return;
  }

  let expiredCount = 0;
  const affectedBookingIds = new Set<string>();

  for (const doc of snap.docs) {
    const bookingRef = doc.ref.parent.parent;
    if (!bookingRef) continue;
    const bookingId = bookingRef.id;
    const shareId = doc.id;

    try {
      const result = await expireArenaBookingPaymentShareIfDue(
        db,
        bookingId,
        shareId,
        now.toMillis(),
      );
      if (!result.expired) continue;
      expiredCount += 1;
      affectedBookingIds.add(bookingId);
      if (result.asaasPaymentId) {
        await deleteAsaasPaymentIfOpen(result.asaasPaymentId);
      }
    } catch (e) {
      logger.error(
        `expireArenaBookingPaymentShares: falha ao expirar fatia ${shareId} (reserva ${bookingId})`,
        e,
      );
    }
  }

  for (const bookingId of affectedBookingIds) {
    try {
      await finalizeArenaBookingIfAllSharesResolved(db, bookingId);
    } catch (e) {
      logger.error(
        `expireArenaBookingPaymentShares: falha ao finalizar reserva ${bookingId}`,
        e,
      );
    }
  }

  logger.info("expireArenaBookingPaymentShares: ciclo concluído", {
    checked: snap.size,
    expired: expiredCount,
  });
});
