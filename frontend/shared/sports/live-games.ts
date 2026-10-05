/**
 * `@nexago/sports` — motor da mesa ao vivo para partidas de games (spec multiesporte,
 * fase 2b2): pontos do game (0/15/30/40/AD ou sem vantagem), tie-break, super tie-break
 * no set decisivo e saque alternando por game. Puro: a escrita no doc e o snapshot do
 * desfazer ficam no repositório da mesa. A MESMA lógica vive em
 * `nexago_app/lib/core/sports/live_games.dart`; `liveVectors` em
 * `sports/scoring-vectors.json` provam a paridade.
 */
import {
  isPointsSetWon,
  isSuperTiebreakSet,
  matchWinnerSide,
  setWinnerSide,
  type ScoreSet,
  type SetsGamesProfile,
} from './scoring';

/** Pontos do game em andamento (ou do tie-break, quando o set está nele). */
export interface GamePoints {
  a: number;
  b: number;
}

export interface GamesLiveState<S extends ScoreSet = ScoreSet> {
  sets: S[];
  currentSetIndex: number;
  currentGame: GamePoints;
  /** `''` = ninguém com o saque (a mesa pergunta). */
  servingTeamId: string;
}

/** O que um ponto fechou: nada, um game, um set ou a partida. */
export type GamesClosed = 'none' | 'game' | 'set' | 'match';

export interface GamesPointResult<S extends ScoreSet = ScoreSet> extends GamesLiveState<S> {
  winnerSide: 'A' | 'B' | null;
  closed: GamesClosed;
}

interface Teams {
  teamAId: string;
  teamBId: string;
}

const TIEBREAK_WIN_BY = 2;
const GAME_POINT_NAMES = ['0', '15', '30', '40'];

function clampSetIndex(index: number, bestOf: number): number {
  return Math.min(Math.max(index, 0), bestOf - 1);
}

/** Troca o sacador; sem sacador (ou id que não é de nenhuma equipe) continua sem. */
function otherTeam(servingTeamId: string, teams: Teams): string {
  if (servingTeamId === teams.teamAId) return teams.teamBId;
  if (servingTeamId === teams.teamBId) return teams.teamAId;
  return '';
}

/** O set corrente está num tie-break (normal em `tiebreakAtGames`×`tiebreakAtGames`, ou o
 *  super tie-break do set decisivo). */
export function isTiebreakInProgress(state: GamesLiveState, profile: SetsGamesProfile): boolean {
  const idx = clampSetIndex(state.currentSetIndex, profile.bestOf);
  if (isSuperTiebreakSet(profile, idx)) return true;
  const s = state.sets[idx];
  const tbAt = profile.tiebreakAtGames;
  return tbAt !== null && s != null && s.a === tbAt && s.b === tbAt;
}

