import { matchIsCompleted, matchIsScheduled, type TournamentMatch } from '../../data/matches-repository';
import type { TournamentPredictionEntry } from '../../data/tournament-predictions-repository';

/** Seletores puros dos palpites da torcida. Espelham as travas do backend
 *  (`functions/src/tournament-predictions.ts`) e a lógica já validada no app mobile
 *  (`tournament_predictions_logic.dart`) — nenhum deles toca Firestore nem Angular. */

/** Palpite só vale enquanto a partida está `Scheduled` E os dois lados existem: um slot ainda
 *  "Vencedor do jogo 7" não tem em quem apostar. */
export function canPredictMatch(m: TournamentMatch): boolean {
  return matchIsScheduled(m) && m.teamAId.trim().length > 0 && m.teamBId.trim().length > 0;
}

/** Partida travada: começou, terminou ou foi cancelada. O card continua visível — é assim que o
 *  atleta revê o palpite que deu antes da trava. */
export function isPredictionLocked(m: TournamentMatch): boolean {
  return !matchIsScheduled(m);
}

/** Partidas que aparecem na aba, em ordem de jogo. Fora ficam só as que ainda não têm os dois
 *  competidores definidos — a chave não propagou até ali. */
export function predictableMatches(matches: readonly TournamentMatch[]): TournamentMatch[] {
  return matches
    .filter((m) => m.teamAId.trim().length > 0 && m.teamBId.trim().length > 0)
    .sort((a, b) => a.matchNumber - b.matchNumber);
}

/** A grande final decide o campeão (`matchType === 'Final'`, mesma leitura de `isFinalMatchType`
 *  no backend): o palpite dela vale +3 e dispensa um seletor de campeão à parte. */
export function isChampionDecidingMatch(m: TournamentMatch): boolean {
  return m.matchType.trim().toLowerCase() === 'final';
}

/**
 * Restringe os palpites a enviar às partidas AINDA abertas.
 *
 * Não é otimização: a callable valida partida por partida e lança no primeiro problema, então
 * reenviar um palpite de partida já travada derruba a chamada inteira — e leva junto o palpite
 * novo que o atleta acabou de dar em outra partida.
 */
export function openMatchPicksToSubmit(
  draft: Readonly<Record<string, string>>,
  matches: readonly TournamentMatch[],
): Record<string, string> {
  const open = new Set(matches.filter(canPredictMatch).map((m) => m.id));
  const picks: Record<string, string> = {};
  for (const [matchId, teamId] of Object.entries(draft)) {
    if (teamId.trim() && open.has(matchId)) picks[matchId] = teamId.trim();
  }
  return picks;
}

/** O `championPick` derivado do palpite dado na final. `null` enquanto o atleta não chegou lá. */
export function championPickOf(
  draft: Readonly<Record<string, string>>,
  matches: readonly TournamentMatch[],
): string | null {
  for (const m of matches) {
    if (!isChampionDecidingMatch(m)) continue;
    const pick = draft[m.id]?.trim();
    if (pick) return pick;
  }
  return null;
}

export type PredictionResult = 'hit' | 'miss';

/** Como o palpite terminou. `null` enquanto a partida não tem vencedor ou não houve palpite. */
export function predictionResultOf(m: TournamentMatch, picks: Readonly<Record<string, string>>): PredictionResult | null {
  if (!matchIsCompleted(m)) return null;
  const winner = m.winnerId?.trim();
  const pick = picks[m.id]?.trim();
  if (!winner || !pick) return null;
  return pick === winner ? 'hit' : 'miss';
}

export interface PredictionLeaderboardRow {
  rank: number;
  userId: string;
  score: number;
  /** Quantos palpites a pessoa enviou — separa quem acertou muito de quem palpitou muito. */
  picksCount: number;
  isMe: boolean;
}

/** Ranking dos palpiteiros: maior pontuação primeiro, posições sequenciais (1, 2, 3…) como no
 *  ranking de atletas. Desempate por número de palpites e depois por id, pra ordem não dançar
 *  entre dois carregamentos com a mesma pontuação. */
export function buildPredictionLeaderboard(
  entries: readonly TournamentPredictionEntry[],
  currentUserId: string | null,
): PredictionLeaderboardRow[] {
  const me = currentUserId?.trim() ?? '';
  return [...entries]
    .sort((a, b) => b.score - a.score || Object.keys(b.picks).length - Object.keys(a.picks).length || a.userId.localeCompare(b.userId))
    .map((entry, index) => ({
      rank: index + 1,
      userId: entry.userId,
      score: entry.score,
      picksCount: Object.keys(entry.picks).length,
      isMe: me.length > 0 && entry.userId === me,
    }));
}

export interface PredictionStats {
  points: number;
  hits: number;
  /** Palpites cuja partida já terminou — o denominador honesto do aproveitamento. */
  decided: number;
  /** Palpites ainda em jogo. */
  pending: number;
  rank: number | null;
  totalPlayers: number;
}

/** O retrato do atleta no topo da aba. Tudo derivado do que já está carregado — nenhum campo
 *  novo no Firestore. */
export function predictionStatsOf(
  entry: TournamentPredictionEntry | null,
  matches: readonly TournamentMatch[],
  leaderboard: readonly PredictionLeaderboardRow[],
): PredictionStats {
  const picks = entry?.picks ?? {};
  const picked = matches.filter((m) => picks[m.id]);
  const results = picked.map((m) => predictionResultOf(m, picks));
  return {
    points: entry?.score ?? 0,
    hits: results.filter((r) => r === 'hit').length,
    decided: results.filter((r) => r != null).length,
    pending: results.filter((r) => r == null).length,
    rank: leaderboard.find((row) => row.isMe)?.rank ?? null,
    totalPlayers: leaderboard.length,
  };
}
