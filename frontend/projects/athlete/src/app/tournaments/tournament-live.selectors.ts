import {
  matchClosedSets,
  matchIsCanceled,
  matchIsCompleted,
  matchIsLive,
  matchLiveCurrentSet,
  matchSetWins,
  type MatchSet,
  type TournamentMatch,
} from '../data/matches-repository';

/** Seletores puros da experiência "acompanhar o torneio". Nenhum deles toca Firestore nem
 *  Angular — recebem a lista de partidas já carregada pelo `TournamentLiveStore` e devolvem
 *  as derivações que as abas Hoje / Partidas e a tela de Partida consomem. Ficam separados do
 *  store justamente pra poderem ser testados direto. */

/** Fuso canônico dos eventos, igual ao resto do portal e do app. Comparação de dia é sempre
 *  feita pelos componentes locais de São Paulo — nunca por `toISOString()`, que desloca o dia. */
const SP_DATE_KEY = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Sao_Paulo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

export function saoPauloDateKey(date: Date): string {
  return SP_DATE_KEY.format(date);
}

export function isSameSaoPauloDay(a: Date, b: Date): boolean {
  return saoPauloDateKey(a) === saoPauloDateKey(b);
}

export type MatchSide = 'A' | 'B';

/** De que lado da partida o atleta está, ou `null` se a partida não é dele. */
export function sideOf(m: Pick<TournamentMatch, 'teamAId' | 'teamBId'>, myTeamIds: ReadonlySet<string>): MatchSide | null {
  if (m.teamAId && myTeamIds.has(m.teamAId)) return 'A';
  if (m.teamBId && myTeamIds.has(m.teamBId)) return 'B';
  return null;
}

export function isMyMatch(m: Pick<TournamentMatch, 'teamAId' | 'teamBId'>, myTeamIds: ReadonlySet<string>): boolean {
  return sideOf(m, myTeamIds) !== null;
}

export type MatchOutcome = 'win' | 'loss' | null;

/** Resultado sob a ótica do atleta. `null` enquanto a partida não terminou. */
export function outcomeOf(m: TournamentMatch, myTeamIds: ReadonlySet<string>): MatchOutcome {
  if (!matchIsCompleted(m) || !m.winnerId) return null;
  const side = sideOf(m, myTeamIds);
  if (side === null) return null;
  const myTeamId = side === 'A' ? m.teamAId : m.teamBId;
  return m.winnerId === myTeamId ? 'win' : 'loss';
}

/** Uma partida ainda vai acontecer (não terminou nem foi cancelada). */
export function isPending(m: TournamentMatch): boolean {
  return !matchIsCompleted(m) && !matchIsCanceled(m);
}

/** Ordem cronológica com as sem horário no fim — usada em toda listagem por tempo. */
export function byScheduleTime(a: TournamentMatch, b: TournamentMatch): number {
  const ta = a.scheduleTime?.getTime();
  const tb = b.scheduleTime?.getTime();
  if (ta == null && tb == null) return a.matchNumber - b.matchNumber;
  if (ta == null) return 1;
  if (tb == null) return -1;
  return ta - tb || a.matchNumber - b.matchNumber;
}

export function myMatches(matches: readonly TournamentMatch[], myTeamIds: ReadonlySet<string>): TournamentMatch[] {
  return matches.filter((m) => isMyMatch(m, myTeamIds));
}

/** A partida que o atleta precisa ver agora: a que está em quadra ganha de qualquer agendada;
 *  entre as agendadas, a mais próxima. Partidas sem horário só entram se não houver nenhuma
 *  com horário — é o caso da chave que ainda não foi agendada. */
export function nextMatchOf(matches: readonly TournamentMatch[], myTeamIds: ReadonlySet<string>): TournamentMatch | null {
  const mine = myMatches(matches, myTeamIds).filter(isPending);
  if (mine.length === 0) return null;
  const live = mine.filter(matchIsLive).sort(byScheduleTime);
  if (live.length > 0) return live[0]!;
  const scheduled = mine.filter((m) => m.scheduleTime != null).sort(byScheduleTime);
  if (scheduled.length > 0) return scheduled[0]!;
  return [...mine].sort((a, b) => a.matchNumber - b.matchNumber)[0] ?? null;
}

/** Minhas partidas do dia de referência, em ordem cronológica — a timeline "Seu dia no torneio". */
export function myDayTimeline(matches: readonly TournamentMatch[], myTeamIds: ReadonlySet<string>, reference: Date): TournamentMatch[] {
  return myMatches(matches, myTeamIds)
    .filter((m) => m.scheduleTime != null && isSameSaoPauloDay(m.scheduleTime, reference))
    .sort(byScheduleTime);
}

