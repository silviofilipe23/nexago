import { matchIsCompleted, matchIsLive, type GroupStanding, type TournamentMatch } from '../../data/matches-repository';
import type { TournamentCategoryOffer } from '../../data/tournaments-repository';
import {
  bestOfLabelOf,
  closedPartialsLabelOf,
  countdownLabelOf,
  courtLabelOf,
  liveScoreLineOf,
  matchNumberLabelOf,
  ordinalOf,
  setWinsLabelOf,
  timeLabelOf,
} from '../tournament-format';
import {
  groupLabelOf,
  knockoutLabelOf,
  liveMatchesOf,
  outcomeOf,
  qualificationOf,
  roundDisplayNumberOf,
  roundGroupsOf,
  sideOf,
} from '../tournament-live.selectors';
import type { DuoPlayer, TournamentLiveStore } from '../tournament-live.store';

/** Views puras da experiência "acompanhar o dia": próxima partida, linha do tempo, classificação
 *  do grupo e o que está em quadra agora. Extraídas da aba Hoje pra serem reaproveitadas pelas
 *  seções Agora e Grupo do Modo Focus sem triplicar a lógica. */

export interface DuoView {
  teamId: string;
  name: string;
  isMe: boolean;
  players: [DuoPlayer, DuoPlayer];
  /** "1º do grupo · 2V 0D" — só existe em partida de fase de grupos. */
  standingLine: string | null;
}

export interface NextMatchView {
  matchId: string;
  kicker: string;
  /** "Jogo #12" — o nome pelo qual o organizador chama a partida na quadra. `null` sem número. */
  numberLabel: string | null;
  timeLabel: string;
  countdown: string | null;
  courtLabel: string | null;
  bestOfLabel: string;
  checkedIn: boolean;
  live: boolean;
  liveScoreLine: string | null;
  sideA: DuoView;
  sideB: DuoView;
}

export type TimelineState = 'done' | 'live' | 'next' | 'upcoming';

export interface TimelineEntry {
  matchId: string;
  time: string;
  title: string;
  detail: string | null;
  outcomeLabel: string | null;
  outcome: 'win' | 'loss' | null;
  state: TimelineState;
  note: string | null;
  clickable: boolean;
}

export interface LiveRowView {
  matchId: string;
  nameA: string;
  nameB: string;
  context: string;
  scoreLine: string | null;
}

export interface QualificationNote {
  tone: 'win' | 'neutral';
  text: string;
}

export interface StandingRow {
  rank: number;
  name: string;
  isMe: boolean;
  wins: number;
  losses: number;
  sets: string;
  points: number;
  qualifies: boolean;
}

/**
 * O que uma view do Focus precisa saber. É o store reduzido a valores — os componentes montam
 * este objeto lendo os signals, e os testes montam um literal. Sem isso as funções voltariam a
 * depender do `TournamentLiveStore` e deixariam de ser testáveis sem TestBed.
 *
 * Propositalmente SEM `now`: é o único valor do store que anda sozinho (tick de 1s em partida ao
 * vivo — ver `TICK_LIVE_MS` em `tournament-live.store.ts`). Se entrasse aqui, o `ctx` inteiro
 * recomputaria a cada tick e arrastaria `standingsViewOf`/`qualificationNoteOf`/`liveRowsOf` —
 * que não dependem do relógio — junto. `nextMatchViewOf`, o único consumidor de `now`, recebe o
 * valor à parte.
 */
export interface FocusViewContext {
  matches: readonly TournamentMatch[];
  myTeamIds: ReadonlySet<string>;
  duoNameOf(teamId: string, fallback?: string | null): string;
  duoPlayersOf(teamId: string): [DuoPlayer, DuoPlayer];
  isMyTeam(teamId: string): boolean;
  standingsOf(poolId: string): readonly GroupStanding[];
  nextMatch: TournamentMatch | null;
  dayTimeline: readonly TournamentMatch[];
}

/** Fotografia do store para as funções de view. `import type` de propósito: nada aqui depende
 *  do store em tempo de execução, então não há ciclo. */
