/**
 * Carteira de cashback do atleta — `athleteWallets/{uid}`.
 *
 * Toda mudança de saldo passa por aqui, sempre numa transação que mexe na
 * carteira, nos lotes, nas reservas e no extrato juntos (ver
 * `athlete-wallet-state.ts`). Escrita só pelo servidor; as rules bloqueiam o
 * cliente.
 */
import {Timestamp, type Firestore} from "firebase-admin/firestore";
import {allocateFifo, computeExpiresAtMs, type CashbackSourceType} from "./cashback-rules";
import {
  addLedger,
  athleteWalletRef,
  debitLot,
  loadWalletState,
  putHold,
  putLot,
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
  await athleteWalletRef(db, uid).collection("holds").doc(holdId).update({asaasPaymentId});
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
      addLedger(state, {
        type: "refund",
        amountCents: hold.amountCents - hold.shortfallCents,
        label: hold.label,
        holdId,
      });
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

export type EarnLotParams = {
  uid: string;
  /** Id do pagamento no Asaas — também é o id do lote: um ganho por pagamento. */
  paymentId: string;
  earnCents: number;
  sourceType: CashbackSourceType;
  sourceId: string;
  tournamentId: string | null;
  arenaId: string | null;
  label: string;
  eventAtMs: number;
  nowMs: number;
};

/** Ganho nasce PENDENTE e só libera depois do evento. Idempotente pelo id do pagamento. */
export async function earnPendingLot(db: Firestore, p: EarnLotParams): Promise<boolean> {
  if (p.earnCents <= 0) return false;
  return db.runTransaction(async (tx) => {
    const state = await loadWalletState(tx, db, p.uid);
    const lotSnap = await tx.get(state.walletRef.collection("lots").doc(p.paymentId));
    if (lotSnap.exists) return false;
    const now = Timestamp.fromMillis(p.nowMs);
    putLot(state, p.paymentId, {
      uid: p.uid,
      sourceType: p.sourceType,
      sourceId: p.sourceId,
      tournamentId: p.tournamentId,
      arenaId: p.arenaId,
      label: p.label,
      earnedCents: p.earnCents,
      remainingCents: 0,
      status: "pending",
      eventAt: Timestamp.fromMillis(p.eventAtMs),
      releasedAt: null,
      expiresAt: null,
      expiryWarnedAt: null,
      createdAt: now,
    });
    state.lifetimeEarnedCents += p.earnCents;
    addLedger(state, {type: "earn", amountCents: p.earnCents, label: p.label, lotId: p.paymentId});
    writeWalletState(tx, state, p.nowMs);
    return true;
  });
}

/** Pendente → disponível, vencendo em `expiryMonths`. Devolve o valor liberado (0 se nada mudou). */
export async function releaseLot(
  db: Firestore,
  uid: string,
  lotId: string,
  nowMs: number,
  expiryMonths: number,
): Promise<number> {
  return db.runTransaction(async (tx) => {
    const state = await loadWalletState(tx, db, uid);
    const lot = state.lots.get(lotId);
    if (!lot || lot.status !== "pending") return 0;
    putLot(state, lotId, {
      ...lot,
      status: "available",
      remainingCents: lot.earnedCents,
      releasedAt: Timestamp.fromMillis(nowMs),
      expiresAt: Timestamp.fromMillis(computeExpiresAtMs(nowMs, expiryMonths)),
    });
    addLedger(state, {type: "release", amountCents: lot.earnedCents, label: lot.label, lotId});
    writeWalletState(tx, state, nowMs);
    return lot.earnedCents;
  });
}

/** Vínculo caiu antes do evento: o pendente é cancelado. */
export async function cancelLot(
  db: Firestore,
  uid: string,
  lotId: string,
  nowMs: number,
): Promise<boolean> {
  return db.runTransaction(async (tx) => {
    const state = await loadWalletState(tx, db, uid);
    const lot = state.lots.get(lotId);
    if (!lot || lot.status !== "pending") return false;
    putLot(state, lotId, {...lot, status: "cancelled"});
    addLedger(state, {type: "cancel", amountCents: lot.earnedCents, label: lot.label, lotId});
    writeWalletState(tx, state, nowMs);
    return true;
  });
}

/** Evento adiado: só move a data em que o lote volta a ser conferido. */
export async function rescheduleLot(
  db: Firestore,
  uid: string,
  lotId: string,
  eventAtMs: number,
): Promise<void> {
  await athleteWalletRef(db, uid).collection("lots").doc(lotId).set(
    {eventAt: Timestamp.fromMillis(eventAtMs)},
    {merge: true},
  );
}

/**
 * Estorno do pagamento que gerou o lote: pendente é cancelado; disponível
 * perde o que ainda resta. O que o atleta já gastou a nexaGO absorve — o
 * saldo nunca fica negativo.
 */
export async function reverseLot(
  db: Firestore,
  uid: string,
  lotId: string,
  nowMs: number,
): Promise<"cancelled" | "reversed" | "none"> {
  return db.runTransaction(async (tx) => {
    const state = await loadWalletState(tx, db, uid);
    await readLots(tx, state, [lotId]);
    const lot = state.lots.get(lotId);
    if (!lot) return "none";
    if (lot.status === "pending") {
      putLot(state, lotId, {...lot, status: "cancelled"});
      addLedger(state, {type: "cancel", amountCents: lot.earnedCents, label: lot.label, lotId});
      writeWalletState(tx, state, nowMs);
      return "cancelled";
    }
    if (lot.status !== "available" && lot.status !== "consumed") return "none";
    putLot(state, lotId, {...lot, remainingCents: 0, status: "reversed"});
    addLedger(state, {type: "reverse", amountCents: lot.remainingCents, label: lot.label, lotId});
    writeWalletState(tx, state, nowMs);
    return "reversed";
  });
}

/** Vence o que sobrou de um lote disponível já vencido. Devolve o valor perdido. */
export async function expireLot(
  db: Firestore,
  uid: string,
  lotId: string,
  nowMs: number,
): Promise<number> {
  return db.runTransaction(async (tx) => {
    const state = await loadWalletState(tx, db, uid);
    const lot = state.lots.get(lotId);
    if (!lot || lot.status !== "available") return 0;
    if (!lot.expiresAt || lot.expiresAt.toMillis() > nowMs) return 0;
    putLot(state, lotId, {...lot, remainingCents: 0, status: "expired"});
    addLedger(state, {type: "expire", amountCents: lot.remainingCents, label: lot.label, lotId});
    writeWalletState(tx, state, nowMs);
    return lot.remainingCents;
  });
}

export async function markExpiryWarned(
  db: Firestore,
  uid: string,
  lotIds: string[],
  nowMs: number,
): Promise<void> {
  const batch = db.batch();
  const lots = athleteWalletRef(db, uid).collection("lots");
  for (const lotId of lotIds) {
    batch.set(lots.doc(lotId), {expiryWarnedAt: Timestamp.fromMillis(nowMs)}, {merge: true});
  }
  await batch.commit();
}