/** Existe mata-mata pendente na categoria enquanto o atleta segue vivo? Serve pro rodapé
 *  "adversário e quadra saem ao fim dos grupos" — o protótipo mostra essa linha, mas os slots
 *  do bracket ainda não têm o teamId do atleta, então não dá pra tratá-la como partida dele. */
export function hasPendingKnockout(matches: readonly TournamentMatch[], categoryId: string): boolean {
  return matches.some((m) => m.categoryId === categoryId && !m.isGroupMatch && !m.poolId && isPending(m));
}

/** Partidas em quadra agora. Sem `categoryId`, varre o torneio inteiro. */
export function liveMatchesOf(matches: readonly TournamentMatch[], categoryId?: string): TournamentMatch[] {
  return matches.filter((m) => matchIsLive(m) && (!categoryId || m.categoryId === categoryId)).sort(byScheduleTime);
}

export interface RoundGroup {
  round: number;
  /** Posição da rodada no grupo, 1-based. O campo `round` do Firestore é um índice interno que
   *  em muitos torneios começa em zero — "Rodada 0" não significa nada para o atleta. */
  displayNumber: number;
  matches: TournamentMatch[];
  /** Horário da rodada = o mais cedo entre as partidas dela. */
  startAt: Date | null;
  allCompleted: boolean;
  hasLive: boolean;
}

/** Partidas de um grupo agrupadas por rodada — a lista da aba "Partidas & tabela". */
export function roundGroupsOf(matches: readonly TournamentMatch[], poolId: string): RoundGroup[] {
  const pool = matches.filter((m) => m.poolId === poolId).sort(byScheduleTime);
  const byRound = new Map<number, TournamentMatch[]>();
  for (const m of pool) {
    const list = byRound.get(m.round);
    if (list) list.push(m);
    else byRound.set(m.round, [m]);
  }
  return [...byRound.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([round, list], index) => {
      const times = list.map((m) => m.scheduleTime?.getTime()).filter((t): t is number => t != null);
      return {
        round,
        displayNumber: index + 1,
        matches: list,
        startAt: times.length > 0 ? new Date(Math.min(...times)) : null,
        allCompleted: list.every((m) => matchIsCompleted(m) || matchIsCanceled(m)),
        hasLive: list.some(matchIsLive),
      };
    });
}

/** Número da rodada como o atleta a enxerga (1-based), a partir do `round` cru da partida. */
export function roundDisplayNumberOf(matches: readonly TournamentMatch[], poolId: string, round: number): number {
  const groups = roundGroupsOf(matches, poolId);
  return groups.find((g) => g.round === round)?.displayNumber ?? round + 1;
}

/** A rodada que decide a classificação é a última do grupo. */
export function isDecidingRound(groups: readonly RoundGroup[], round: number): boolean {
  const last = groups[groups.length - 1];
  return last != null && last.round === round && !last.allCompleted;
}

export interface CampaignEntry {
  label: string;
  detail: string;
}

/** "Como a dupla chegou até aqui": desempenho no grupo + os mata-matas já vencidos.
 *  Tudo derivado das partidas da categoria — nenhum campo novo no Firestore. */
export function campaignOf(matches: readonly TournamentMatch[], teamId: string, opponentNameOf: (opponentTeamId: string) => string): CampaignEntry[] {
  if (!teamId) return [];
  const mine = matches.filter((m) => m.teamAId === teamId || m.teamBId === teamId);
  const entries: CampaignEntry[] = [];

  const groupMatches = mine.filter((m) => m.poolId && matchIsCompleted(m));
  if (groupMatches.length > 0) {
    const wins = groupMatches.filter((m) => m.winnerId === teamId).length;
    entries.push({
      label: groupLabelOf(groupMatches[0]!.poolId, matches),
      detail: `${wins}V ${groupMatches.length - wins}D`,
    });
  }

  for (const m of mine.filter((k) => !k.poolId && matchIsCompleted(k) && k.winnerId === teamId).sort((a, b) => a.matchNumber - b.matchNumber)) {
    const opponentId = m.teamAId === teamId ? m.teamBId : m.teamAId;
    const [a, b] = matchSetWins(m);
    const mySets = m.teamAId === teamId ? a : b;
    const theirSets = m.teamAId === teamId ? b : a;
    entries.push({
      label: knockoutLabelOf(m),
      detail: `V ${mySets}–${theirSets} vs ${opponentNameOf(opponentId)}`,
    });
  }

  return entries;
}

