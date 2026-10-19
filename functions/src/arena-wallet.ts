import {
  FieldValue,
  type DocumentData,
  type DocumentReference,
  type Firestore,
} from "firebase-admin/firestore";
import {roundMoney} from "./mercadopago-arena-helpers";

const ARENA_WALLETS = "arenaWallets";

export function arenaWalletRef(db: Firestore, arenaId: string) {
  return db.collection(ARENA_WALLETS).doc(arenaId);
}

export async function creditArenaWalletFromBooking(
  db: Firestore,
  arenaId: string,
  bookingId: string,
  grossReais: number,
  platformFeeReais: number,
  cashbackAppliedReais = 0,
  /** Desconto do código de embaixador (NexaSquad): sai da taxa, entra no bruto como o cashback. */
  squadDiscountReais = 0,
): Promise<void> {
  const netReais = roundMoney(Math.max(0, grossReais - platformFeeReais));
  const walletRef = arenaWalletRef(db, arenaId);
  const ledgerRef = walletRef.collection("ledger").doc();

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(walletRef);
    const prevAvailable = snap.exists
      ? Number(snap.data()?.availableReais) || 0
      : 0;
    const prevPending = snap.exists
      ? Number(snap.data()?.pendingReais) || 0
      : 0;

    tx.set(
      walletRef,
      {
        arenaId,
        availableReais: roundMoney(prevAvailable + netReais),
        pendingReais: prevPending,
        updatedAt: FieldValue.serverTimestamp(),
      },
      {merge: true},
    );

    tx.set(ledgerRef, {
      type: "credit",
      bookingId,
      grossReais: roundMoney(grossReais),
      platformFeeReais: roundMoney(platformFeeReais),
      netReais,
      cashbackAppliedReais: roundMoney(Math.max(0, cashbackAppliedReais)),
      squadDiscountReais: roundMoney(Math.max(0, squadDiscountReais)),
      createdAt: FieldValue.serverTimestamp(),
    });
  });
}

/** O que a arena recebe de uma reserva: bruto − taxa da plataforma − taxa do cartão (PIX: 0). */
export function arenaBookingNetReais(params: {
  grossReais: number;
  platformFeeReais: number;
  gatewayFeeReais?: number;
}): number {
  const gatewayFeeReais = roundMoney(Math.max(0, params.gatewayFeeReais ?? 0));
  return roundMoney(Math.max(0, params.grossReais - params.platformFeeReais - gatewayFeeReais));
}

/**
 * Quanto do "a liberar" este pagamento ainda segura. O "a liberar"
 * (`awaitingSettlementReais`) é o líquido das reservas pagas no cartão que
 * ainda não liquidaram: o horário já foi garantido no `CONFIRMED`, o dinheiro
 * só entra no `RECEIVED`, ~32 dias depois. O abatimento usa o valor gravado no
 * marcador do pagamento, nunca um recalculado — mesma regra do caixa do
 * torneio (tournament-wallet.ts).
 */
export function heldArenaAwaitingSettlement(
  processed: DocumentData | undefined,
): {arenaId: string; netReais: number} | null {
  const marker = processed?.awaitingSettlement as Record<string, unknown> | undefined;
  if (!marker || typeof marker !== "object") return null;
  if (processed?.awaitingSettlementReleasedAt != null) return null;
  const arenaId = typeof marker.arenaId === "string" ? marker.arenaId.trim() : "";
  const netReais = Number(marker.netReais);
  if (!arenaId || !Number.isFinite(netReais) || netReais <= 0) return null;
  return {arenaId, netReais: roundMoney(netReais)};
}

function arenaAwaitingAfterRelease(walletData: DocumentData | undefined, netReais: number): number {
  return roundMoney(Math.max(0, (Number(walletData?.awaitingSettlementReais) || 0) - netReais));
}

/**
 * Soma ao "a liberar" da arena o líquido previsto de uma reserva paga no
 * cartão. Idempotente pelo marcador no doc do pagamento, na mesma transação:
 * reentrega do `CONFIRMED` não soma de novo, e pagamento já creditado não volta
 * para cá. Devolve se somou.
 */
export async function holdArenaAwaitingSettlement(
  db: Firestore,
  processedRef: DocumentReference,
  params: {arenaId: string; netReais: number},
): Promise<boolean> {
  const netReais = roundMoney(Math.max(0, params.netReais));
  if (netReais <= 0) return false;
  const walletRef = arenaWalletRef(db, params.arenaId);

  return db.runTransaction(async (tx) => {
    const processed = (await tx.get(processedRef)).data() ?? {};
    if (processed.awaitingSettlement != null || processed.walletCreditedAt != null) {
      return false;
    }
    const walletSnap = await tx.get(walletRef);
    const prev = Number(walletSnap.data()?.awaitingSettlementReais) || 0;
    tx.set(
      walletRef,
      {
        arenaId: params.arenaId,
        ...(walletSnap.exists ? {} : {availableReais: 0, pendingReais: 0}),
        awaitingSettlementReais: roundMoney(prev + netReais),
        updatedAt: FieldValue.serverTimestamp(),
      },
      {merge: true},
    );
    tx.set(
      processedRef,
      {awaitingSettlement: {arenaId: params.arenaId, netReais, heldAt: FieldValue.serverTimestamp()}},
      {merge: true},
    );
    return true;
  });
}

