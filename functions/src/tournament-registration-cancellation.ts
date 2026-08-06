/**
 * Lógica pura do cancelamento de inscrição pelo atleta.
 * Efeitos (Firestore, Asaas, notificações) ficam na callable
 * `cancelTournamentRegistration` em tournament-partner-invite.ts.
 */
import {sharePaidUidsFromRegistration} from "./tournament-registration-pix-helpers";

export type RegistrationCancellationBlockReason = "paid" | "partialPayment";

export const REGISTRATION_CANCELLATION_BLOCK_MESSAGES: Record<
  RegistrationCancellationBlockReason,
  string
> = {
  paid:
    "Inscrição já confirmada não pode ser cancelada por aqui. " +
    "Fale com o organizador.",
  partialPayment:
    "Já existe pagamento nesta inscrição. Fale com o organizador.",
};

/**
 * Só inscrição SEM nenhum pagamento pode ser cancelada pelo atleta: confirmada
 * (`isPaid`) ou com parcela paga (`sharePaidUids`/`paidAmount`) exigiria
 * estorno, que não existe nesta versão.
 */
export function registrationCancellationBlockReason(
  registration: Record<string, unknown>,
): RegistrationCancellationBlockReason | null {
  if (registration.isPaid === true) return "paid";
  if (sharePaidUidsFromRegistration(registration).length > 0) {
    return "partialPayment";
  }
  if ((Number(registration.paidAmount) || 0) > 0) return "partialPayment";
  return null;
}

/** A equipe só morre junto se nenhuma OUTRA inscrição a referencia. */
export function shouldDeleteTeamOnCancellation(
  teamId: string,
  referencingRegistrationIds: string[],
  cancellingRegistrationId: string,
): boolean {
  if (!teamId.trim()) return false;
  return referencingRegistrationIds.every(
    (id) => id === cancellingRegistrationId,
  );
}

/**
 * Convites pendentes que morrem com a inscrição: os anexados a ela e os
 * avulsos (pré-reserva) enviados pelo cancelador na mesma categoria.
 */
export function inviteMatchesCancelledRegistration(
  invite: Record<string, unknown>,
  params: {registrationId: string; cancellerUid: string; categoryId: string},
): boolean {
  const attachId =
    (invite.attachRegistrationId as string | undefined)?.trim() ?? "";
  if (attachId) return attachId === params.registrationId;
  const inviter = (invite.inviterUid as string | undefined)?.trim() ?? "";
  return (
    inviter === params.cancellerUid && invite.categoryId === params.categoryId
  );
}

/** Trilha para disputas de suporte — gravada antes do hard delete. */
export function buildRegistrationCancellationAudit(params: {
  registrationId: string;
  cancelledBy: string;
  athleteUids: string[];
  registration: Record<string, unknown>;
}): Record<string, unknown> {
  const reg = params.registration;
  return {
    registrationId: params.registrationId,
    tournamentId: (reg.tournamentId as string | undefined)?.trim() ?? "",
    categoryId: (reg.categoryId as string | undefined)?.trim() ?? "",
    cancelledBy: params.cancelledBy,
    participantUids: params.athleteUids,
    registrationSnapshot: reg,
  };
}
