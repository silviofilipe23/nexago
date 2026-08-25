import { isSetWon, targetPointsForSet } from '@nexago/live-scoring';
import type { TournamentMatch } from './matches-repository';

/** Porte de `matchLiveCurrentSet`/`matchSetWins`/`matchClosedSets` do portal do ATLETA
 *  (`projects/athlete/src/app/data/matches-repository.ts:239-284`) pro contrato do organizer
 *  (status normalizado, `bestOf` nunca nulo, sem caminho legado `resultA/resultB` — o telão só
 *  mostra partidas ao vivo/agendadas). Unifica os dois escritores de placar ao vivo: a mesa
 *  ponto a ponto mantém o set corrente DENTRO de `sets[]` + `currentSetIndex`; o lançamento
 *  rápido (`updateLiveMatchScore`) publica só o agregado `liveScore.currentGames*`. */

export type LiveScoreFields = Pick<TournamentMatch, 'status' | 'sets' | 'liveScore' | 'currentSetIndex' | 'bestOf'>;

export interface LiveSetScore {
  /** Número do set exibido (1-based, contando só os fechados antes dele). */
  setNumber: number;
  a: number;
  b: number;
}

function setClosed(s: { a: number; b: number }, index: number, bestOf: number): boolean {
  return isSetWon(s.a, s.b, targetPointsForSet(index, bestOf));
}

/** Sets fechados — ao vivo, exclui o set em andamento que a mesa mantém dentro de `sets[]`;
 *  encerrada, todo set vale (dados históricos podem fugir da regra e continuam contando). */
export function matchClosedSets(m: LiveScoreFields): Array<{ a: number; b: number }> {
  if (m.status !== 'in_progress') return m.sets;
  return m.sets.filter((s, i) => setClosed(s, i, m.bestOf));
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
    const idx = Math.min(Math.max(m.currentSetIndex ?? m.sets.length - 1, 0), m.bestOf - 1);
    const s = m.sets[idx];
    if (s && !setClosed(s, idx, m.bestOf)) return { setNumber: matchClosedSets(m).length + 1, a: s.a, b: s.b };
    // Sem set aberto dentro de sets[] (todos fechados) — o corrente, se houver, está no
    // agregado `liveScore` (fluxo do lançamento rápido: sets fechados + currentGames).
  }
  const live = m.liveScore;
  if (!live) return null;
  const setNumber = m.sets.length > 0 ? matchClosedSets(m).length + 1 : live.setsA + live.setsB + 1;
  return { setNumber, a: live.currentGamesA, b: live.currentGamesB };
}
