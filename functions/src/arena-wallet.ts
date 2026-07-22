import {
  FieldValue,
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
      createdAt: FieldValue.serverTimestamp(),
    });
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
