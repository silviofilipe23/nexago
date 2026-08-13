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

/** Partidas de fase de grupos agrupadas por rodada — a lista da sub-visão "Partidas".
 *  `poolId` nulo junta todos os grupos da categoria (o filtro "Todos"). */
export function roundGroupsOf(matches: readonly TournamentMatch[], poolId: string | null): RoundGroup[] {
  const pool = matches.filter((m) => (poolId == null ? m.poolId.length > 0 : m.poolId === poolId)).sort(byScheduleTime);
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
 *  Tudo derivado das partidas da categoria — nenhum campo novo no Firestore.
 *
 *  `knockoutRoundsOfCategory` é repassado direto pra `knockoutLabelOf` — ver a doc dela sobre por
 *  que o parâmetro é obrigatório (`knockoutRounds`, `focus/focus-journey.ts`, é quem calcula). */
export function campaignOf(
  matches: readonly TournamentMatch[],
  teamId: string,
  opponentNameOf: (opponentTeamId: string) => string,
  knockoutRoundsOfCategory: readonly number[],
): CampaignEntry[] {
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
      label: knockoutLabelOf(m, knockoutRoundsOfCategory),
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
  // WB/LB (dupla eliminação, `category-bracket-builders.ts`) entram no mapa como caminho
  // preferencial pelo mesmo motivo de 'final'/'third place': o round de cada lado numera a
  // própria chave (WB e LB recomeçam do 1), então "distância até a final" não tem sentido pra
  // eles — ver `knockoutLabelOf` abaixo.
  wb: 'WB',
  lb: 'LB',
};

/** Rótulo por distância até a final (1 = final, 2 = semifinal…) — só usado quando o `matchType`
 *  não bate com nenhuma chave do mapa acima. `buildSingleEliminationMatches`/
 *  `buildGroupsKnockoutMatches` (`functions/src/category-bracket-builders.ts`) gravam `'knockout'`
 *  pra toda rodada que não é a final, sem distinguir quartas de semifinal por `matchType` — só o
 *  `round` carrega essa informação, junto da lista de rounds de mata-mata da categoria.
 *
 *  Vai até distância 7 (64 avos, ~128 duplas): o gerador não tem teto de duplas
 *  (`organizer-category-ops.ts`), e uma categoria de 33-64 duplas já produz 6 rodadas (achado do
 *  round 1 de fix — a tabela parava em 5 e a 1ª rodada dessas chaves caía no fallback genérico). */
const POSITIONAL_KNOCKOUT_LABELS: Record<number, string> = {
  1: 'Final',
  2: 'Semifinal',
  3: 'Quartas',
  4: 'Oitavas',
  5: '16 avos',
  6: '32 avos',
  7: '64 avos',
};

/** `null` quando o round da partida não está em `knockoutRoundsOfCategory` (dado inconsistente)
 *  ou a distância não tem rótulo definido (chave maior que 64 avos, hoje só teórico) — quem chama
 *  cai pro fallback final de `knockoutLabelOf`, nunca pro `matchType` cru. */
function positionalKnockoutLabelOf(round: number, knockoutRoundsOfCategory: readonly number[]): string | null {
  const index = knockoutRoundsOfCategory.indexOf(round);
  if (index < 0) return null;
  const distanceFromFinal = knockoutRoundsOfCategory.length - index;
  return POSITIONAL_KNOCKOUT_LABELS[distanceFromFinal] ?? null;
}

/**
 * Rótulo em pt-BR da fase de mata-mata de uma partida.
 *
 * Caminho preferencial: o mapa acima, quando `matchType` bate com um valor conhecido — inclui
 * 'Final'/'Third Place'/'WB'/'LB', que carregam significado que a posição sozinha não dá (WB/LB
 * numeram rounds pela própria chave, não por distância até a final).
 *
 * Fallback posicional: quando `matchType` não resolve pelo mapa — hoje, só o `'knockout'` que o
 * gerador de eliminatória simples grava pra toda rodada que não é a final (achado do bug: ver
 * `category-bracket-builders.ts`) — a fase vira a distância da partida até a final dentro de
 * `knockoutRoundsOfCategory` (rodadas de mata-mata da categoria, em ordem — `knockoutRounds` em
 * `focus/focus-journey.ts`). O parâmetro é OBRIGATÓRIO de propósito: opcional aqui deixaria fácil
 * esquecer de passar a lista e cair de volta no "Knockout" em inglês, calado.
 *
 * Último fallback: `Rodada ${round}` — NUNCA o `matchType` cru capitalizado (removido no round 1
 * de fix). Os três geradores só gravam valores do mapa ou `'knockout'`, então nada real precisa de
 * um terceiro caminho; manter a capitalização vazava "Knockout" (ou qualquer outro `matchType`
 * bruto) sempre que a posição também não resolvesse — chave maior que a tabela acima cobre, ou um
 * `matchType` desconhecido dentro de dupla eliminação, onde `knockoutRoundsOfCategory` mistura as
 * rodadas independentes de WB e LB e uma posição "resolvida" ali seria só coincidência, nunca um
 * dado confiável.
 */
export function knockoutLabelOf(m: Pick<TournamentMatch, 'matchType' | 'round'>, knockoutRoundsOfCategory: readonly number[]): string {
  const key = m.matchType.trim().toLowerCase();
  const mapped = KNOCKOUT_LABELS[key];
  if (mapped) return mapped;
  return positionalKnockoutLabelOf(m.round, knockoutRoundsOfCategory) ?? `Rodada ${m.round}`;
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

export type TournamentTabId = 'visao-geral' | 'categorias' | 'minha-inscricao' | 'palpites';

export interface TabVisibilityInput {
  /** Não decide mais aba nenhuma aqui — o dia do atleta em jogo virou o Modo Focus, uma casca
   *  própria fora destas abas. O campo continua existindo porque o botão de entrada do Focus
   *  (Task 11) decide se aparece a partir dele. */
  hasMyMatchToday: boolean;
  isRegistered: boolean;
  /** Existe ao menos um confronto definido? Antes disso não há em quem palpitar. */
  hasDefinedMatchups: boolean;
}

/** Abas adaptativas: "Visão geral" e "Categorias" são o esqueleto fixo; as outras só aparecem
 *  quando têm conteúdo real, pra quem só está olhando o torneio não encarar abas vazias.
 *  Partidas, grupos e chave não são abas do torneio: vivem DENTRO da categoria, senão trocar de
 *  aba trocava a categoria que o atleta estava acompanhando.
 *
 *  "Palpites" fica por último — é a aba de torcida, não de operação — e NÃO some quando o
 *  torneio acaba: é justamente aí que o ranking de palpiteiros e o "você acertou" importam. */
export function visibleTabsOf(input: TabVisibilityInput): TournamentTabId[] {
  const tabs: TournamentTabId[] = ['visao-geral', 'categorias'];
  if (input.isRegistered) tabs.push('minha-inscricao');
  if (input.hasDefinedMatchups) tabs.push('palpites');
  return tabs;
}

/** Sub-visões da categoria — o segmentado que substituiu as abas Partidas/Chaves. */
export type CategoryViewId = 'partidas' | 'grupos' | 'chave';

export interface CategoryViewInput {
  hasMatches: boolean;
  hasGroups: boolean;
}

/** "Grupos" só existe em categoria com fase de grupos; "Partidas" só depois que o organizador
 *  publica os jogos. "Chave" fica sempre — é onde a mensagem de "ainda não sorteada" aparece. */
export function categoryViewsOf(input: CategoryViewInput): CategoryViewId[] {
  const views: CategoryViewId[] = [];
  if (input.hasMatches) views.push('partidas');
  if (input.hasGroups) views.push('grupos');
  views.push('chave');
  return views;
}

/** Sub-visão de entrada da categoria: os jogos quando existem, senão a chave. */
export function defaultCategoryViewOf(views: readonly CategoryViewId[]): CategoryViewId {
  return views[0] ?? 'chave';
}

/** Aba de entrada: sempre a visão geral — quem tem jogo hoje é levado ao Modo Focus, não a
 *  uma aba destas. */
export function defaultTabOf(): TournamentTabId {
  return 'visao-geral';
}
