/**
 * Carteira de cashback do atleta — `athleteWallets/{uid}`.
 *
 * Toda mudança de saldo passa por aqui, sempre numa transação que mexe na
 * carteira, nos lotes, nas reservas e no extrato juntos (ver
 * `athlete-wallet-state.ts`). Escrita só pelo servidor; as rules bloqueiam o
 * cliente.
 */
import {Timestamp, type Firestore} from "firebase-admin/firestore";
import {allocateFifo, type CashbackSourceType} from "./cashback-rules";
import {
  addLedger,
  athleteWalletRef,
  debitLot,
  loadWalletState,
  putHold,
  readHold,
  readLots,
  restoreToLot,
  spendableLots,
  writeWalletState,
} from "./athlete-wallet-state";

export type HoldCashbackParams = {
  uid: string;
  maxCents: number;
  sourceType: CashbackSourceType;
  sourceId: string;
  trackingPath: string;
  label: string;
  nowMs: number;
};

/**
 * Reserva saldo para uma cobrança que vai ser criada: abate os lotes na hora
 * (pelo que vence primeiro), para a varredura de vencimento nunca vencer
 * dinheiro preso num checkout aberto e para dois checkouts não gastarem o
 * mesmo saldo. Sem saldo, não cria nada.
 */
export async function holdCashback(
  db: Firestore,
  params: HoldCashbackParams,
): Promise<{holdId: string | null; appliedCents: number}> {
  if (params.maxCents <= 0) return {holdId: null, appliedCents: 0};
  const holdRef = athleteWalletRef(db, params.uid).collection("holds").doc();
  return db.runTransaction(async (tx) => {
    const state = await loadWalletState(tx, db, params.uid);
    const spendable = spendableLots(state, params.nowMs);
    const totalCents = spendable.reduce((sum, lot) => sum + lot.remainingCents, 0);
    const appliedCents = Math.min(params.maxCents, totalCents);
    if (appliedCents <= 0) return {holdId: null, appliedCents: 0};

    const allocations = allocateFifo(spendable, appliedCents);
    for (const allocation of allocations) debitLot(state, allocation.lotId, allocation.cents);
    putHold(state, holdRef.id, {
      uid: params.uid,
      amountCents: appliedCents,
      allocations,
      status: "open",
      sourceType: params.sourceType,
      sourceId: params.sourceId,
      trackingPath: params.trackingPath,
      label: params.label,
      asaasPaymentId: null,
      createdAt: Timestamp.fromMillis(params.nowMs),
      capturedAt: null,
      releasedAt: null,
      lateCapture: false,
      shortfallCents: 0,
    });
    writeWalletState(tx, state, params.nowMs);
    return {holdId: holdRef.id, appliedCents};
  });
}

/** Liga a reserva à cobrança criada no Asaas — é por esse id que a varredura a confere. */
export async function attachHoldPayment(
  db: Firestore,
  uid: string,
  holdId: string,
  asaasPaymentId: string,
): Promise<void> {
  await athleteWalletRef(db, uid).collection("holds").doc(holdId).set(
    {asaasPaymentId},
    {merge: true},
  );
}

/** Cobrança morreu sem pagamento: o saldo volta aos lotes de origem. Idempotente. */
export async function releaseHold(
  db: Firestore,
  uid: string,
  holdId: string,
  nowMs: number,
): Promise<boolean> {
  return db.runTransaction(async (tx) => {
    const state = await loadWalletState(tx, db, uid);
    const hold = await readHold(tx, state, holdId);
    if (!hold || hold.status !== "open") return false;
    await readLots(tx, state, hold.allocations.map((a) => a.lotId));
    for (const allocation of hold.allocations) {
      restoreToLot(state, allocation.lotId, allocation.cents, {holdId, label: hold.label});
    }
    putHold(state, holdId, {...hold, status: "released", releasedAt: Timestamp.fromMillis(nowMs)});
    writeWalletState(tx, state, nowMs);
    return true;
  });
}

export type CaptureResult = {capturedCents: number; shortfallCents: number};

/**
 * Cobrança paga: a reserva vira consumo. Se ela já tinha sido devolvida (PIX
 * pago depois de expirar), o desconto já foi dado no Asaas — então debita de
 * novo do que estiver disponível; o que faltar a nexaGO absorve, e o saldo
 * nunca fica negativo. Idempotente.
 */
export async function captureHold(
  db: Firestore,
  uid: string,
  holdId: string,
  nowMs: number,
): Promise<CaptureResult> {
  return db.runTransaction(async (tx) => {
    const state = await loadWalletState(tx, db, uid);
    const hold = await readHold(tx, state, holdId);
    if (!hold) return {capturedCents: 0, shortfallCents: 0};
    if (hold.status === "captured" || hold.status === "refunded") {
      return {
        capturedCents: hold.amountCents - hold.shortfallCents,
        shortfallCents: hold.shortfallCents,
      };
    }
    const now = Timestamp.fromMillis(nowMs);
    if (hold.status === "open") {
      putHold(state, holdId, {...hold, status: "captured", capturedAt: now});
      state.lifetimeRedeemedCents += hold.amountCents;
      addLedger(state, {type: "redeem", amountCents: hold.amountCents, label: hold.label, holdId});
      writeWalletState(tx, state, nowMs);
      return {capturedCents: hold.amountCents, shortfallCents: 0};
    }

    const spendable = spendableLots(state, nowMs);
    const totalCents = spendable.reduce((sum, lot) => sum + lot.remainingCents, 0);
    const capturedCents = Math.min(hold.amountCents, totalCents);
    const allocations = capturedCents > 0 ? allocateFifo(spendable, capturedCents) : [];
    for (const allocation of allocations) debitLot(state, allocation.lotId, allocation.cents);
    const shortfallCents = hold.amountCents - capturedCents;
    putHold(state, holdId, {
      ...hold,
      status: "captured",
      capturedAt: now,
      allocations,
      lateCapture: true,
      shortfallCents,
    });
    state.lifetimeRedeemedCents += capturedCents;
    addLedger(state, {type: "redeem", amountCents: capturedCents, label: hold.label, holdId});
    writeWalletState(tx, state, nowMs);
    return {capturedCents, shortfallCents};
  });
}

/**
 * Pagamento estornado: o saldo usado nele volta aos mesmos lotes, com a
 * validade original (lote já vencido não volta — o extrato registra).
 * Reserva ainda aberta é só devolvida. Devolve quantos centavos voltaram.
 */
export async function refundCapturedHold(
  db: Firestore,
  uid: string,
  holdId: string,
  nowMs: number,
): Promise<number> {
  return db.runTransaction(async (tx) => {
    const state = await loadWalletState(tx, db, uid);
    const hold = await readHold(tx, state, holdId);
    if (!hold || (hold.status !== "captured" && hold.status !== "open")) return 0;
    await readLots(tx, state, hold.allocations.map((a) => a.lotId));
    let restoredCents = 0;
    for (const allocation of hold.allocations) {
      restoredCents += restoreToLot(
        state, allocation.lotId, allocation.cents, {holdId, label: hold.label},
      );
    }
    if (hold.status === "captured") {
      state.lifetimeRedeemedCents = Math.max(
        0,
        state.lifetimeRedeemedCents - (hold.amountCents - hold.shortfallCents),
      );
      addLedger(state, {type: "refund", amountCents: restoredCents, label: hold.label, holdId});
    }
    putHold(state, holdId, {
      ...hold,
      status: hold.status === "open" ? "released" : "refunded",
      releasedAt: Timestamp.fromMillis(nowMs),
    });
    writeWalletState(tx, state, nowMs);
    return restoredCents;
  });
}
