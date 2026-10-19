/**
 * Caixa do torneio — `tournamentWallets/{tournamentId}`.
 *
 * Substitui `organizerWallets/{uid}` como destino do dinheiro das inscrições
 * pagas via Asaas (decisão do dono, 16/09/2026): o dinheiro é do evento, e
 * qualquer gestor da equipe saca dele. `organizer-wallet.ts` continua existindo
 * para o histórico e para saque legado ainda em voo.
 */
import {
  FieldValue,
  type DocumentData,
  type DocumentReference,
  type Firestore,
} from "firebase-admin/firestore";
import {roundMoney} from "./mercadopago-arena-helpers";

const TOURNAMENT_WALLETS = "tournamentWallets";

export function tournamentWalletRef(db: Firestore, tournamentId: string) {
  return db.collection(TOURNAMENT_WALLETS).doc(tournamentId);
}

/** O que o organizador recebe de uma inscrição: bruto − taxa da plataforma − taxa do gateway. */
export function organizerNetReais(params: {
  grossReais: number;
  platformFeeReais: number;
  gatewayFeeReais?: number;
}): number {
  const gatewayFeeReais = roundMoney(Math.max(0, params.gatewayFeeReais ?? 0));
  return roundMoney(Math.max(0, params.grossReais - params.platformFeeReais - gatewayFeeReais));
}

/**
 * Quanto do "a liberar" este pagamento ainda segura, e em qual caixa.
 *
 * O "a liberar" (`awaitingSettlementReais`) é o líquido dos cartões aprovados
 * que ainda não liquidaram: a vaga já foi garantida no `CONFIRMED`, mas o
 * dinheiro só entra no caixa no `RECEIVED`, ~32 dias depois. Quem sabe quanto
 * cada pagamento somou é o marcador `awaitingSettlement` no doc de
 * `asaas_processed_payments` — o abatimento usa esse valor, nunca um
 * recalculado, senão uma taxa de cartão diferente na liquidação deixava
 * resíduo para sempre no caixa.
 */
export function heldAwaitingSettlement(
  processed: DocumentData | undefined,
): {tournamentId: string; netReais: number} | null {
  const marker = processed?.awaitingSettlement as Record<string, unknown> | undefined;
  if (!marker || typeof marker !== "object") return null;
  if (processed?.awaitingSettlementReleasedAt != null) return null;
  const tournamentId = typeof marker.tournamentId === "string" ? marker.tournamentId.trim() : "";
  const netReais = Number(marker.netReais);
  if (!tournamentId || !Number.isFinite(netReais) || netReais <= 0) return null;
  return {tournamentId, netReais: roundMoney(netReais)};
}

function awaitingAfterRelease(walletData: DocumentData | undefined, netReais: number): number {
  return roundMoney(Math.max(0, (Number(walletData?.awaitingSettlementReais) || 0) - netReais));
}

/**
 * Soma ao "a liberar" do caixa o líquido previsto de um cartão aprovado.
 *
 * Idempotente pelo marcador, na mesma transação: reentrega do `CONFIRMED` (ou
 * o backfill) não soma de novo, e pagamento que já creditou o caixa não volta
 * para cá — ler `walletCreditedAt` aqui dentro é o que fecha a corrida com um
 * `RECEIVED` chegando junto. Devolve se somou.
 */
export async function holdTournamentAwaitingSettlement(
  db: Firestore,
  processedRef: DocumentReference,
  params: {tournamentId: string; ownerId: string; netReais: number},
): Promise<boolean> {
  const netReais = roundMoney(Math.max(0, params.netReais));
  if (netReais <= 0) return false;
  const walletRef = tournamentWalletRef(db, params.tournamentId);

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
        tournamentId: params.tournamentId,
        ownerId: params.ownerId,
        // Caixa nasce com os saldos zerados, para o doc ter sempre a mesma forma.
        ...(walletSnap.exists ? {} : {availableReais: 0, pendingReais: 0}),
        awaitingSettlementReais: roundMoney(prev + netReais),
        updatedAt: FieldValue.serverTimestamp(),
      },
      {merge: true},
    );
    tx.set(
      processedRef,
      {
        awaitingSettlement: {
          tournamentId: params.tournamentId,
          netReais,
          heldAt: FieldValue.serverTimestamp(),
        },
      },
      {merge: true},
    );
    return true;
  });
}

/**
 * Tira do "a liberar" um cartão que não vai mais liquidar como previsto
 * (estorno, chargeback). Uma vez só por pagamento; se o `RECEIVED` vier mesmo
 * assim, o crédito acontece normalmente e não abate de novo. Devolve o valor
 * tirado (0 quando não havia nada a tirar).
 */