export function applyGamesPoint<S extends ScoreSet>(
  state: GamesLiveState<S>,
  side: 'A' | 'B',
  profile: SetsGamesProfile,
  teams: Teams,
): GamesPointResult<S> {
  const idx = clampSetIndex(state.currentSetIndex, profile.bestOf);
  const sets = state.sets.map((s) => ({ ...s })) as S[];
  while (sets.length <= idx) sets.push({ a: 0, b: 0 } as S);
  const cur = sets[idx]!;
  const isA = side === 'A';
  const game: GamePoints = { a: state.currentGame.a + (isA ? 1 : 0), b: state.currentGame.b + (isA ? 0 : 1) };
  let serving = state.servingTeamId;

  const superTiebreak = isSuperTiebreakSet(profile, idx);
  const tbAt = profile.tiebreakAtGames;
  const tiebreak = superTiebreak || (tbAt !== null && cur.a === tbAt && cur.b === tbAt);

  if (tiebreak) {
    const target = superTiebreak ? profile.superTiebreakTo : profile.tiebreakTo;
    if (!isPointsSetWon(game.a, game.b, target, TIEBREAK_WIN_BY, null)) {
      // No tie-break o saque troca depois do 1º ponto e, daí em diante, a cada 2.
      if ((game.a + game.b) % 2 === 1) serving = otherTeam(serving, teams);
      return { sets, currentSetIndex: idx, currentGame: game, servingTeamId: serving, winnerSide: null, closed: 'none' };
    }
    const winnerA = game.a > game.b;
    sets[idx] = superTiebreak
      ? ({ ...cur, a: winnerA ? 1 : 0, b: winnerA ? 0 : 1, tb: { ...game } } as S)
      : ({ ...cur, a: cur.a + (winnerA ? 1 : 0), b: cur.b + (winnerA ? 0 : 1), tb: { ...game } } as S);
  } else {
    const reached = game.a >= 4 || game.b >= 4;
    const gameWon = profile.noAd ? reached : reached && Math.abs(game.a - game.b) >= 2;
    if (!gameWon) {
      return { sets, currentSetIndex: idx, currentGame: game, servingTeamId: serving, winnerSide: null, closed: 'none' };
    }
    const winnerA = game.a > game.b;
    sets[idx] = { ...cur, a: cur.a + (winnerA ? 1 : 0), b: cur.b + (winnerA ? 0 : 1) } as S;
    serving = otherTeam(serving, teams);
  }

  const zero: GamePoints = { a: 0, b: 0 };
  if (setWinnerSide(sets, idx, profile) === null) {
    return { sets, currentSetIndex: idx, currentGame: zero, servingTeamId: serving, winnerSide: null, closed: 'game' };
  }
  const matchWinner = matchWinnerSide(sets, profile);
  if (matchWinner !== null) {
    return { sets, currentSetIndex: idx, currentGame: zero, servingTeamId: serving, winnerSide: matchWinner, closed: 'match' };
  }
  // Virada de set: quem abre o próximo não sai do placar — a mesa volta a perguntar.
  return {
    sets,
    currentSetIndex: clampSetIndex(idx + 1, profile.bestOf),
    currentGame: zero,
    servingTeamId: '',
    winnerSide: null,
    closed: 'set',
  };
}

/** Placar do game em andamento como o painel mostra: 0/15/30/40/AD, ou os pontos do tie-break. */
export function gamesPointLabels(state: GamesLiveState, profile: SetsGamesProfile): { a: string; b: string } {
  const g = state.currentGame;
  if (isTiebreakInProgress(state, profile)) return { a: String(g.a), b: String(g.b) };
  if (!profile.noAd && g.a >= 3 && g.b >= 3) {
    if (g.a === g.b) return { a: '40', b: '40' };
    return g.a > g.b ? { a: 'AD', b: '40' } : { a: '40', b: 'AD' };
  }
  return { a: GAME_POINT_NAMES[Math.min(g.a, 3)]!, b: GAME_POINT_NAMES[Math.min(g.b, 3)]! };
}

const CLOSED_RANK: Record<GamesClosed, number> = { none: 0, game: 1, set: 2, match: 3 };

/** "match point", "set point", "game point", "tie-break", "super tie-break" ou `null`. */
export function gamesLiveHint(state: GamesLiveState, profile: SetsGamesProfile, teams: Teams): string | null {
  const best = Math.max(
    CLOSED_RANK[applyGamesPoint(state, 'A', profile, teams).closed],
    CLOSED_RANK[applyGamesPoint(state, 'B', profile, teams).closed],
  );
  if (best === 3) return 'match point';
  if (best === 2) return 'set point';
  if (best === 1) return 'game point';
  if (isTiebreakInProgress(state, profile)) {
    return isSuperTiebreakSet(profile, clampSetIndex(state.currentSetIndex, profile.bestOf)) ? 'super tie-break' : 'tie-break';
  }
  return null;
}

/** Bandeira do canto do painel: o próximo ponto daquele lado fecha o set — ou a partida. */
export function gamesFlag(state: GamesLiveState, profile: SetsGamesProfile, teams: Teams, side: 'A' | 'B'): 'set' | 'match' | null {
  const closed = applyGamesPoint(state, side, profile, teams).closed;
  if (closed === 'match') return 'match';
  if (closed === 'set') return 'set';
  return null;
}
