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
} from "./asaas-booking-payment";
import {deliverNotificationToUser} from "./notification-delivery";

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

/**
 * Lógica principal do callable (sem I/O de push — o wrapper entrega as
 * notificações retornadas). `createCharge` é injetado para permitir teste
 * sem chamar o Asaas de verdade.
 */
export async function splitArenaBookingPaymentCore(
  db: Firestore,
  callerUid: string,
  invitedByName: string,
  input: {bookingId?: unknown; shares?: unknown},
  createCharge: CreateShareChargeFn,
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

  const arenaName = (booking.arenaName as string) || "Arena";
  const courtName = (booking.courtName as string) || "Quadra";
  const dateLabel = (booking.date as string) || "";
  const startTime = (booking.startTime as string) || "";

  const shareIds: string[] = [];
  const createdRefs: DocumentReference[] = [];
  const notifications: SplitNotification[] = [];

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
    // Rollback best-effort das fatias já criadas — mantém o estado consistente
    // pra permitir nova tentativa (a checagem de "já tem split" acima olha a
    // subcoleção; se sobrar lixo, uma tentativa nova ficaria bloqueada à toa).
    for (const ref of createdRefs) {
      try {
        await ref.delete();
      } catch (cleanupErr) {
        logger.error("splitArenaBookingPayment: falha ao limpar fatia após erro", cleanupErr);
      }
    }
    if (e instanceof HttpsError) throw e;
    logger.error("splitArenaBookingPayment: falha ao criar cobrança de fatia", e);
    throw new HttpsError(
      "internal",
      "Não foi possível preparar a divisão de pagamento. Tente novamente.",
    );
  }

  await bookingRef.set({
    hasSplitShares: true,
    splitShareCount: shares.length,
    status: "confirmed",
    paymentStatus: "split_pending",
    updatedAt: FieldValue.serverTimestamp(),
  }, {merge: true});

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

  const result = await splitArenaBookingPaymentCore(
    getFirestore(),
    callerUid,
    invitedByName,
    (request.data ?? {}) as {bookingId?: unknown; shares?: unknown},
    createCharge,
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
