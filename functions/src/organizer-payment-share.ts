/**
 * Confirmação de pagamento por atleta (organizador) — lógica pura.
 *
 * O caso real: numa dupla/equipe, o organizador confirma o pagamento de UM
 * atleta que pagou/declarou, e o outro segue pendente. `organizerConfirmRegistrationPayment`
 * usava `isPaid: true` incondicional, o que marcava os dois como pagos mesmo
 * quando só um tinha pago — este módulo faz o mesmo cálculo que o
 * autoatendimento ("Já paguei") já usa: só fecha (`isPaid`) quando todo mundo
 * está em `sharePaidUids`.
 *
 * `organizerConfirmedShareUids` distingue "o organizador confirmou este
 * atleta" de "o próprio atleta se declarou" — só a confirmação manual do
 * organizador pode ser desfeita por aqui, mesma regra do
 * [[organizer-payment-revert]] pra inscrição inteira.
 */
import {
  isFreeRegistrationFullyConfirmed,
  sharePaidUidsFromRegistration,
} from "./tournament-registration-pix-helpers";

export function organizerConfirmedShareUidsFromRegistration(
  data: Record<string, unknown>,
): string[] {
  const raw = data["organizerConfirmedShareUids"];
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (id): id is string => typeof id === "string" && id.trim().length > 0,
  );
}

export interface OrganizerConfirmSharePlan {
  /** `sharePaidUids` com o novo atleta incluído (sem duplicar). */
  updatedSharePaidUids: string[];
  /** true = todos os atletas do time já estão em `updatedSharePaidUids`. */
  fullyConfirmed: boolean;
}

/** O que muda em `sharePaidUids` ao confirmar UM atleta, e se isso fecha o time. */
export function planOrganizerShareConfirmation(params: {
  athleteUids: string[];
  data: Record<string, unknown>;
  athleteUid: string;
  teamSize: number;
}): OrganizerConfirmSharePlan {
  const updatedSharePaidUids = Array.from(
    new Set([...sharePaidUidsFromRegistration(params.data), params.athleteUid]),
  );
  return {
    updatedSharePaidUids,
    fullyConfirmed: isFreeRegistrationFullyConfirmed(
      params.athleteUids,
      updatedSharePaidUids,
      params.teamSize,
    ),
  };
}

/**
 * Trava a confirmação em bloco (sem `athleteUid`, "confirmar a inscrição inteira") quando já
 * existe pagamento parcial — algum atleta confirmado e outro não. Sem isso, o botão da
 * inscrição inteira reabriria o mesmo bug que a confirmação por atleta corrigiu: marcaria
 * como pago quem não pagou, só que pelo caminho em bloco em vez do individual.
 */
export function bulkConfirmBlockedByPartialShare(params: {
  athleteUids: string[];
  data: Record<string, unknown>;
  teamSize: number;
}): boolean {
  if (params.athleteUids.length <= 1) return false;
  const shares = sharePaidUidsFromRegistration(params.data);
  if (shares.length === 0) return false;
  return !isFreeRegistrationFullyConfirmed(
    params.athleteUids,
    shares,
    params.teamSize,
  );
}

/**
 * Fechamento por parcelas no webhook do PIX/cartão: o elenco inteiro está coberto quando cada
 * atleta pagou a parcela na plataforma OU teve baixa manual do organizador.
 *
 * Existe porque a baixa de UMA parcela não grava valor (`paidAmount`): se ela vem antes do
 * pagamento do parceiro, a conta só de dinheiro nunca alcança a taxa e a inscrição fica "não
 * paga" com todo mundo quitado. A declaração "Já paguei" (`sharePaidUids` sem baixa) fica de
 * fora de propósito — fechar por ela é decisão de regra ainda em aberto.
 */
export function registrationCoveredByPaidOrConfirmedShares(params: {
  athleteUids: string[];
  teamSize: number;
  /** Quem pagou a parcela pela plataforma, incluindo o pagador desta cobrança. */
  platformPaidUids: string[];
  organizerConfirmedUids: string[];
}): boolean {
  const covered = Array.from(
    new Set([...params.platformPaidUids, ...params.organizerConfirmedUids]),
  );
  return isFreeRegistrationFullyConfirmed(params.athleteUids, covered, params.teamSize);
}

export type ShareRevertBlock = "notConfirmedByOrganizer" | "alreadyFullyPaid";

export const SHARE_REVERT_BLOCK_MESSAGE: Record<ShareRevertBlock, string> = {
  notConfirmedByOrganizer:
    "Este atleta não tem confirmação manual do organizador para desfazer.",
  alreadyFullyPaid:
    "A inscrição já está totalmente paga — reverta a inscrição inteira.",
};

/** `null` = pode reverter a confirmação deste atleta específico. */
export function shareRevertBlock(
  data: Record<string, unknown>,
  athleteUid: string,
): ShareRevertBlock | null {
  if (data["isPaid"] === true) return "alreadyFullyPaid";
  if (!organizerConfirmedShareUidsFromRegistration(data).includes(athleteUid)) {
    return "notConfirmedByOrganizer";
  }
  return null;
}
