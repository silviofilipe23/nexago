/**
 * Saldo de GANHOS do professor de equipe (canvas C · Ganhos/Saque): o repasse que a arena paga
 * "pelo nexaGO" sai do caixa da arena e entra aqui; o professor saca por PIX
 * (`professor-earnings.ts`). Não confundir com a carteira do professor independente
 * (`professor-wallet.ts`), que nunca passa pelo nosso caixa — lá o dinheiro vai por split direto
 * para a subconta Asaas dele (decisão do dono, 20/10/2026: o saque nexaGO é SÓ do repasse).
 *
 * Mesmo desenho de `arena-wallet.ts`: `availableReais` (sacável) e `pendingReais` (reservado por
 * saque em andamento), tudo em transação. Módulo sem dependência do fluxo de saque para não fechar
 * ciclo com `withdrawal-transfer-state.ts`.
 */
import {FieldValue, type DocumentReference, type Firestore} from "firebase-admin/firestore";
import {roundMoney} from "./mercadopago-arena-helpers";

export const PROFESSOR_EARNINGS_WALLETS = "professorEarningsWallets";
export const PROFESSOR_WITHDRAWALS = "professorWithdrawals";
export const PROFESSOR_WITHDRAWAL_REF_PREFIX = "professorWithdrawal:";

export function professorEarningsWalletRef(db: Firestore, uid: string): DocumentReference {
  return db.collection(PROFESSOR_EARNINGS_WALLETS).doc(uid);
}

/** Disponível → reservado. Lança `INSUFFICIENT_BALANCE`. */
export async function reserveProfessorWithdrawalAmount(db: Firestore, uid: string, amountReais: number): Promise<void> {
  const ref = professorEarningsWalletRef(db, uid);
  await db.runTransaction(async (tx) => {
    const w = (await tx.get(ref)).data() ?? {};
    const available = Number(w["availableReais"]) || 0;
    if (amountReais <= 0 || available + 0.001 < amountReais) throw new Error("INSUFFICIENT_BALANCE");
    tx.set(ref, {
      professorUid: uid,
      availableReais: roundMoney(available - amountReais),
      pendingReais: roundMoney((Number(w["pendingReais"]) || 0) + amountReais),
      updatedAt: FieldValue.serverTimestamp(),
    }, {merge: true});
  });
}

/** O reservado ainda cobre o saque (antes de mandar o PIX). */
export async function assertProfessorWithdrawalReservationValid(db: Firestore, uid: string, amountReais: number): Promise<void> {
  const w = (await professorEarningsWalletRef(db, uid).get()).data();
  if (!w) throw new Error("WALLET_STATE_INVALID");
  if ((Number(w["pendingReais"]) || 0) + 0.001 < amountReais) throw new Error("WITHDRAWAL_RESERVATION_INVALID");
}

/** Aprovado consome o reservado; recusado devolve ao disponível. */
export async function releaseProfessorWithdrawalReservation(
  db: Firestore,
  uid: string,
  amountReais: number,
  approve: boolean,
): Promise<void> {
  const ref = professorEarningsWalletRef(db, uid);
  await db.runTransaction(async (tx) => {
    const w = (await tx.get(ref)).data() ?? {};
    const pending = Number(w["pendingReais"]) || 0;
    tx.set(ref, {
      pendingReais: roundMoney(Math.max(0, pending - amountReais)),
      ...(approve ? {} : {availableReais: roundMoney((Number(w["availableReais"]) || 0) + amountReais)}),
      updatedAt: FieldValue.serverTimestamp(),
    }, {merge: true});
  });
}
