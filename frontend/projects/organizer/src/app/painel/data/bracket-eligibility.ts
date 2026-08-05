import type { TournamentInscription } from './inscriptions-repository';

/** Quantas duplas o servidor exige pra publicar uma chave — `generateCategoryBracket` recusa
 *  com "É necessário ao menos 2 equipes pagas" (`functions/src/organizer-category-ops.ts`). */
export const MIN_TEAMS_FOR_BRACKET = 2;

/** "Confirmada" no NexaGO = paga, fora da fila de espera e com dupla completa (inscrição solo
 *  esperando parceiro não entra na chave). O `teamId` é o que a geração usa como seed.
 *
 *  Mesmo filtro que o servidor aplica ao montar `paidTeamIds` — mora aqui pra a tela de Equipes
 *  (que decide se oferece o sorteio) e a de Gerar chave (que monta a lista de seeds) contarem a
 *  mesma coisa. */
export function isBracketEligible(inscription: TournamentInscription): boolean {
  return (
    inscription.paid &&
    inscription.paymentStatus !== 'waitlist' &&
    !inscription.partnerPending &&
    !!inscription.teamId
  );
}

/** Duplas confirmadas da lista — o número que o organizador vê antes de sortear. */
export function countBracketEligible(inscriptions: readonly TournamentInscription[]): number {
  return inscriptions.filter(isBracketEligible).length;
}
