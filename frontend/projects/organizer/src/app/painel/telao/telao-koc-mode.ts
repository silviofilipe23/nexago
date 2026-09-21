import type { TournamentMatch } from '../data/matches-repository';
import { isKingOfCourtMatchType } from '../data/koc';
import { finishedAtOf, type MatchFinishMemory } from './telao-finished';

/** Vitrine da rodada KOTC no telão depois do apito final — mais curta que a
 *  Grande Final: o público quer ver o resultado e a grade/próxima rodada. */
export const KOC_FINISHED_SHOWCASE_MS = 45_000;

export interface KocShowcase {
  match: TournamentMatch;
  state: 'live' | 'finished';
}

/** Rodada King of the Court que assume a tela inteira: ao vivo (a que começou
 *  por último) → senão a recém-encerrada dentro da janela de vitrine. Só
 *  quadras selecionadas no telão. */
export function kocShowcaseOf(
  matches: readonly TournamentMatch[],
  courtIds: readonly string[],
  nowMs: number,
  finishMemory: ReadonlyMap<string, MatchFinishMemory>,
): KocShowcase | null {
  const courts = new Set(courtIds);
  const rounds = matches.filter(
    (m) => isKingOfCourtMatchType(m.matchType) && m.koc != null && courts.has(m.courtId),
  );

  const live = rounds
    .filter((m) => m.status === 'in_progress')
    .sort((a, b) => (b.matchStartedAt?.getTime() ?? 0) - (a.matchStartedAt?.getTime() ?? 0))[0];
  if (live) return { match: live, state: 'live' };

  const finished = rounds
    .filter((m) => m.status === 'completed')
    .map((m) => ({ m, at: finishedAtOf(finishMemory, m.id) }))
    .filter((x): x is { m: TournamentMatch; at: number } => x.at != null && nowMs - x.at < KOC_FINISHED_SHOWCASE_MS)
    .sort((a, b) => b.at - a.at)[0];
  if (finished) return { match: finished.m, state: 'finished' };

  return null;
}
