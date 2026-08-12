import { buildGroupStandings, matchIsCanceled, matchIsCompleted, type MatchSet, type TournamentMatch } from '../../data/matches-repository';
import { ordinalOf } from '../tournament-format';
import { isPending } from '../tournament-live.selectors';

export interface RoundScenario {
  outcome: 'win' | 'loss';
  /** Posição no grupo, ou `null` quando não é seguro afirmar. */
  rank: number | null;
  qualifies: boolean | null;
  text: string;
}

/** Os EXTREMOS de uma vitória em melhor-de-3, do lado do atleta — não uma amostra qualquer.
 *
 *  A posição na tabela é monótona no saldo de sets e no de pontos: ganhar mais sets, ou mais
 *  pontos, só pode melhorar ou manter a colocação. Logo, se o melhor e o pior resultado
 *  possíveis de um desfecho dão a MESMA posição, todo resultado legal no meio dá também — é
 *  por isso que bastam duas simulações, desde que sejam os limites. Duas escalas quaisquer do
 *  meio do intervalo não provam nada: o desempate por saldo de pontos é contínuo.
 *
 *  A segunda entrada parece estranha de propósito: o mínimo lexicográfico de uma vitória por
 *  2-1 NÃO é o placar de margens apertadas em todo set — é aquele em que o atleta fecha os dois
 *  sets que precisa pelo fio da navalha, mas PERDE o set do meio (que não conta pro resultado)
 *  do jeito mais feio possível, porque o critério seguinte ao saldo de sets é o saldo de pontos,
 *  e `0–21` é o pior saldo legal que esse set pode contribuir. Trocar isso por um `19–21`
 *  "realista" volta a deixar o mínimo fora do array e reintroduz afirmações falsas — o
 *  contra-exemplo executado (`x` bate `y` 21-19/9-21/15-5) derruba a garantia em ~4% dos
 *  grupos simulados. */
const WIN_BOUNDS: readonly MatchSet[][] = [
  // Vitória mais folgada possível: 2-0 com saldo máximo.
  [{ a: 21, b: 0 }, { a: 21, b: 0 }],
  // Vitória mais apertada possível em sets ganhos, mas com o PIOR saldo de pontos legal: os dois
  // sets que fecham o jogo no fio (21-19 e 15-13), e o set do meio perdido 0-21 — gameDiff = -17,
  // o verdadeiro mínimo de um 2-1. Ver o porquê acima.
  [{ a: 21, b: 19 }, { a: 0, b: 21 }, { a: 15, b: 13 }],
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
 * Deliberadamente conservador, na mesma linha de `qualificationOf`: simula os EXTREMOS de cada
 * desfecho (ver `WIN_BOUNDS`) e só afirma a posição quando os dois levam ao mesmo lugar — a
 * monotonicidade do desempate garante que, nesse caso, todo placar legal no meio também leva.
 * Errar isso num app de torneio — dizer "vencendo você é o 1º" e o atleta terminar em 2º por
 * saldo — é pior que dizer "depende do placar".
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
  // O atleta precisa jogar essa partida — senão o placar hipotético seria aplicado a duas
  // duplas que não são a dele.
  if (mine.teamAId !== myTeamId && mine.teamBId !== myTeamId) return [];

  const pending = pool.filter(isPending);
  const soleDecider = pending.length === 1 && pending[0]!.id === myMatchId;

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
    // Só os dois EXTREMOS de WIN_BOUNDS — a monotonicidade do desempate garante que, se ambos
    // derem a mesma posição, todo placar legal no meio também dá (ver doc da função).
    const ranks = WIN_BOUNDS.map((bound) => {
      const oriented = iWin ? bound : mirror(bound);
      // Substitui em vez de remover-e-reanexar: `buildGroupStandings` semeia seu mapa na ordem
      // de iteração das partidas e o `sort` é estável, então a ordem de inserção é o desempate
      // de ÚLTIMO recurso entre duplas empatadas em tudo o mais. Mover a partida do atleta para
      // o fim mudaria esse desempate na simulação em relação à tabela real.
      const simulated = matches.map((m) => (m.id === myMatchId ? withHypotheticalResult(mine, myTeamId, oriented, iWin) : m));
      return rankOf(simulated, poolId, myTeamId);
    });
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
