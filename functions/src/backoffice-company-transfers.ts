/**
 * Backoffice › Financeiro › Extrato: classifica uma transferência feita à mão no painel do Asaas
 * (retirada, despesa ou repasse a organizador) e grava em `companyTransfers/{id da transferência}`.
 *
 * O valor e a data vêm do Asaas (`GET /v3/transfers/{id}`), nunca do cliente. O repasse a
 * organizador baixa o caixa do torneio e registra o saque pago por fora na mesma transação.
 * Regras em `company-transfers.ts`.
 */
import * as logger from "firebase-functions/logger";
import {onCall, HttpsError} from "firebase-functions/v2/https";
import {FieldValue, getFirestore, type Firestore} from "firebase-admin/firestore";
import {AsaasApiError, asaasArenaSecrets, fetchAsaas} from "./asaas-client";
import {assertBackofficeAdmin} from "./backoffice-finance";
import {
  COMPANY_TRANSFERS,
  parseClassifyInput,
  planClassification,
  type ClassifyInput,
  type CompanyTransferKind,
} from "./company-transfers";
import {CLIENT_FACING_REGIONS} from "./function-regions";

const ORGANIZER_WITHDRAWALS = "organizerWithdrawals";

export interface ClassifyResult {
  transferId: string;
  kind: CompanyTransferKind;
  changed: boolean;
}

async function loadTransfer(transferId: string, get: (path: string) => Promise<Record<string, unknown>>) {
  try {
    return await get(`/v3/transfers/${encodeURIComponent(transferId)}`);
  } catch (e) {
    if (e instanceof AsaasApiError && e.httpStatus === 404) {
      throw new HttpsError("not-found", "Transferência não encontrada no Asaas.");
    }
    logger.error("classifyCompanyTransfer: Asaas indisponível", e);
    throw new HttpsError("unavailable", "Não foi possível consultar o Asaas agora. Tente de novo em instantes.");
  }
}

/** Grava a classificação; `transfer` é o que o Asaas devolveu para `input.transferId`. */
export async function classifyTransfer(
  db: Firestore,
  uid: string,
  input: ClassifyInput,
  transfer: Record<string, unknown>,
): Promise<ClassifyResult> {
  const recordRef = db.collection(COMPANY_TRANSFERS).doc(input.transferId);
  const tid = input.tournamentId;
  const walletRef = tid ? db.collection("tournamentWallets").doc(tid) : null;
  const tournamentRef = tid ? db.collection("tournaments").doc(tid) : null;

  const withdrawalsQuery = tid ? db.collection(ORGANIZER_WITHDRAWALS).where("tournamentId", "==", tid) : null;

  return db.runTransaction(async (tx) => {
    const [existing, wallet, tournament, withdrawals] = await Promise.all([
      tx.get(recordRef),
      walletRef ? tx.get(walletRef) : null,
      tournamentRef ? tx.get(tournamentRef) : null,
      withdrawalsQuery ? tx.get(withdrawalsQuery) : null,
    ]);
    const plan = planClassification({
      transfer,
      existing: existing.exists ? existing.data() ?? {} : null,
      input,
      wallet: wallet?.exists ? wallet.data() ?? {} : null,
      tournament: tournament?.exists ? tournament.data() ?? {} : null,
      tournamentWithdrawals: withdrawals?.docs.map((d) => d.data()) ?? [],
      uid,
    });
    const now = FieldValue.serverTimestamp();
    switch (plan.status) {
    case "error":
      throw new HttpsError("failed-precondition", plan.message);
    case "unchanged":
      return {transferId: input.transferId, kind: input.kind, changed: false};
    case "update":
    {
      const {previousKind, ...fields} = plan.record;
      tx.update(recordRef, {...fields, ...(previousKind ? {previousKind} : {}), classifiedAt: now, updatedAt: now});
    }
      return {transferId: input.transferId, kind: input.kind, changed: true};
    case "create":
      if (plan.payout && walletRef) {
        const withdrawalRef = db.collection(ORGANIZER_WITHDRAWALS).doc(plan.payout.withdrawalId);
        tx.update(walletRef, {availableReais: plan.payout.walletAvailableReais, updatedAt: now});
        // `create` falha se o saque já existir: nunca baixa o caixa duas vezes.
        tx.create(withdrawalRef, {...plan.payout.withdrawal, createdAt: now, reviewedAt: now, sentAt: now, updatedAt: now});
      }
      tx.create(recordRef, {...plan.record, classifiedAt: now, updatedAt: now});
      return {transferId: input.transferId, kind: input.kind, changed: true};
    }
  });
}

export const classifyCompanyTransfer = onCall(
  {region: CLIENT_FACING_REGIONS, invoker: "public", secrets: asaasArenaSecrets, timeoutSeconds: 60},
  async (request): Promise<ClassifyResult> => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "Faça login para continuar.");
    await assertBackofficeAdmin(uid);
    let input: ClassifyInput;
    try {
      input = parseClassifyInput(request.data);
    } catch (e) {
      throw new HttpsError("invalid-argument", (e as Error).message);
    }
    const transfer = await loadTransfer(input.transferId, (path) => fetchAsaas(path));
    const result = await classifyTransfer(getFirestore(), uid, input, transfer);
    if (result.changed) {
      logger.info(`classifyCompanyTransfer: ${input.transferId} → ${input.kind}` +
        `${input.tournamentId ? ` (torneio ${input.tournamentId})` : ""} por ${uid}`);
    }
    return result;
  },
);