/**
 * Tira do "a liberar" uma reserva de cartão que não vai mais liquidar
 * (estorno, chargeback). Uma vez só por pagamento. Devolve o valor tirado.
 */
export async function releaseArenaAwaitingSettlement(
  db: Firestore,
  processedRef: DocumentReference,
  reason: string,
): Promise<number> {
  return db.runTransaction(async (tx) => {
    const held = heldArenaAwaitingSettlement((await tx.get(processedRef)).data());
    if (!held) return 0;
    const walletRef = arenaWalletRef(db, held.arenaId);
    const walletSnap = await tx.get(walletRef);
    tx.set(
      walletRef,
      {
        awaitingSettlementReais: arenaAwaitingAfterRelease(walletSnap.data(), held.netReais),
        updatedAt: FieldValue.serverTimestamp(),
      },
      {merge: true},
    );
    tx.set(
      processedRef,
      {
        awaitingSettlementReleasedAt: FieldValue.serverTimestamp(),
        awaitingSettlementReleaseReason: reason,
      },
      {merge: true},
    );
    return held.netReais;
  });
}

/**
 * Crédito de reserva paga pelo Asaas, idempotente pelo doc do pagamento:
 * marca `walletCreditedAt` e abate o "a liberar" deste pagamento na MESMA
 * transação, e não credita de novo se uma entrega concorrente já marcou —
 * com o cartão, confirmação e crédito chegam em eventos diferentes.
 */
export async function creditArenaWalletFromBookingPayment(
  db: Firestore,
  params: {
    arenaId: string;
    bookingId: string;
    paymentId: string;
    grossReais: number;
    platformFeeReais: number;
    /** Taxa do cartão repassada à arena (`value − netValue`); PIX é 0. */
    gatewayFeeReais?: number;
    cashbackAppliedReais?: number;
    /** Desconto do código de embaixador (NexaSquad): sai da taxa, entra no bruto. */
    squadDiscountReais?: number;
    processedRef: DocumentReference;
  },
): Promise<boolean> {
  const gatewayFeeReais = roundMoney(Math.max(0, params.gatewayFeeReais ?? 0));
  const netReais = arenaBookingNetReais({...params, gatewayFeeReais});
  const walletRef = arenaWalletRef(db, params.arenaId);
  const ledgerRef = walletRef.collection("ledger").doc();

  return db.runTransaction(async (tx) => {
    const processed = (await tx.get(params.processedRef)).data();
    if (processed?.walletCreditedAt != null) return false;
    const held = heldArenaAwaitingSettlement(processed);
    const snap = await tx.get(walletRef);
    const prevAvailable = snap.exists ? Number(snap.data()?.availableReais) || 0 : 0;
    const prevPending = snap.exists ? Number(snap.data()?.pendingReais) || 0 : 0;

    tx.set(
      walletRef,
      {
        arenaId: params.arenaId,
        availableReais: roundMoney(prevAvailable + netReais),
        pendingReais: prevPending,
        ...(held ? {awaitingSettlementReais: arenaAwaitingAfterRelease(snap.data(), held.netReais)} : {}),
        updatedAt: FieldValue.serverTimestamp(),
      },
      {merge: true},
    );
    tx.set(ledgerRef, {
      type: "credit",
      bookingId: params.bookingId,
      asaasPaymentId: params.paymentId,
      grossReais: roundMoney(params.grossReais),
      platformFeeReais: roundMoney(params.platformFeeReais),
      gatewayFeeReais,
      netReais,
      cashbackAppliedReais: roundMoney(Math.max(0, params.cashbackAppliedReais ?? 0)),
      squadDiscountReais: roundMoney(Math.max(0, params.squadDiscountReais ?? 0)),
      createdAt: FieldValue.serverTimestamp(),
    });
    tx.set(
      params.processedRef,
      {
        walletCreditedAt: FieldValue.serverTimestamp(),
        ...(held ? {
          awaitingSettlementReleasedAt: FieldValue.serverTimestamp(),
          awaitingSettlementReleaseReason: "credited",
        } : {}),
      },
      {merge: true},
    );
    return true;
  });
}

/**
 * Crédito de vaga paga de clubinho: líquido = bruto − taxa. Ledger carrega
 * `clubSessionId`/`participantId`; `bookingId` recebe o id da sessão para o
 * extrato existente (web/app) exibir a referência sem mudança de parser.
 */
