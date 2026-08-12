import { matchClosedSets, matchIsCompleted, type TournamentMatch } from '../../data/matches-repository';
import type { TournamentPrize } from '../../data/tournaments-repository';
import { isDoubleElimination } from '../bracket-tree';
import { sideOf } from '../tournament-live.selectors';

/** Uma barra do gráfico "você × adversário": um set de uma partida do atleta. */
export interface SetBar {
  label: string;
  mine: number;
  theirs: number;
}

export interface TournamentNumbers {
  matches: number;
  setsWon: number;
  setsLost: number;
  points: number;
  pointsAgainst: number;
  pointsPerSet: number;
  sets: SetBar[];
}

/** Fases de mata-mata da categoria, da mais distante da final para a final. */
function knockoutRounds(matches: readonly TournamentMatch[], categoryId: string): number[] {
  const rounds = matches
    .filter((m) => m.categoryId === categoryId && !m.poolId && !m.isGroupMatch)
    .map((m) => m.round);
  return [...new Set(rounds)].sort((a, b) => a - b);
}

/**
 * Quantas vitórias separam o atleta do título.
 *
 * `null` quando a chave ainda não foi sorteada — nesse caso a manchete some em vez de chutar.
 * Também `null` em dupla eliminação: lá o caminho depende da chave em que o atleta está e a
 * contagem simples de fases mentiria.
 */
export function winsToTitleOf(matches: readonly TournamentMatch[], categoryId: string, myTeamIds: ReadonlySet<string>): number | null {
  const rounds = knockoutRounds(matches, categoryId);
  if (rounds.length === 0) return null;
  if (isDoubleElimination(matches.filter((m) => m.categoryId === categoryId))) return null;

  const myPending = matches
    .filter((m) => m.categoryId === categoryId && !m.poolId && !m.isGroupMatch && sideOf(m, myTeamIds) !== null && !matchIsCompleted(m))
    .map((m) => m.round)
    .sort((a, b) => a - b);

  // Já dentro do mata-mata: conta da fase pendente dele em diante. Ainda nos grupos: todas.
  const from = myPending[0];
  if (from == null) return rounds.length;
  const index = rounds.indexOf(from);
  return index < 0 ? rounds.length : rounds.length - index;
}

/** Sets e pontos do atleta nas partidas já encerradas — tudo derivado de `sets[]`. */
export function tournamentNumbersOf(matches: readonly TournamentMatch[], myTeamIds: ReadonlySet<string>): TournamentNumbers {
  const mine = matches.filter((m) => sideOf(m, myTeamIds) !== null && matchIsCompleted(m));
  const bars: SetBar[] = [];
  let setsWon = 0;
  let setsLost = 0;
  let points = 0;
  let pointsAgainst = 0;

  mine.forEach((m, matchIndex) => {
    const iAmA = sideOf(m, myTeamIds) === 'A';
    matchClosedSets(m).forEach((s, setIndex) => {
      const my = iAmA ? s.a : s.b;
      const their = iAmA ? s.b : s.a;
      if (my > their) setsWon++;
      else if (their > my) setsLost++;
      points += my;
      pointsAgainst += their;
      bars.push({ label: `P${matchIndex + 1} · S${setIndex + 1}`, mine: my, theirs: their });
    });
  });

  return {
    matches: mine.length,
    setsWon,
    setsLost,
    points,
    pointsAgainst,
    pointsPerSet: bars.length > 0 ? Math.round((points / bars.length) * 10) / 10 : 0,
    sets: bars,
  };
}

/** A melhor premiação que a campanha atual já garante — `bestPossiblePlace` é a pior colocação
 *  possível a partir daqui (ex.: quem está na final termina no máximo em 2º). */
export function guaranteedPrizeOf(prizes: readonly TournamentPrize[], bestPossiblePlace: number): TournamentPrize | null {
  return [...prizes].sort((a, b) => a.position - b.position).find((p) => p.position >= bestPossiblePlace) ?? null;
}
