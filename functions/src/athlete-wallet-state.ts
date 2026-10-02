/**
 * Estado da carteira de cashback do atleta dentro de UMA transação.
 *
 * Toda operação de `athlete-wallet.ts` carrega este estado (doc da carteira,
 * lotes ativos e reservas abertas), muda lotes e reservas em memória e grava
 * tudo de uma vez — inclusive os totais, recalculados a partir dos lotes. Os
 * totais nunca são incrementados às cegas: se divergirem, a próxima operação
 * os corrige.
 *
 * O Firestore exige todas as leituras antes das escritas numa transação: por
 * isso `loadWalletState` lê tudo primeiro, e `readLots`/`readHold` existem
 * para o que está fora do conjunto ativo (ex.: lote já consumido que recebe
 * de volta o saldo de um estorno).
 */
import {
  Timestamp,
  type DocumentReference,
  type Firestore,
  type Transaction,
} from "firebase-admin/firestore";
import type {CashbackSourceType, LotAllocation, LotBalance} from "./cashback-rules";

export const ATHLETE_WALLETS = "athleteWallets";

export type LotStatus = "pending" | "available" | "consumed" | "expired" | "cancelled" | "reversed";
export type HoldStatus = "open" | "captured" | "released" | "refunded";
export type LedgerType =
  | "earn" | "release" | "cancel" | "redeem" | "expire" | "reverse" | "refund";

export type LotDoc = {
  uid: string;
  sourceType: CashbackSourceType;
  sourceId: string;
  tournamentId: string | null;
  arenaId: string | null;
  label: string;
  earnedCents: number;
  remainingCents: number;
  status: LotStatus;
  eventAt: Timestamp;
  releasedAt: Timestamp | null;
  expiresAt: Timestamp | null;
  expiryWarnedAt: Timestamp | null;
  createdAt: Timestamp;
};

export type HoldDoc = {
  uid: string;
  amountCents: number;
  allocations: LotAllocation[];
  status: HoldStatus;
  sourceType: CashbackSourceType;
  sourceId: string;
  /** Doc que registra a cobrança (pixPending, reserva, participante) — a varredura o confere. */
  trackingPath: string;
  label: string;
  asaasPaymentId: string | null;
  createdAt: Timestamp;
  capturedAt: Timestamp | null;
  releasedAt: Timestamp | null;
  /** Capturada depois de devolvida (PIX pago após expirar). */
  lateCapture: boolean;
  /** O que não deu para debitar na captura tardia — a nexaGO absorveu. */
  shortfallCents: number;
};

export type LedgerEntry = {
  type: LedgerType;
  amountCents: number;
  label: string;
  lotId: string | null;
  holdId: string | null;
};

export type WalletState = {
  uid: string;
  walletRef: DocumentReference;
  lifetimeEarnedCents: number;
  lifetimeRedeemedCents: number;
  lots: Map<string, LotDoc>;
  holds: Map<string, HoldDoc>;
  dirtyLots: Set<string>;
  dirtyHolds: Set<string>;
  ledger: LedgerEntry[];
};

export type WalletSummary = {
  availableCents: number;
  pendingCents: number;
  heldCents: number;
  nextExpiryAtMs: number | null;
  nextExpiryCents: number;
};

export function athleteWalletRef(db: Firestore, uid: string): DocumentReference {
  return db.collection(ATHLETE_WALLETS).doc(uid);
}

export async function loadWalletState(
  tx: Transaction,
  db: Firestore,
  uid: string,
): Promise<WalletState> {
  const walletRef = athleteWalletRef(db, uid);
  const lotsCol = walletRef.collection("lots");
  const holdsCol = walletRef.collection("holds");
  const walletSnap = await tx.get(walletRef);
  const pendingSnap = await tx.get(lotsCol.where("status", "==", "pending"));
  const availableSnap = await tx.get(lotsCol.where("status", "==", "available"));
  const openHoldsSnap = await tx.get(holdsCol.where("status", "==", "open"));

  const wallet = (walletSnap.exists ? walletSnap.data() : undefined) ?? {};
  const lots = new Map<string, LotDoc>();
  for (const doc of [...pendingSnap.docs, ...availableSnap.docs]) {
    lots.set(doc.id, doc.data() as LotDoc);
  }
  const holds = new Map<string, HoldDoc>();
  for (const doc of openHoldsSnap.docs) holds.set(doc.id, doc.data() as HoldDoc);

  return {
    uid,
    walletRef,
    lifetimeEarnedCents: Number(wallet.lifetimeEarnedCents) || 0,
    lifetimeRedeemedCents: Number(wallet.lifetimeRedeemedCents) || 0,
    lots,
    holds,
    dirtyLots: new Set(),
    dirtyHolds: new Set(),
    ledger: [],
  };
}

export async function readLots(
  tx: Transaction,
  state: WalletState,
  lotIds: string[],
): Promise<void> {
  for (const lotId of lotIds) {
    if (state.lots.has(lotId)) continue;
    const snap = await tx.get(state.walletRef.collection("lots").doc(lotId));
    if (snap.exists) state.lots.set(lotId, snap.data() as LotDoc);
  }
}

export async function readHold(
  tx: Transaction,
  state: WalletState,
  holdId: string,
): Promise<HoldDoc | null> {
  const known = state.holds.get(holdId);
  if (known) return known;
  const snap = await tx.get(state.walletRef.collection("holds").doc(holdId));
  if (!snap.exists) return null;
  const hold = snap.data() as HoldDoc;
  state.holds.set(holdId, hold);
  return hold;
}

