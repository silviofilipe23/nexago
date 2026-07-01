/**
 * Carteira do organizador — espelha `arena-wallet.ts`. Recebe créditos líquidos
 * (bruto − taxa da plataforma) de inscrições pagas via Asaas; o organizador
 * saca por PIX (fluxo de saque em fase posterior).
 *
 * Documento: `organizerWallets/{organizerId}` (id = uid do organizador).
 */
import {
  FieldValue,
  type Firestore,
} from "firebase-admin/firestore";
import {roundMoney} from "./mercadopago-arena-helpers";

const ORGANIZER_WALLETS = "organizerWallets";

export function organizerWalletRef(db: Firestore, organizerId: string) {
  return db.collection(ORGANIZER_WALLETS).doc(organizerId);
}

export async function creditOrganizerWalletFromRegistration(
  db: Firestore,
  organizerId: string,
  params: {
    registrationId: string;
    payerUid: string;
    paymentId: string;
    grossReais: number;
    platformFeeReais: number;
  },
): Promise<void> {
  const netReais = roundMoney(Math.max(0, params.grossReais - params.platformFeeReais));
  const walletRef = organizerWalletRef(db, organizerId);
  const ledgerRef = walletRef.collection("ledger").doc();

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(walletRef);
    const prevAvailable = snap.exists ? Number(snap.data()?.availableReais) || 0 : 0;
    const prevPending = snap.exists ? Number(snap.data()?.pendingReais) || 0 : 0;

    tx.set(
      walletRef,
      {
        organizerId,
        availableReais: roundMoney(prevAvailable + netReais),
        pendingReais: prevPending,
        updatedAt: FieldValue.serverTimestamp(),
      },
      {merge: true},
    );

    tx.set(ledgerRef, {
      type: "credit",
      registrationId: params.registrationId,
      payerUid: params.payerUid,
      asaasPaymentId: params.paymentId,
      grossReais: roundMoney(params.grossReais),
      platformFeeReais: roundMoney(params.platformFeeReais),
      netReais,
      createdAt: FieldValue.serverTimestamp(),
    });
  });
}

/** Move valor de `availableReais` para `pendingReais` ao solicitar saque. */
export async function reserveOrganizerWithdrawalAmount(
  db: Firestore,
  organizerId: string,
  amountReais: number,
): Promise<void> {
  const walletRef = organizerWalletRef(db, organizerId);
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
        organizerId,
        availableReais: roundMoney(available - amountReais),
        pendingReais: roundMoney(pending + amountReais),
        updatedAt: FieldValue.serverTimestamp(),
      },
      {merge: true},
    );
  });
}

/** Confirma que o valor do saque segue reservado em `pendingReais` antes do PIX. */
export async function assertOrganizerWithdrawalReservationValid(
  db: Firestore,
  organizerId: string,
  amountReais: number,
): Promise<void> {
  const walletRef = organizerWalletRef(db, organizerId);
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

/** Libera a reserva: `approve` consome o pending; caso contrário devolve ao disponível. */
export async function releaseOrganizerWithdrawalReservation(
  db: Firestore,
  organizerId: string,
  amountReais: number,
  approve: boolean,
): Promise<void> {
  const walletRef = organizerWalletRef(db, organizerId);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(walletRef);
    const available = snap.exists ? Number(snap.data()?.availableReais) || 0 : 0;
    const pending = snap.exists ? Number(snap.data()?.pendingReais) || 0 : 0;
    const newPending = roundMoney(Math.max(0, pending - amountReais));
    const newAvailable = approve ? available : roundMoney(available + amountReais);
    tx.set(
      walletRef,
      {
        organizerId,
        availableReais: newAvailable,
        pendingReais: newPending,
        updatedAt: FieldValue.serverTimestamp(),
      },
      {merge: true},
    );
  });
}
