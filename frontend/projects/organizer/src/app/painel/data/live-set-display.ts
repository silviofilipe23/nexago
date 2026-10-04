import {
  effectiveScoringProfile,
  gamesPointLabels,
  isSuperTiebreakSet,
  isTiebreakInProgress,
  setScoreText,
  setWinnerSide,
  type ScoringProfile,
} from '@nexago/sports';
import type { TournamentMatch } from './matches-repository';

/** Porte de `matchLiveCurrentSet`/`matchSetWins`/`matchClosedSets` do portal do ATLETA
 *  (`projects/athlete/src/app/data/matches-repository.ts:239-284`) pro contrato do organizer
 *  (status normalizado, `bestOf` nunca nulo, sem caminho legado `resultA/resultB` — o telão só
 *  mostra partidas ao vivo/agendadas). Unifica os dois escritores de placar ao vivo: a mesa
 *  ponto a ponto mantém o set corrente DENTRO de `sets[]` + `currentSetIndex`; o lançamento
 *  rápido (`updateLiveMatchScore`) publica só o agregado `liveScore.currentGames*`. */

export type LiveScoreFields = Pick<TournamentMatch, 'status' | 'sets' | 'liveScore' | 'currentSetIndex' | 'bestOf' | 'scoringProfile' | 'currentGame'>;

export interface LiveSetScore {
  /** Número do set exibido (1-based, contando só os fechados antes dele). */
  setNumber: number;
  a: number;
  b: number;
  /** Partida de games, vindo da mesa: placar do game em andamento como o painel mostra
   *  (0/15/30/40/AD, ou os pontos do tie-break). Ausente em partida de pontos. */
  game?: { a: string; b: string };
  /** Partida de games: o set corrente está num tie-break (normal ou super). */
  tiebreak?: boolean;
}

/** Perfil efetivo da partida: o carimbo com o nº de sets do doc; sem carimbo, a regra histórica. */
function profileOf(m: LiveScoreFields): ScoringProfile {
  return effectiveScoringProfile(m.scoringProfile, m.bestOf);
}

function setClosed(m: LiveScoreFields, index: number): boolean {
  return setWinnerSide(m.sets, index, profileOf(m)) !== null;
}

/** Sets fechados — ao vivo, exclui o set em andamento que a mesa mantém dentro de `sets[]`;
 *  encerrada, todo set vale (dados históricos podem fugir da regra e continuam contando). */
export function matchClosedSets(m: LiveScoreFields): TournamentMatch['sets'] {
  if (m.status !== 'in_progress') return m.sets;
  return m.sets.filter((_, i) => setClosed(m, i));
}

/** Sets ganhos por lado — `sets[]` quando existe, senão o agregado `liveScore`. */
export function matchSetWins(m: LiveScoreFields): [number, number] {
  if (m.sets.length > 0) {
    const closed = matchClosedSets(m);
    return [closed.filter((s) => s.a > s.b).length, closed.filter((s) => s.b > s.a).length];
  }
  return m.liveScore ? [m.liveScore.setsA, m.liveScore.setsB] : [0, 0];
}

/** Pontos do set em andamento de uma partida ao vivo. A mesa tem prioridade (é o detalhe
 *  real); devolve `null` fora do ao vivo ou entre sets (corrente ainda sem ponto gravado). */
export function matchLiveCurrentSet(m: LiveScoreFields): LiveSetScore | null {
  if (m.status !== 'in_progress') return null;
  if (m.sets.length > 0) {
    const profile = profileOf(m);
    const idx = Math.min(Math.max(m.currentSetIndex ?? m.sets.length - 1, 0), profile.bestOf - 1);
    const s = m.sets[idx];
    if (s && !setClosed(m, idx)) {
      const score: LiveSetScore = { setNumber: matchClosedSets(m).length + 1, a: s.a, b: s.b };
      if (profile.kind !== 'sets_games') return score;
      const state = { sets: m.sets, currentSetIndex: idx, currentGame: m.currentGame ?? { a: 0, b: 0 }, servingTeamId: '' };
      return { ...score, game: gamesPointLabels(state, profile), tiebreak: isTiebreakInProgress(state, profile) };
    }
    // Sem set aberto dentro de sets[] (todos fechados) — o corrente, se houver, está no
    // agregado `liveScore` (fluxo do lançamento rápido: sets fechados + currentGames).
  }
  const live = m.liveScore;
  if (!live) return null;
  const setNumber = m.sets.length > 0 ? matchClosedSets(m).length + 1 : live.setsA + live.setsB + 1;
  return { setNumber, a: live.currentGamesA, b: live.currentGamesB };
}

/** Sets fechados como texto, como as telas mostram: "21-15", "6-4", "7-6 (7-4)"; o super
 *  tie-break mostra os pontos dele ("10-8"), não o 1×0 gravado. */
export function closedSetTexts(m: LiveScoreFields): string[] {
  const profile = profileOf(m);
  return matchClosedSets(m).map((s, i) => setScoreText(profile, i, s));
}

/** Sets fechados em números de coluna (um por lado): o super tie-break entra com os pontos
 *  dele; o resto, como gravado. */
export function closedSetColumns(m: LiveScoreFields): Array<{ a: number; b: number }> {
  const profile = profileOf(m);
  return matchClosedSets(m).map((s, i) =>
    profile.kind === 'sets_games' && s.tb && isSuperTiebreakSet(profile, i) ? { a: s.tb.a, b: s.tb.b } : { a: s.a, b: s.b },
  );
}

/** Número grande de um lado no set em andamento: o ponto do game (games) ou os pontos do set. */
export function livePointsOf(current: LiveSetScore, side: 'A' | 'B'): string | number {
  if (current.game) return side === 'A' ? current.game.a : current.game.b;
  return side === 'A' ? current.a : current.b;
}
