import { byRelevance } from '../../../../lib/firestore/tournaments';
import type { TournamentSummary } from '../../../../lib/firestore/types';

/** `getTournamentById` devolve `null` pra id apagado/despublicado — filtra sem remover do
 *  `localStorage` (pode voltar a existir) e ordena com o mesmo critério de `/torneios`. */
export function visibleFollowedTournaments(
  results: readonly (TournamentSummary | null)[],
): TournamentSummary[] {
  return results.filter((t): t is TournamentSummary => t !== null).sort(byRelevance);
}
