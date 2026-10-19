/**
 * "Mecanismo para validação de saque via webhooks" do Asaas: antes de executar
 * uma operação de saída criada pela API, o Asaas pergunta a esta função se ela
 * é legítima (POST ~5 s depois da criação). Só aprovamos transferência que bate
 * com um saque que o próprio nexaGO está enviando — referência, id, valor,
 * chave PIX e a marca de envio em curso.
 * Todo o resto é recusado.
 *
 * É o que permite pedir ao Asaas para tirar o token SMS/APP das transferências
 * via API sem perder a segunda checagem: a chave de API sozinha não tira
 * dinheiro da conta.
 *
 * Configuração (Menu do usuário › Integrações › Mecanismos de segurança):
 *   - URL: esta função em southamerica-east1 (a de us-central1 existe só pela
 *     política de região do projeto);
 *   - token: o MESMO valor de ASAAS_WEBHOOK_ACCESS_TOKEN;
 *   - NÃO ligar "validar também operações da interface", estornos Pix nem
 *     splits: o nexaGO não as reconhece e recusaria todas.
 * Ligar só DEPOIS desta função estar publicada — sem resposta (3 falhas) o
 * Asaas cancela a transferência.
 *
 * Resposta: `{status: "APPROVED"}` ou `{status: "REFUSED", refuseReason}`.
 * Erro interno responde 500, para o Asaas tentar de novo.
 */
import {FieldValue, getFirestore, type Firestore} from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";
import {onRequest} from "firebase-functions/v2/https";
import {ASAAS_WEBHOOK_ACCESS_TOKEN} from "./asaas-client";
import {normalizePixAddressKey, resolveWithdrawalTransferAmount} from "./asaas-payout";
import {
  type AsaasTransferPayload,
  findWithdrawalForTransfer,
} from "./asaas-withdrawal-webhook";
import {isCurrentTransfer} from "./withdrawal-transfer-state";
import {CLIENT_FACING_REGIONS} from "./function-regions";

export type WithdrawalValidationDecision =
  | {status: "APPROVED"}
  | {status: "REFUSED"; refuseReason: string};

function refuse(refuseReason: string): WithdrawalValidationDecision {
  return {status: "REFUSED", refuseReason};
}