export function focusViewContextOf(store: TournamentLiveStore): FocusViewContext {
  return {
    matches: store.matches(),
    myTeamIds: store.myTeamIds(),
    duoNameOf: (teamId, fallback) => store.duoNameOf(teamId, fallback ?? null),
    duoPlayersOf: (teamId) => store.duoPlayersOf(teamId),
    isMyTeam: (teamId) => store.isMyTeam(teamId),
    standingsOf: (poolId) => store.standingsOf(poolId),
    nextMatch: store.nextMatch(),
    dayTimeline: store.dayTimeline(),
  };
}

/** Na pílula de meta da próxima partida o número aparece sozinho, então vai por extenso
 *  ("Jogo #12") — diferente da linha mono dos cards, onde o `#12` já se explica pelo contexto. */
function numberChipOf(m: TournamentMatch): string | null {
  const number = matchNumberLabelOf(m);
  return number ? `Jogo ${number}` : null;
}

function mySetLine(m: TournamentMatch, side: 'A' | 'B' | null): string {
  const [a, b] = setWinsLabelOf(m).split(' – ');
  return side === 'B' ? `${b}–${a}` : `${a}–${b}`;
}

function phaseLabelOf(ctx: FocusViewContext, m: TournamentMatch): string {
  if (m.poolId) return `Rodada ${roundDisplayNumberOf(ctx.matches, m.poolId, m.round)}`;
  return knockoutLabelOf(m);
}

function kickerOf(ctx: FocusViewContext, m: TournamentMatch): string {
  const parts = ['Sua próxima partida'];
  if (m.poolId) {
    parts.push(groupLabelOf(m.poolId, ctx.matches), phaseLabelOf(ctx, m));
  } else {
    parts.push(phaseLabelOf(ctx, m));
  }
  return parts.join(' · ');
}

/** "decide a classificação do grupo" — verdadeiro sempre que a partida é da última rodada
 *  ainda em aberto. Não promete posição específica: isso dependeria de simular os critérios
 *  de desempate. */
function noteOf(ctx: FocusViewContext, m: TournamentMatch): string | null {
  if (!m.poolId || matchIsCompleted(m)) return null;
  const groups = roundGroupsOf(ctx.matches, m.poolId);
  const last = groups[groups.length - 1];
  return last && last.round === m.round ? 'decide a classificação do grupo' : null;
}

/** "1º do grupo · 2V 0D". */
export function standingLineOf(ctx: FocusViewContext, teamId: string, poolId: string): string | null {
  if (!teamId || !poolId) return null;
  const rows = ctx.standingsOf(poolId);
  const index = rows.findIndex((s) => s.teamId === teamId);
  if (index < 0) return null;
  const row = rows[index]!;
  return `${ordinalOf(index + 1)} do grupo · ${row.wins}V ${lossesOf(ctx, poolId, teamId)}D`;
}

export function lossesOf(ctx: FocusViewContext, poolId: string, teamId: string): number {
  return ctx.matches.filter(
    (m) => m.poolId === poolId && matchIsCompleted(m) && (m.teamAId === teamId || m.teamBId === teamId) && m.winnerId !== teamId,
  ).length;
}

function duoViewOf(ctx: FocusViewContext, teamId: string, description: string | null, poolId: string): DuoView {
  return {
    teamId,
    name: ctx.duoNameOf(teamId, description),
    isMe: ctx.isMyTeam(teamId),
    players: ctx.duoPlayersOf(teamId),
    standingLine: standingLineOf(ctx, teamId, poolId),
  };
}

export function nextMatchViewOf(ctx: FocusViewContext, now: Date): NextMatchView | null {
  const m = ctx.nextMatch;
  if (!m) return null;
  const live = matchIsLive(m);
  const side = sideOf(m, ctx.myTeamIds);
  const checkIn = side === 'A' ? m.checkIn.teamA : m.checkIn.teamB;
  return {
    matchId: m.id,
    kicker: kickerOf(ctx, m),
    numberLabel: numberChipOf(m),
    timeLabel: timeLabelOf(m.scheduleTime),
    countdown: live ? null : countdownLabelOf(m.scheduleTime, now),
    courtLabel: courtLabelOf(m.courtName),
    bestOfLabel: bestOfLabelOf(m),
    checkedIn: checkIn === 'present',
    live,
    liveScoreLine: liveScoreLineOf(m),
    sideA: duoViewOf(ctx, m.teamAId, m.teamADescription, m.poolId),
    sideB: duoViewOf(ctx, m.teamBId, m.teamBDescription, m.poolId),
  };
}

