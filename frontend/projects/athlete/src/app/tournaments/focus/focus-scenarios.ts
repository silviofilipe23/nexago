import { buildGroupStandings, matchIsCanceled, matchIsCompleted, type MatchSet, type TournamentMatch } from '../../data/matches-repository';
import { ordinalOf } from '../tournament-format';

export interface RoundScenario {
  outcome: 'win' | 'loss';
  /** Posição no grupo, ou `null` quando não é seguro afirmar. */
  rank: number | null;
  qualifies: boolean | null;
  text: string;
}

/** Placares plausíveis de uma vitória em melhor-de-3, do lado do atleta. O saldo de sets e de
 *  pontos difere entre eles, e é justamente essa diferença que pode mudar a classificação. */
const WIN_SCORES: readonly MatchSet[][] = [
  [{ a: 21, b: 15 }, { a: 21, b: 15 }],
  [{ a: 21, b: 15 }, { a: 15, b: 21 }, { a: 15, b: 10 }],
];

function mirror(sets: readonly MatchSet[]): MatchSet[] {
  return sets.map((s) => ({ a: s.b, b: s.a }));
}

/** Aplica um resultado hipotético à partida do atleta, preservando de que lado ele joga. */
function withHypotheticalResult(m: TournamentMatch, myTeamId: string, sets: readonly MatchSet[], iWin: boolean): TournamentMatch {
  const iAmA = m.teamAId === myTeamId;
  const oriented = iAmA ? sets : mirror(sets);
  const winnerId = iWin ? myTeamId : (iAmA ? m.teamBId : m.teamAId);
  return { ...m, status: 'completed', winnerId, sets: [...oriented], resultA: null, resultB: null };
}

function rankOf(matches: readonly TournamentMatch[], poolId: string, myTeamId: string): number | null {
  const index = buildGroupStandings(matches, poolId).findIndex((s) => s.teamId === myTeamId);
  return index < 0 ? null : index + 1;
}

/**
 * Cenários da rodada decisiva.
 *
 * Deliberadamente conservador, na mesma linha de `qualificationOf`: simula os placares
 * plausíveis e só afirma a posição quando TODOS levam ao mesmo lugar. Errar isso num app de
 * torneio — dizer "vencendo você é o 1º" e o atleta terminar em 2º por saldo — é pior que
 * dizer "depende do placar".
 *
 * Só roda quando a partida do atleta é a única pendente do grupo: com outra em aberto, quem
 * decide a posição é um resultado que ninguém controla.
 */
export function roundScenariosOf(
  matches: readonly TournamentMatch[],
  poolId: string,
  myTeamId: string | null,
  myMatchId: string,
  qualifiersPerGroup: number,
): RoundScenario[] {
  if (!poolId || !myTeamId) return [];
  const pool = matches.filter((m) => m.poolId === poolId);
  const mine = pool.find((m) => m.id === myMatchId);
  if (!mine || matchIsCompleted(mine) || matchIsCanceled(mine)) return [];

  const pending = pool.filter((m) => !matchIsCompleted(m) && !matchIsCanceled(m));
  const soleDecider = pending.length === 1 && pending[0]!.id === myMatchId;
  const others = matches.filter((m) => m.id !== myMatchId);

  return (['win', 'loss'] as const).map((outcome) => {
    if (!soleDecider) {
      return {
        outcome,
        rank: null,
        qualifies: null,
        text: outcome === 'win'
          ? 'Vencendo, sua posição depende do placar e dos outros jogos do grupo.'
          : 'Perdendo, sua posição depende do placar e dos outros jogos do grupo.',
      } satisfies RoundScenario;
    }

    const iWin = outcome === 'win';
    const ranks = WIN_SCORES.map((sets) =>
      rankOf([...others, withHypotheticalResult(mine, myTeamId, iWin ? sets : mirror(sets), iWin)], poolId, myTeamId),
    );
    const [first] = ranks;
    const invariant = first != null && ranks.every((r) => r === first);
    if (!invariant) {
      return {
        outcome,
        rank: null,
        qualifies: null,
        text: `${iWin ? 'Vencendo' : 'Perdendo'}, sua posição depende do placar.`,
      } satisfies RoundScenario;
    }

    const qualifies = first <= qualifiersPerGroup;
    return {
      outcome,
      rank: first,
      qualifies,
      text: `${iWin ? 'Vencendo' : 'Perdendo'}, você termina em ${ordinalOf(first)} do grupo${qualifies ? ' e avança' : ''}.`,
    } satisfies RoundScenario;
  });
}