export async function creditArenaWalletFromClubPayment(
  db: Firestore,
  arenaId: string,
  input: {
    sessionId: string;
    participantId: string;
    grossReais: number;
    platformFeeReais: number;
    cashbackAppliedReais?: number;
    /** Desconto do código de embaixador (NexaSquad), já dentro do bruto. */
    squadDiscountReais?: number;
  },
): Promise<void> {
  const netReais = roundMoney(Math.max(0, input.grossReais - input.platformFeeReais));
  const walletRef = arenaWalletRef(db, arenaId);
  const ledgerRef = walletRef.collection("ledger").doc();

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(walletRef);
    const prevAvailable = snap.exists ? Number(snap.data()?.availableReais) || 0 : 0;
    const prevPending = snap.exists ? Number(snap.data()?.pendingReais) || 0 : 0;

    tx.set(
      walletRef,
      {
        arenaId,
        availableReais: roundMoney(prevAvailable + netReais),
        pendingReais: prevPending,
        updatedAt: FieldValue.serverTimestamp(),
      },
      {merge: true},
    );

    tx.set(ledgerRef, {
      type: "credit",
      source: "club",
      bookingId: input.sessionId,
      clubSessionId: input.sessionId,
      participantId: input.participantId,
      grossReais: roundMoney(input.grossReais),
      platformFeeReais: roundMoney(input.platformFeeReais),
      netReais,
      cashbackAppliedReais: roundMoney(Math.max(0, input.cashbackAppliedReais ?? 0)),
      squadDiscountReais: roundMoney(Math.max(0, input.squadDiscountReais ?? 0)),
      createdAt: FieldValue.serverTimestamp(),
    });
  });
}

/**
 * Débito por estorno de vaga de clubinho. Debita o LÍQUIDO creditado (a
 * plataforma absorve a própria taxa no estorno; o atleta recebe o valor cheio
 * pelo Asaas). Pode deixar `availableReais` negativo se a arena já sacou —
 * risco aceito: bloquear o estorno do atleta seria pior.
 */
export async function debitArenaWalletForClubRefund(
  db: Firestore,
  arenaId: string,
  input: {sessionId: string; participantId: string; netReais: number},
): Promise<void> {
  const amount = roundMoney(Math.max(0, input.netReais));
  if (amount <= 0) return;
  const walletRef = arenaWalletRef(db, arenaId);
  const ledgerRef = walletRef.collection("ledger").doc();

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(walletRef);
    const prevAvailable = snap.exists ? Number(snap.data()?.availableReais) || 0 : 0;
    const prevPending = snap.exists ? Number(snap.data()?.pendingReais) || 0 : 0;

    tx.set(
      walletRef,
      {
        arenaId,
        availableReais: roundMoney(prevAvailable - amount),
        pendingReais: prevPending,
        updatedAt: FieldValue.serverTimestamp(),
      },
      {merge: true},
    );

    tx.set(ledgerRef, {
      type: "refund",
      source: "club",
      bookingId: input.sessionId,
      clubSessionId: input.sessionId,
      participantId: input.participantId,
      grossReais: roundMoney(-amount),
      platformFeeReais: 0,
      netReais: roundMoney(-amount),
      createdAt: FieldValue.serverTimestamp(),
    });
  });
}

export async function reserveWithdrawalAmount(
  db: Firestore,
  arenaId: string,
  amountReais: number,
): Promise<void> {
  const walletRef = arenaWalletRef(db, arenaId);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(walletRef);
    const available = snap.exists ? Number(snap.data()?.availableReais) || 0 : 0;
    const pending = snap.exists ? Number(snap.data()?.pendingReais) || 0 : 0;
    if (amountReais > available + 0.001) {
      throw new Error("INSUFFICIENT_BALANCE");
    }
    tx.set(
      walletRef,
      {
        arenaId,
        availableReais: roundMoney(available - amountReais),
        pendingReais: roundMoney(pending + amountReais),
        updatedAt: FieldValue.serverTimestamp(),
      },
      {merge: true},
    );
  });
}

/**
 * Garante que o valor do saque ainda está reservado em `pendingReais` antes do PIX.
 */
export async function assertWithdrawalReservationValid(
  db: Firestore,
  arenaId: string,
  amountReais: number,
): Promise<void> {
  const walletRef = arenaWalletRef(db, arenaId);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(walletRef);
    const pending = snap.exists ? Number(snap.data()?.pendingReais) || 0 : 0;
    const available = snap.exists ? Number(snap.data()?.availableReais) || 0 : 0;
    if (amountReais > pending + 0.001) {
      throw new Error("WITHDRAWAL_RESERVATION_INVALID");
    }
    if (available < -0.001) {
      throw new Error("WALLET_STATE_INVALID");
    }
  });
}

export async function releaseWithdrawalReservation(
  db: Firestore,
  arenaId: string,
  amountReais: number,
  approve: boolean,
): Promise<void> {
  const walletRef = arenaWalletRef(db, arenaId);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(walletRef);
    const available = snap.exists ? Number(snap.data()?.availableReais) || 0 : 0;
    const pending = snap.exists ? Number(snap.data()?.pendingReais) || 0 : 0;
    const newPending = roundMoney(Math.max(0, pending - amountReais));
    const newAvailable = approve
      ? available
      : roundMoney(available + amountReais);
    tx.set(
      walletRef,
      {
        arenaId,
        availableReais: newAvailable,
        pendingReais: newPending,
        updatedAt: FieldValue.serverTimestamp(),
      },
      {merge: true},
    );
  });
}