export function putLot(state: WalletState, lotId: string, lot: LotDoc): void {
  state.lots.set(lotId, lot);
  state.dirtyLots.add(lotId);
}

export function putHold(state: WalletState, holdId: string, hold: HoldDoc): void {
  state.holds.set(holdId, hold);
  state.dirtyHolds.add(holdId);
}

export function addLedger(
  state: WalletState,
  entry: {type: LedgerType; amountCents: number; label: string; lotId?: string; holdId?: string},
): void {
  if (entry.amountCents <= 0) return;
  state.ledger.push({
    type: entry.type,
    amountCents: entry.amountCents,
    label: entry.label,
    lotId: entry.lotId ?? null,
    holdId: entry.holdId ?? null,
  });
}

/** Lotes que podem ser gastos agora: disponíveis, com saldo e ainda não vencidos. */
export function spendableLots(state: WalletState, nowMs: number): LotBalance[] {
  const out: LotBalance[] = [];
  for (const [lotId, lot] of state.lots) {
    if (lot.status !== "available" || lot.remainingCents <= 0) continue;
    const expiresAtMs = lot.expiresAt ? lot.expiresAt.toMillis() : Number.MAX_SAFE_INTEGER;
    if (expiresAtMs <= nowMs) continue;
    out.push({lotId, remainingCents: lot.remainingCents, expiresAtMs});
  }
  return out;
}

/** Debita de um lote já alocado; zerou → consumido, para sair da leitura dos ativos. */
export function debitLot(state: WalletState, lotId: string, cents: number): void {
  const lot = state.lots.get(lotId);
  if (!lot) throw new Error(`CASHBACK_LOT_MISSING:${lotId}`);
  const remainingCents = lot.remainingCents - cents;
  putLot(state, lotId, {
    ...lot,
    remainingCents,
    status: remainingCents > 0 ? lot.status : "consumed",
  });
}

/**
 * Devolve centavos ao lote de origem. Disponível ou consumido volta a valer;
 * vencido ou estornado não — o valor se perde e o extrato registra a saída,
 * para o saldo nunca mudar sem explicação. Devolve quanto voltou de fato.
 */
export function restoreToLot(
  state: WalletState,
  lotId: string,
  cents: number,
  ctx: {holdId: string; label: string},
): number {
  const lot = state.lots.get(lotId);
  if (lot && (lot.status === "available" || lot.status === "consumed")) {
    putLot(state, lotId, {
      ...lot,
      remainingCents: lot.remainingCents + cents,
      status: "available",
    });
    return cents;
  }
  addLedger(state, {
    type: lot?.status === "reversed" ? "reverse" : "expire",
    amountCents: cents,
    label: ctx.label,
    lotId,
    holdId: ctx.holdId,
  });
  return 0;
}

/** Totais mostrados ao atleta; ignora lote já vencido que a varredura ainda não processou,
 *  para o saldo exibido bater com o que `spendableLots`/`holdCashback` aceitariam agora. */
export function computeSummary(state: WalletState, nowMs: number): WalletSummary {
  let availableCents = 0;
  let pendingCents = 0;
  let heldCents = 0;
  let nextExpiryAtMs: number | null = null;
  let nextExpiryCents = 0;
  for (const lot of state.lots.values()) {
    if (lot.status === "pending") pendingCents += lot.earnedCents;
    if (lot.status !== "available" || lot.remainingCents <= 0) continue;
    const ms = lot.expiresAt ? lot.expiresAt.toMillis() : null;
    if (ms != null && ms <= nowMs) continue;
    availableCents += lot.remainingCents;
    if (ms == null) continue;
    if (nextExpiryAtMs == null || ms < nextExpiryAtMs) {
      nextExpiryAtMs = ms;
      nextExpiryCents = lot.remainingCents;
    } else if (ms === nextExpiryAtMs) {
      nextExpiryCents += lot.remainingCents;
    }
  }
  for (const hold of state.holds.values()) {
    if (hold.status === "open") heldCents += hold.amountCents;
  }
  return {availableCents, pendingCents, heldCents, nextExpiryAtMs, nextExpiryCents};
}

export function writeWalletState(
  tx: Transaction,
  state: WalletState,
  nowMs: number,
): WalletSummary {
  const now = Timestamp.fromMillis(nowMs);
  for (const lotId of state.dirtyLots) {
    tx.set(state.walletRef.collection("lots").doc(lotId), state.lots.get(lotId)!);
  }
  for (const holdId of state.dirtyHolds) {
    tx.set(state.walletRef.collection("holds").doc(holdId), state.holds.get(holdId)!);
  }
  for (const entry of state.ledger) {
    tx.set(state.walletRef.collection("ledger").doc(), {...entry, createdAt: now});
  }
  const summary = computeSummary(state, nowMs);
  tx.set(state.walletRef, {
    uid: state.uid,
    availableCents: summary.availableCents,
    pendingCents: summary.pendingCents,
    heldCents: summary.heldCents,
    lifetimeEarnedCents: state.lifetimeEarnedCents,
    lifetimeRedeemedCents: state.lifetimeRedeemedCents,
    nextExpiryAt: summary.nextExpiryAtMs == null ?
      null :
      Timestamp.fromMillis(summary.nextExpiryAtMs),
    nextExpiryCents: summary.nextExpiryCents,
    updatedAt: now,
  });
  return summary;
}
