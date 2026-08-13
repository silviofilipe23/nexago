import {
  buildGroupStandings,
  matchBestOf,
  matchIsCanceled,
  matchIsCompleted,
  setTargetPointsOf,
  MIN_ADVANTAGE,
  type MatchSet,
  type TournamentMatch,
} from '../../data/matches-repository';
import { ordinalOf } from '../tournament-format';
import { isPending } from '../tournament-live.selectors';

export interface RoundScenario {
  outcome: 'win' | 'loss';
  /** Posição no grupo, ou `null` quando não é seguro afirmar. */
  rank: number | null;
  qualifies: boolean | null;
  text: string;
}

/**
 * Os EXTREMOS de uma vitória em `bestOf` sets, do lado do atleta — CALCULADOS a partir do
 * formato da partida, não uma constante fixa. O app oferece melhor-de-1, -3 e -5
 * (`TournamentBestOf`, ver o wizard do organizador), e o intervalo de saldo de pontos legal de
 * um MD5 é bem mais largo que o de um MD3 — reaproveitar as constantes de um formato menor pro
 * maior reintroduz, um degrau acima, o exato defeito que este arquivo existe pra evitar (ver o
 * histórico: primeiro amostras internas em vez de extremos, depois um "extremo" que não era o
 * mínimo de verdade). Por isso os limites vêm de `setTargetPointsOf`/`MIN_ADVANTAGE`
 * (`data/matches-repository.ts`) — a mesma régua que decide o alvo de cada set no resto do
 * app — em vez de números escritos à mão.
 *
 * A posição na tabela é monótona no saldo de sets e no de pontos: ganhar mais sets, ou mais
 * pontos, só pode melhorar ou manter a colocação. Logo, se o melhor e o pior resultado
 * possíveis de um desfecho dão a MESMA posição, todo resultado legal no meio dá também — é por
 * isso que bastam duas simulações, desde que sejam os limites de verdade.
 *
 * O limite de baixo (`narrowest`) parece estranho de propósito: o mínimo lexicográfico de uma
 * vitória por `setsToWin` a `setsToWin - 1` NÃO é o placar de margens apertadas em todo set — é
 * aquele em que o atleta fecha pelo fio da navalha os sets que precisa vencer, mas PERDE os sets
 * que não precisa vencer (não contam pro resultado, só pro saldo de pontos) do jeito mais feio
 * possível, com o placar zerado do lado dele. O set que fecha o jogo (o último, indo até o fim)
 * é sempre uma vitória do atleta — é ele quem termina a partida — então nunca entra como "set
 * perdido" aqui. Trocar isso por margens apertadas em TODO set "porque parece mais realista"
 * volta a deixar o mínimo fora do array: o contra-exemplo executado que expôs esse bug pra MD3
 * (`x` bate `y` 21-19/9-21/15-5) derrubava a garantia em ~4% dos grupos simulados; o mesmo
 * defeito, sem essa conta, reaparece em MD5 com uma faixa ainda mais larga de saldo de pontos.
 */
export function winBoundsOf(bestOf: number): readonly MatchSet[][] {
  // `bestOf` chega cru do documento do Firestore (`matchBestOf` só cai pro padrão com valores <=
  // 0 — nada trava o topo). Um documento malformado ou editado à mão com um número gigante
  // alocaria arrays proporcionais a ele e travaria a aba; trava no maior formato que o app
  // realmente oferece (MD5).
  const clampedBestOf = Math.min(bestOf, 5);
  const setsToWin = Math.ceil(clampedBestOf / 2);
  const setsToLose = setsToWin - 1;
  const totalSets = setsToWin + setsToLose;
  const deciderIndex = totalSets - 1;

  // Vence tudo, perde nada: maximiza o saldo de sets primeiro, e dentro disso o saldo de pontos
  // (adversário zerado em cada set).
  const widest: MatchSet[] = [];
  for (let i = 0; i < setsToWin; i++) {
    widest.push({ a: setTargetPointsOf(i, clampedBestOf), b: 0 });
  }

  // Vence o mínimo pra fechar o jogo, indo até o fim: os `setsToLose` sets que não decidem nada
  // saem zerados do lado do atleta; os `setsToWin` que precisa vencer (incluindo sempre o
  // decisivo) saem pela margem legal mínima.
  const narrowest: MatchSet[] = [];
  let remainingLosses = setsToLose;
  for (let i = 0; i < totalSets; i++) {
    const target = setTargetPointsOf(i, clampedBestOf);
    if (i !== deciderIndex && remainingLosses > 0) {
      narrowest.push({ a: 0, b: target });
      remainingLosses--;
    } else {
      narrowest.push({ a: target, b: target - MIN_ADVANTAGE });
    }
  }

  return [widest, narrowest];
}

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
 * desfecho (ver `winBoundsOf`, calculado a partir do `bestOf` da própria partida) e só afirma a
 * posição quando os dois levam ao mesmo lugar — a monotonicidade do desempate garante que,
 * nesse caso, todo placar legal no meio também leva. Errar isso num app de torneio — dizer
 * "vencendo você é o 1º" e o atleta terminar em 2º por saldo — é pior que dizer "depende do
 * placar".
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
    // Só os dois EXTREMOS de winBoundsOf, derivados do bestOf desta partida — a monotonicidade
    // do desempate garante que, se ambos derem a mesma posição, todo placar legal no meio
    // também dá (ver doc da função).
    const ranks = winBoundsOf(matchBestOf(mine)).map((bound) => {
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
