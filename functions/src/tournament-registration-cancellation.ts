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

export type TeamDeletionBlockReason =
  | "noTeam"
  | "otherRegistrations"
  | "registrationPaid"
  | "teamPaidBefore"
  | "teamHasMatches";

/**
 * Pode apagar o doc de equipe junto com esta inscrição? `null` = pode.
 *
 * `shouldDeleteTeamOnCancellation` sozinho responde só "outra inscrição aponta
 * pra ela?". A trava de pagamento vivia no CHAMADOR: `releaseRegistration` só
 * é alcançável quando não há pagamento nenhum (`registrationCancellationBlockReason`
 * barra antes), então lá o predicado bastava. Nos dois caminhos do organizador
 * a invariante não existe — `organizerRemoveFromCategory` aceita inscrição paga
 * (calcula reembolso) e o pedido de cancelamento ao organizador SÓ existe para
 * inscrição paga. Esta função traz a trava para dentro, onde não dá para
 * esquecer dela.
 *
 * Equipe que pagou é história: tem partida, ponto no ranking, seguidor e perfil
 * público. Some o doc, some tudo isso — e as partidas ficam apontando pro nada.
 */
export function teamDeletionBlockReason(params: {
  teamId: string;
  /** Ids de TODAS as inscrições que referenciam a equipe. */
  referencingRegistrationIds: string[];
  cancellingRegistrationId: string;
  /** A inscrição sendo cancelada. */
  registration: Record<string, unknown>;
  /** O doc da equipe, quando existe. */
  team: Record<string, unknown> | null;
  /** A equipe aparece em alguma partida (chave já publicada). */
  teamHasMatches: boolean;
}): TeamDeletionBlockReason | null {
  if (!params.teamId.trim()) return "noTeam";
  if (
    !shouldDeleteTeamOnCancellation(
      params.teamId,
      params.referencingRegistrationIds,
      params.cancellingRegistrationId,
    )
  ) {
    return "otherRegistrations";
  }
  // Qualquer dinheiro nesta inscrição — inclusive a parcela de um atleta só —
  // já faz a equipe ter existido.
  if (registrationCancellationBlockReason(params.registration) != null) {
    return "registrationPaid";
  }
  // Inscrição ANTERIOR paga: o doc dela pode nem existir mais, mas o carimbo
  // fica na equipe para sempre.
  if (params.team?.registrationPaid === true) return "teamPaidBefore";
  // Chave publicada com equipe não paga: apagar deixa a partida órfã.
  if (params.teamHasMatches) return "teamHasMatches";
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