/** Letra do grupo pela posição do poolId na ordem alfabética dos grupos da categoria. */
export function groupLabelOf(poolId: string, matches: readonly TournamentMatch[]): string {
  const pools = [...new Set(matches.filter((m) => m.poolId).map((m) => m.poolId))].sort();
  const index = pools.indexOf(poolId);
  return index >= 0 ? `Grupo ${String.fromCharCode(65 + index)}` : 'Grupo';
}

const KNOCKOUT_LABELS: Record<string, string> = {
  final: 'Final',
  'grand final': 'Grand final',
  'grand_final': 'Grand final',
  'third place': '3º lugar',
  'third_place': '3º lugar',
  'semi-final': 'Semifinal',
  semifinal: 'Semifinal',
  'quarter-final': 'Quartas',
  quarterfinal: 'Quartas',
  'round of 16': 'Oitavas',
  'round of 32': '16 avos',
};

export function knockoutLabelOf(m: Pick<TournamentMatch, 'matchType' | 'round'>): string {
  const key = m.matchType.trim().toLowerCase();
  return KNOCKOUT_LABELS[key] ?? (key ? `${m.matchType[0]!.toUpperCase()}${m.matchType.slice(1)}` : `Rodada ${m.round}`);
}

/** Sets já fechados + o set em andamento (mesa ponto a ponto ou `liveScore` agregado — ver
 *  `matchLiveCurrentSet`), prontos pra renderizar em coluna. */
export interface DisplaySet {
  index: number;
  a: number;
  b: number;
  inProgress: boolean;
}

export function displaySetsOf(m: TournamentMatch): DisplaySet[] {
  const closed: MatchSet[] = matchClosedSets(m);
  const sets: DisplaySet[] = closed.map((s, i) => ({ index: i + 1, a: s.a, b: s.b, inProgress: false }));
  // O set em andamento só existe enquanto a partida roda (e só aparece com ponto marcado):
  // depois de encerrada, `sets` já o contém.
  const live = matchLiveCurrentSet(m);
  if (live && (live.a > 0 || live.b > 0)) {
    sets.push({ index: sets.length + 1, a: live.a, b: live.b, inProgress: true });
  }
  return sets;
}

export interface QualificationInfo {
  rank: number;
  qualifies: boolean;
  /** Grupo terminado: a posição é definitiva e dá pra afirmar classificação. */
  decided: boolean;
  remainingMatches: number;
  qualifiersPerGroup: number;
}

/** Situação do atleta no grupo. Deliberadamente conservador: só afirma classificação quando
 *  todas as partidas do grupo acabaram. Antes disso, dizer "você já está classificado" exigiria
 *  simular cenário a cenário com os critérios de desempate — e errar isso num app de torneio
 *  é pior do que informar a posição parcial. */
export function qualificationOf(
  matches: readonly TournamentMatch[],
  poolId: string,
  myTeamId: string | null,
  standings: readonly { teamId: string }[],
  qualifiersPerGroup: number,
): QualificationInfo | null {
  if (!myTeamId || !poolId) return null;
  const index = standings.findIndex((s) => s.teamId === myTeamId);
  if (index < 0) return null;
  const poolMatches = matches.filter((m) => m.poolId === poolId);
  const remaining = poolMatches.filter((m) => isPending(m)).length;
  return {
    rank: index + 1,
    qualifies: index < qualifiersPerGroup,
    decided: remaining === 0,
    remainingMatches: remaining,
    qualifiersPerGroup,
  };
}

export type TournamentTabId = 'visao-geral' | 'hoje' | 'partidas' | 'chaves' | 'minha-inscricao';

export interface TabVisibilityInput {
  hasMatches: boolean;
  hasMyMatchToday: boolean;
  isRegistered: boolean;
}

/** Abas adaptativas: "Visão geral" e "Chaves" são o esqueleto fixo; as outras três só aparecem
 *  quando têm conteúdo real, pra quem só está olhando o torneio não encarar abas vazias. */
export function visibleTabsOf(input: TabVisibilityInput): TournamentTabId[] {
  const tabs: TournamentTabId[] = ['visao-geral'];
  if (input.hasMyMatchToday) tabs.push('hoje');
  if (input.hasMatches) tabs.push('partidas');
  tabs.push('chaves');
  if (input.isRegistered) tabs.push('minha-inscricao');
  return tabs;
}

/** Aba de entrada: quem tem jogo hoje cai direto no "Hoje". */
export function defaultTabOf(tabs: readonly TournamentTabId[]): TournamentTabId {
  return tabs.includes('hoje') ? 'hoje' : 'visao-geral';
}
