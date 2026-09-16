/**
 * Caixa do torneio — `tournamentWallets/{tournamentId}`.
 *
 * Substitui `organizerWallets/{uid}` como destino do dinheiro das inscrições
 * pagas via Asaas (decisão do dono, 16/09/2026): o dinheiro é do evento, e
 * qualquer gestor da equipe saca dele. `organizer-wallet.ts` continua existindo
 * para o histórico e para saque legado ainda em voo.
 */
import {FieldValue, type Firestore} from "firebase-admin/firestore";
import {roundMoney} from "./mercadopago-arena-helpers";

const TOURNAMENT_WALLETS = "tournamentWallets";

export function tournamentWalletRef(db: Firestore, tournamentId: string) {
  return db.collection(TOURNAMENT_WALLETS).doc(tournamentId);
}

export async function creditTournamentWalletFromRegistration(
  db: Firestore,
  tournamentId: string,
  params: {
    /** `tournament.managerId` no momento do crédito — quem responde pelo evento. */
    ownerId: string;
    registrationId: string;
    payerUid: string;
    paymentId: string;
    grossReais: number;
    platformFeeReais: number;
    /** Taxa do gateway repassada ao organizador: cartão desconta, PIX é 0. */
    gatewayFeeReais?: number;
  },
): Promise<void> {
  const gatewayFeeReais = roundMoney(Math.max(0, params.gatewayFeeReais ?? 0));
  const netReais = roundMoney(
    Math.max(0, params.grossReais - params.platformFeeReais - gatewayFeeReais),
  );
  const walletRef = tournamentWalletRef(db, tournamentId);
  const ledgerRef = walletRef.collection("ledger").doc();

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(walletRef);
    const prevAvailable = snap.exists ? Number(snap.data()?.availableReais) || 0 : 0;
    const prevPending = snap.exists ? Number(snap.data()?.pendingReais) || 0 : 0;

    tx.set(
      walletRef,
      {
        tournamentId,
        ownerId: params.ownerId,
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
      gatewayFeeReais,
      netReais,
      createdAt: FieldValue.serverTimestamp(),
    });
  });
}
