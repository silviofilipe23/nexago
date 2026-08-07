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

export interface PredictionCategoryGroup {
  categoryId: string;
  matches: TournamentMatch[];
}

/**
 * Agrupa as partidas por categoria, na ordem em que o organizador cadastrou as categorias no
 * torneio (a mesma da aba Categorias). Um torneio tem dezenas de categorias misturando grupos e
 * mata-mata: em lista corrida, dois cards vizinhos podiam ser de categorias diferentes sem
 * nenhuma marca separando.
 *
 * Categoria que sumiu do documento do torneio mas ainda tem partidas vai para o fim em vez de
 * desaparecer — esconder jogo por causa de metadado faltando seria pior que exibi-lo fora de
 * ordem. A ordem das partidas DENTRO do grupo é preservada.
 */
export function groupMatchesByCategory(
  matches: readonly TournamentMatch[],
  categoryOrder: readonly string[],
): PredictionCategoryGroup[] {
  const groups = new Map<string, TournamentMatch[]>();
  for (const m of matches) {
    const list = groups.get(m.categoryId);
    if (list) list.push(m);
    else groups.set(m.categoryId, [m]);
  }

  const rankOf = (categoryId: string): number => {
    const index = categoryOrder.indexOf(categoryId);
    return index >= 0 ? index : categoryOrder.length;
  };

  return [...groups.entries()]
    .map(([categoryId, list]) => ({ categoryId, matches: list }))
    .sort((a, b) => rankOf(a.categoryId) - rankOf(b.categoryId));
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
  /** Palpites que bateram com o vencedor real. Só conta partidas já concluídas. */
  hits: number;
  /**
   * Quantas posições a pessoa subiu (positivo) ou caiu (negativo) desde a última partida
   * pontuada. `null` quando o servidor ainda não fotografou nenhuma posição.
   */
  delta: number | null;
  isMe: boolean;
}

/**
 * Ordem canônica do ranking: maior pontuação primeiro, desempate por número de palpites e
 * depois por id, pra ordem não dançar entre dois carregamentos com a mesma pontuação.
 *
 * O desempate por id compara code units em vez de `localeCompare`: `localeCompare` é sensível a
 * locale e ordena 'a' antes de 'B', enquanto o `compareTo` do Dart (app) faz o contrário. Com
 * uids do Firebase, que misturam maiúsculas e minúsculas, as duas superfícies mostrariam
 * posições diferentes no empate — e agora essa posição vai estampada numa imagem compartilhada.
 * O mesmo comparador vive em `comparePredictionRanking`
 * (`functions/src/tournament-predictions.ts`) e em `buildPredictionLeaderboardEntries`
 * (`tournament_predictions_logic.dart`); os três precisam concordar.
 */
function comparePredictionRanking(a: TournamentPredictionEntry, b: TournamentPredictionEntry): number {
  if (b.score !== a.score) return b.score - a.score;
  const picksDiff = Object.keys(b.picks).length - Object.keys(a.picks).length;
  if (picksDiff !== 0) return picksDiff;
  if (a.userId === b.userId) return 0;
  return a.userId < b.userId ? -1 : 1;
}

/** Ranking dos palpiteiros, com posições sequenciais (1, 2, 3…) como no ranking de atletas.
 *  `matches` só é necessário para contar acertos por linha; sem ele, `hits` fica em 0. */
export function buildPredictionLeaderboard(
  entries: readonly TournamentPredictionEntry[],
  currentUserId: string | null,
  matches: readonly TournamentMatch[] = [],
): PredictionLeaderboardRow[] {
  const me = currentUserId?.trim() ?? '';
  const winners = new Map<string, string>();
  for (const m of matches) {
    const winner = m.winnerId?.trim();
    if (matchIsCompleted(m) && winner) winners.set(m.id, winner);
  }

  return [...entries]
    .sort(comparePredictionRanking)
    .map((entry, index) => {
      const rank = index + 1;
      return {
        rank,
        userId: entry.userId,
        score: entry.score,
        picksCount: Object.keys(entry.picks).length,
        hits: Object.entries(entry.picks).filter(([matchId, teamId]) => winners.get(matchId) === teamId).length,
        // A posição comparada é a que ESTE cliente calculou, não uma que veio do servidor: assim
        // o número exibido e a seta ao lado nunca se contradizem.
        delta: entry.previousRank == null ? null : entry.previousRank - rank,
        isMe: me.length > 0 && entry.userId === me,
      };
    });
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
  /** Posições ganhas (positivo) ou perdidas desde a última partida pontuada. `null` sem foto. */
  delta: number | null;
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
  const myRow = leaderboard.find((row) => row.isMe) ?? null;
  return {
    points: entry?.score ?? 0,
    hits: results.filter((r) => r === 'hit').length,
    decided: results.filter((r) => r != null).length,
    pending: results.filter((r) => r == null).length,
    rank: myRow?.rank ?? null,
    totalPlayers: leaderboard.length,
    delta: myRow?.delta ?? null,
  };
}