export function timelineOf(ctx: FocusViewContext): TimelineEntry[] {
  const myTeamIds = ctx.myTeamIds;
  const nextId = ctx.nextMatch?.id;
  const entries = ctx.dayTimeline;
  return entries.map((m) => {
    const outcome = outcomeOf(m, myTeamIds);
    const side = sideOf(m, myTeamIds);
    const opponentId = side === 'A' ? m.teamBId : m.teamAId;
    const opponentDescription = side === 'A' ? m.teamBDescription : m.teamADescription;
    const live = matchIsLive(m);
    const done = matchIsCompleted(m);
    return {
      matchId: m.id,
      time: timeLabelOf(m.scheduleTime),
      title: [matchNumberLabelOf(m), phaseLabelOf(ctx, m), `vs ${ctx.duoNameOf(opponentId, opponentDescription)}`, courtLabelOf(m.courtName)]
        .filter((p): p is string => p != null)
        .join(' · '),
      detail: done ? closedPartialsLabelOf(m) : live ? liveScoreLineOf(m) : null,
      outcomeLabel: outcome ? `${outcome === 'win' ? 'V' : 'D'} ${mySetLine(m, side)}` : null,
      outcome,
      state: done ? 'done' : live ? 'live' : m.id === nextId ? 'next' : 'upcoming',
      note: noteOf(ctx, m),
      clickable: Boolean(m.teamAId && m.teamBId),
    } satisfies TimelineEntry;
  });
}

export function liveRowsOf(ctx: FocusViewContext, categoryId: string | null): LiveRowView[] {
  return liveMatchesOf(ctx.matches, categoryId ?? undefined).map((m) => ({
    matchId: m.id,
    nameA: ctx.duoNameOf(m.teamAId, m.teamADescription),
    nameB: ctx.duoNameOf(m.teamBId, m.teamBDescription),
    context: [m.poolId ? groupLabelOf(m.poolId, ctx.matches) : phaseLabelOf(ctx, m), courtLabelOf(m.courtName)]
      .filter((p): p is string => p != null)
      .join(' · '),
    scoreLine: liveScoreLineOf(m),
  }));
}

export function standingsViewOf(
  ctx: FocusViewContext,
  poolId: string,
  qualifiersPerGroup: number,
  myTeamId: string | null,
): StandingRow[] {
  if (!poolId) return [];
  return ctx.standingsOf(poolId).map((s, index) => ({
    rank: index + 1,
    name: ctx.duoNameOf(s.teamId),
    isMe: s.teamId === myTeamId,
    wins: s.wins,
    losses: lossesOf(ctx, poolId, s.teamId),
    sets: `${s.setsWon}–${s.setsLost}`,
    points: s.points,
    qualifies: index < qualifiersPerGroup,
  }));
}

/** Nunca afirma classificação antes do grupo terminar — ver `qualificationOf`. */
export function qualificationNoteOf(
  ctx: FocusViewContext,
  poolId: string,
  category: Pick<TournamentCategoryOffer, 'qualifiersPerGroup'> | null,
  myTeamId: string | null,
): QualificationNote | null {
  if (!poolId || !category) return null;
  const info = qualificationOf(ctx.matches, poolId, myTeamId, ctx.standingsOf(poolId), category.qualifiersPerGroup);
  if (!info) return null;
  if (info.decided) {
    return info.qualifies
      ? { tone: 'win', text: `Grupo encerrado em ${ordinalOf(info.rank)}. Você avançou para o mata-mata.` }
      : { tone: 'neutral', text: `Grupo encerrado em ${ordinalOf(info.rank)}. Passavam os ${info.qualifiersPerGroup} primeiros.` };
  }
  const remaining = info.remainingMatches === 1 ? 'Falta 1 partida no grupo' : `Faltam ${info.remainingMatches} partidas no grupo`;
  return { tone: 'neutral', text: `Você está em ${ordinalOf(info.rank)}. ${remaining} — avançam os ${info.qualifiersPerGroup} primeiros.` };
}
