import { normalizeMatchType } from '../../painel/data/koc';
import type { TournamentMatch } from '../../painel/data/matches-repository';
import { courtNowOf } from '../../painel/telao/telao-selectors';
import type { MatchFinishMemory } from '../../painel/telao/telao-finished';

export interface OverlayCourtContext {
  match: TournamentMatch | null;
  categoryMatches: TournamentMatch[];
  totalRounds: number;
}

/** Qual partida o overlay por QUADRA mostra agora, e o contexto de fase que as telas precisam.
 *
 *  A escolha em si é do `courtNowOf` do telão (ao vivo → recém-encerrada → próxima), já testado.
 *  O que mora aqui é a composição: sem partida na quadra, nada de contexto — categoria e total
 *  de uma partida que não está no ar só teriam como enganar a tela. */
export function overlayCourtContextOf(
  matches: readonly TournamentMatch[],
  courtId: string,
  nowMs: number,
  finishMemory: ReadonlyMap<string, MatchFinishMemory>,
): OverlayCourtContext {
  const escolhida = courtNowOf(matches, courtId, nowMs, finishMemory).match;
  if (!escolhida) return { match: null, categoryMatches: [], totalRounds: 0 };

  const categoryMatches = matches.filter((m) => m.categoryId === escolhida.categoryId);
  const fase = normalizeMatchType(escolhida.matchType);
  return {
    match: escolhida,
    categoryMatches,
    totalRounds: categoryMatches.filter((m) => normalizeMatchType(m.matchType) === fase).length,
  };
}