export async function releaseTournamentAwaitingSettlement(
  db: Firestore,
  processedRef: DocumentReference,
  reason: string,
): Promise<number> {
  return db.runTransaction(async (tx) => {
    const held = heldAwaitingSettlement((await tx.get(processedRef)).data());
    if (!held) return 0;
    const walletRef = tournamentWalletRef(db, held.tournamentId);
    const walletSnap = await tx.get(walletRef);

    tx.set(
      walletRef,
      {
        awaitingSettlementReais: awaitingAfterRelease(walletSnap.data(), held.netReais),
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
    /** Parte do bruto paga com cashback do atleta (a nexaGO cobre) — só auditoria. */
    cashbackAppliedReais?: number;
    /** Desconto do seguidor (NexaSquad) bancado pela nexaGO — informativo, já dentro do bruto. */
    squadDiscountReais?: number;
    /**
     * Doc do pagamento em `asaas_processed_payments`. Com ele, o crédito marca
     * `walletCreditedAt` e abate o "a liberar" deste pagamento na MESMA
     * transação — e não credita de novo se uma entrega concorrente já marcou.
     */
    processedRef?: DocumentReference;
  },
): Promise<boolean> {
  const gatewayFeeReais = roundMoney(Math.max(0, params.gatewayFeeReais ?? 0));
  const netReais = organizerNetReais({...params, gatewayFeeReais});
  const walletRef = tournamentWalletRef(db, tournamentId);
  const ledgerRef = walletRef.collection("ledger").doc();
  const processedRef = params.processedRef;

  return db.runTransaction(async (tx) => {
    const processed = processedRef ? (await tx.get(processedRef)).data() : undefined;
    if (processed?.walletCreditedAt != null) return false;
    const held = heldAwaitingSettlement(processed);
    const snap = await tx.get(walletRef);
    // Marcador de outro caixa (inscrição que mudou de torneio): abate lá.
    const heldElsewhere = held && held.tournamentId !== tournamentId ? held : null;
    const heldRef = heldElsewhere ? tournamentWalletRef(db, heldElsewhere.tournamentId) : null;
    const heldSnap = heldRef ? await tx.get(heldRef) : null;
    const prevAvailable = snap.exists ? Number(snap.data()?.availableReais) || 0 : 0;
    const prevPending = snap.exists ? Number(snap.data()?.pendingReais) || 0 : 0;

    tx.set(
      walletRef,
      {
        tournamentId,
        ownerId: params.ownerId,
        availableReais: roundMoney(prevAvailable + netReais),
        pendingReais: prevPending,
        ...(held && !heldElsewhere ?
          {awaitingSettlementReais: awaitingAfterRelease(snap.data(), held.netReais)} :
          {}),
        updatedAt: FieldValue.serverTimestamp(),
      },
      {merge: true},
    );
    if (heldRef && heldElsewhere) {
      tx.set(
        heldRef,
        {
          awaitingSettlementReais: awaitingAfterRelease(heldSnap?.data(), heldElsewhere.netReais),
          updatedAt: FieldValue.serverTimestamp(),
        },
        {merge: true},
      );
    }

    tx.set(ledgerRef, {
      type: "credit",
      registrationId: params.registrationId,
      payerUid: params.payerUid,
      asaasPaymentId: params.paymentId,
      grossReais: roundMoney(params.grossReais),
      platformFeeReais: roundMoney(params.platformFeeReais),
      gatewayFeeReais,
      netReais,
      cashbackAppliedReais: roundMoney(Math.max(0, params.cashbackAppliedReais ?? 0)),
      squadDiscountReais: roundMoney(Math.max(0, params.squadDiscountReais ?? 0)),
      createdAt: FieldValue.serverTimestamp(),
    });

    if (processedRef) {
      tx.set(
        processedRef,
        {
          walletCreditedAt: FieldValue.serverTimestamp(),
          ...(held ?
            {
              awaitingSettlementReleasedAt: FieldValue.serverTimestamp(),
              awaitingSettlementReleaseReason: "credited",
            } :
            {}),
        },
        {merge: true},
      );
    }
    return true;
  });
}

/** Move valor de `availableReais` para `pendingReais` ao solicitar saque. */
export async function reserveTournamentWithdrawalAmount(
  db: Firestore,
  tournamentId: string,
  amountReais: number,
): Promise<void> {
  const walletRef = tournamentWalletRef(db, tournamentId);
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
        tournamentId,
        availableReais: roundMoney(available - amountReais),
        pendingReais: roundMoney(pending + amountReais),
        updatedAt: FieldValue.serverTimestamp(),
      },
      {merge: true},
    );
  });
}

/** Confirma que o valor do saque segue reservado antes de disparar o PIX. */
export async function assertTournamentWithdrawalReservationValid(
  db: Firestore,
  tournamentId: string,
  amountReais: number,
): Promise<void> {
  const walletRef = tournamentWalletRef(db, tournamentId);
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
export async function releaseTournamentWithdrawalReservation(
  db: Firestore,
  tournamentId: string,
  amountReais: number,
  approve: boolean,
): Promise<void> {
  const walletRef = tournamentWalletRef(db, tournamentId);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(walletRef);
    const available = snap.exists ? Number(snap.data()?.availableReais) || 0 : 0;
    const pending = snap.exists ? Number(snap.data()?.pendingReais) || 0 : 0;
    tx.set(
      walletRef,
      {
        tournamentId,
        availableReais: approve ? available : roundMoney(available + amountReais),
        pendingReais: roundMoney(Math.max(0, pending - amountReais)),
        updatedAt: FieldValue.serverTimestamp(),
      },
      {merge: true},
    );
  });
}