function lower(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

/**
 * Mesma chave? O Asaas pode devolver a chave formatada (telefone com +55,
 * CPF com pontos), então documento e telefone comparam só os dígitos.
 */
export function samePixKey(sent: string, stored: string, storedType: string): boolean {
  const type = storedType.trim().toUpperCase();
  const a = normalizePixAddressKey(sent, type || "EVP");
  const b = normalizePixAddressKey(stored, type || "EVP");
  if (a.toLowerCase() === b.toLowerCase()) return true;
  if (type === "PHONE") {
    const strip55 = (digits: string) => digits.replace(/^55(?=\d{10,11}$)/, "");
    return strip55(a) === strip55(b);
  }
  return false;
}

/**
 * A transferência é a do saque? Pura: o saque já vem lido. `null` = nenhum
 * saque nosso aponta para ela.
 */
export function decideWithdrawalTransfer(
  transfer: AsaasTransferPayload,
  withdrawal: Record<string, unknown> | null,
): WithdrawalValidationDecision {
  if (!withdrawal) return refuse("Transferência não reconhecida pelo nexaGO.");
  if (lower(withdrawal.status) === "rejected") return refuse("Saque recusado no nexaGO.");
  if (lower(withdrawal.payoutProvider) !== "asaas") {
    return refuse("Saque não foi enviado pelo nexaGO.");
  }
  const payout = lower(withdrawal.payoutStatus);
  if (payout !== "pending" && payout !== "sent") {
    return refuse("Saque não está aguardando envio.");
  }
  // `pending` sozinho não prova envio: saque acima do limite nasce assim e
  // espera a revisão. Só o envio (asaas-payout.ts) grava esta marca.
  if (!withdrawal.transferRequestedAt) {
    return refuse("Saque ainda não foi liberado para envio.");
  }
  if (!isCurrentTransfer(withdrawal, transfer.id)) {
    return refuse("Transferência diferente da registrada no saque.");
  }
  const operationType = (transfer.operationType ?? "").trim().toUpperCase();
  if (operationType && operationType !== "PIX") {
    return refuse("O nexaGO só paga saque por PIX.");
  }

  const value = Number(transfer.value);
  const {netReais} = resolveWithdrawalTransferAmount(withdrawal);
  if (!Number.isFinite(value) || Math.abs(value - netReais) > 0.005) {
    return refuse("Valor diferente do saque.");
  }

  // Todo saque nosso vai por chave PIX: sem a chave no pedido não há o que
  // conferir, e aprovar às cegas seria aceitar uma TED com a referência certa.
  const sentKey = transfer.bankAccount?.pixAddressKey?.trim() ?? "";
  const storedKey = (withdrawal.pixKey as string | undefined)?.trim() ?? "";
  const storedType = (withdrawal.pixKeyType as string | undefined) ?? "";
  if (!sentKey || !storedKey || !samePixKey(sentKey, storedKey, storedType)) {
    return refuse("Chave PIX diferente da do saque.");
  }

  return {status: "APPROVED"};
}

/** Corpo da validação: `type` + o objeto daquele tipo. */
export type AsaasValidationBody = {
  type?: string;
  transfer?: AsaasTransferPayload;
};

/** Decide e deixa o rastro no doc do saque (melhor esforço). */
export async function validateAsaasOutgoingOperation(
  db: Firestore,
  body: AsaasValidationBody,
): Promise<WithdrawalValidationDecision> {
  const type = (body.type ?? "").trim().toUpperCase();
  if (type !== "TRANSFER" || !body.transfer) {
    return refuse("Operação não reconhecida pelo nexaGO.");
  }
  const transfer = body.transfer;
  const match = await findWithdrawalForTransfer(db, transfer);
  const withdrawal = match ? ((await match.ref.get()).data() ?? null) : null;
  const decision = decideWithdrawalTransfer(transfer, withdrawal);

  if (match) {
    try {
      await match.ref.update({
        transferValidation: {
          decision: decision.status,
          refuseReason: decision.status === "REFUSED" ? decision.refuseReason : null,
          transferId: transfer.id?.trim() || null,
          at: FieldValue.serverTimestamp(),
        },
      });
    } catch (err) {
      logger.warn(`asaasWithdrawalValidation: rastro não gravado ${match.ref.path}`, err);
    }
  }
  return decision;
}

export const asaasWithdrawalValidation = onRequest({
  region: CLIENT_FACING_REGIONS,
  secrets: [ASAAS_WEBHOOK_ACCESS_TOKEN],
}, async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).send("Method Not Allowed");
    return;
  }

  let expectedToken = "";
  try {
    expectedToken = ASAAS_WEBHOOK_ACCESS_TOKEN.value()?.trim() ?? "";
  } catch {
    expectedToken = "";
  }
  const receivedToken = (req.get("asaas-access-token") || "").trim();
  if (!expectedToken || receivedToken !== expectedToken) {
    // Sem token válido não se aprova nada; recusar é o lado seguro.
    logger.warn("asaasWithdrawalValidation: token ausente ou inválido");
    res.status(401).json(refuse("Token inválido."));
    return;
  }

  let body: AsaasValidationBody = {};
  if (typeof req.body === "string") {
    try {
      body = JSON.parse(req.body) as AsaasValidationBody;
    } catch {
      res.status(200).json(refuse("Corpo inválido."));
      return;
    }
  } else if (req.body && typeof req.body === "object") {
    body = req.body as AsaasValidationBody;
  }

  try {
    const decision = await validateAsaasOutgoingOperation(getFirestore(), body);
    logger.info(
      `asaasWithdrawalValidation type=${body.type ?? ""} transfer=${body.transfer?.id ?? ""} ` +
      `ref=${body.transfer?.externalReference ?? ""} → ${decision.status}` +
      (decision.status === "REFUSED" ? ` (${decision.refuseReason})` : ""),
    );
    res.status(200).json(decision);
  } catch (err) {
    logger.error("asaasWithdrawalValidation falhou", err);
    res.status(500).send("Internal error");
  }
});
