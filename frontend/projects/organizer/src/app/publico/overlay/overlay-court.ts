import { normalizeMatchType } from '../../painel/data/koc';
import type { TournamentMatch } from '../../painel/data/matches-repository';
import { courtNowOf } from '../../painel/telao/telao-selectors';
import type { MatchFinishMemory } from '../../painel/telao/telao-finished';
import { finalResultOf } from './overlay-final';

export interface OverlayCourtContext {
  match: TournamentMatch | null;
  categoryMatches: TournamentMatch[];
  totalRounds: number;
}

/** Final já encerrada nesta quadra — campeões ficam no ar pra sempre.
 *
 *  Diferente da celebração comum (30 s): o pódio é o clímax do torneio e a Browser Source
 *  do OBS costuma ficar aberta horas. Se a janela de fim expirasse, a tela ia pro "livre"
 *  ou pra próxima partida e o pódio sumia no ar. */
function finalEncerradaNaQuadra(
  matches: readonly TournamentMatch[],
  courtId: string,
): TournamentMatch | null {
  let escolhida: TournamentMatch | null = null;
  let maisRecente = -1;
  for (const m of matches) {
    if (m.courtId !== courtId) continue;
    if (!finalResultOf(m)) continue;
    const at = m.matchEndedAt?.getTime() ?? 0;
    if (at >= maisRecente) {
      maisRecente = at;
      escolhida = m;
    }
  }
  return escolhida;
}

/** Qual partida o overlay por QUADRA mostra agora, e o contexto de fase que as telas precisam.
 *
 *  A escolha em si é do `courtNowOf` do telão (ao vivo → recém-encerrada → próxima), já testado.
 *  O que mora aqui é a composição: sem partida na quadra, nada de contexto — categoria e total
 *  de uma partida que não está no ar só teriam como enganar a tela.
 *
 *  Exceção: final encerrada nesta quadra manda sempre. */
export function overlayCourtContextOf(
  matches: readonly TournamentMatch[],
  courtId: string,
  nowMs: number,
  finishMemory: ReadonlyMap<string, MatchFinishMemory>,
): OverlayCourtContext {
  const final = finalEncerradaNaQuadra(matches, courtId);
  const escolhida = final ?? courtNowOf(matches, courtId, nowMs, finishMemory).match;
  if (!escolhida) return { match: null, categoryMatches: [], totalRounds: 0 };

  const categoryMatches = matches.filter((m) => m.categoryId === escolhida.categoryId);
  const fase = normalizeMatchType(escolhida.matchType);
  return {
    match: escolhida,
    categoryMatches,
    totalRounds: categoryMatches.filter((m) => normalizeMatchType(m.matchType) === fase).length,
  };
}
