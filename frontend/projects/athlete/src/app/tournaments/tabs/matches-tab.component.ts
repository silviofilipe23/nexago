import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { buildBracketColumns, matchIsCanceled, matchIsCompleted, matchIsLive, matchSetWins, type TournamentMatch } from '../../data/matches-repository';
import type { TournamentCategoryOffer } from '../../data/tournaments-repository';
import { closedPartialsLabelOf, liveScoreLineOf, ordinalOf, shortCourtLabelOf, timeLabelOf } from '../tournament-format';
import { byScheduleTime, groupLabelOf, isMyMatch, qualificationOf, roundGroupsOf } from '../tournament-live.selectors';
import { TournamentLiveStore } from '../tournament-live.store';

export type MatchRowState = 'done' | 'live' | 'scheduled' | 'canceled' | 'tbd';

export interface MatchRowView {
  matchId: string;
  time: string;
  court: string | null;
  nameA: string;
  nameB: string;
  initialsA: [string, string];
  initialsB: [string, string];
  mineA: boolean;
  mineB: boolean;
  score: string | null;
  partials: string | null;
  state: MatchRowState;
  stateLabel: string;
  isMine: boolean;
  clickable: boolean;
}

export interface MatchSectionView {
  id: string;
  title: string;
  rows: MatchRowView[];
}

const STATE_LABEL: Record<MatchRowState, string> = {
  done: 'Encerrada',
  live: 'Ao vivo',
  scheduled: 'Agendada',
  canceled: 'Cancelada',
  tbd: 'A definir',
};

/**
 * Aba "Partidas & tabela": todos os jogos da categoria em ordem de rodada, com a classificação
 * do grupo ao lado. Sem tempo real — quem quer acompanhar placar mudando usa a aba Hoje ou o
 * detalhe da partida, que são as telas que assinam o listener.
 */
@Component({
  selector: 'app-matches-tab',
  imports: [NgTemplateOutlet, RouterLink],
  templateUrl: './matches-tab.component.html',
  styleUrl: './matches-tab.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MatchesTabComponent {
  protected readonly store = inject(TournamentLiveStore);

  protected readonly onlyMine = signal(false);
  private readonly manualCategoryId = signal<string | null>(null);
  private readonly manualPoolId = signal<string | null>(null);

  protected readonly categories = computed<TournamentCategoryOffer[]>(() => this.store.tournament()?.categories ?? []);

  protected readonly selectedCategory = computed<TournamentCategoryOffer | null>(() => {
    const cats = this.categories();
    if (cats.length === 0) return null;
    const id = this.manualCategoryId() ?? this.store.focusCategoryId();
    return cats.find((c) => c.id === id) ?? cats[0] ?? null;
  });

  private readonly categoryMatches = computed<TournamentMatch[]>(() => {
    const id = this.selectedCategory()?.id;
    return id ? this.store.matches().filter((m) => m.categoryId === id) : [];
  });

  protected readonly pools = computed(() => {
    const matches = this.categoryMatches();
    const ids = [...new Set(matches.filter((m) => m.poolId).map((m) => m.poolId))].sort();
    return ids.map((id) => ({ id, label: groupLabelOf(id, matches) }));
  });

  protected readonly selectedPoolId = computed<string | null>(() => {
    const pools = this.pools();
    if (pools.length === 0) return null;
    const manual = this.manualPoolId();
    if (manual && pools.some((p) => p.id === manual)) return manual;
    // Sem escolha explícita, abre no grupo em que o atleta joga.
    const focus = this.store.focusPoolId();
    if (focus && pools.some((p) => p.id === focus)) return focus;
    return pools[0]!.id;
  });

  /** Fase de grupos: seções por rodada. Mata-mata puro: seções por fase da chave. */
  protected readonly sections = computed<MatchSectionView[]>(() => {
    const poolId = this.selectedPoolId();
    const matches = this.categoryMatches();
    const sections = poolId ? this.groupSections(matches, poolId) : this.knockoutSections(matches);
    return sections.map((s) => ({ ...s, rows: this.onlyMine() ? s.rows.filter((r) => r.isMine) : s.rows })).filter((s) => s.rows.length > 0);
  });

  private groupSections(matches: readonly TournamentMatch[], poolId: string): MatchSectionView[] {
    const groups = roundGroupsOf(matches, poolId);
    const lastOpen = groups.filter((g) => !g.allCompleted)[0];
    return groups.map((g) => {
      const status = g.allCompleted ? 'encerrada' : g.hasLive ? 'em andamento' : g.round === lastOpen?.round && g.round === groups[groups.length - 1]?.round ? 'define a classificação' : 'a seguir';
      const title = [`Rodada ${g.displayNumber}`, g.startAt ? timeLabelOf(g.startAt) : null, status].filter((p): p is string => p != null).join(' · ');
      return { id: `round-${g.round}`, title, rows: g.matches.map((m) => this.rowOf(m)) };
    });
  }

  private knockoutSections(matches: readonly TournamentMatch[]): MatchSectionView[] {
    return buildBracketColumns(matches).map((column) => ({
      id: column.key,
      title: column.label,
      rows: [...column.matches].sort(byScheduleTime).map((m) => this.rowOf(m)),
    }));
  }

  private rowOf(m: TournamentMatch): MatchRowView {
    const state = this.stateOf(m);
    const showScore = state === 'done' || state === 'live';
    const [a, b] = matchSetWins(m);
    return {
      matchId: m.id,
      time: timeLabelOf(m.scheduleTime),
      court: shortCourtLabelOf(m.courtName),
      nameA: this.store.duoNameOf(m.teamAId, m.teamADescription),
      nameB: this.store.duoNameOf(m.teamBId, m.teamBDescription),
      initialsA: this.store.duoInitialsOf(m.teamAId),
      initialsB: this.store.duoInitialsOf(m.teamBId),
      mineA: this.store.isMyTeam(m.teamAId),
      mineB: this.store.isMyTeam(m.teamBId),
      score: showScore ? `${a} – ${b}` : null,
      partials: state === 'live' ? liveScoreLineOf(m) : closedPartialsLabelOf(m),
      state,
      stateLabel: state === 'scheduled' ? timeLabelOf(m.scheduleTime) : STATE_LABEL[state],
      isMine: isMyMatch(m, this.store.myTeamIds()),
      clickable: Boolean(m.teamAId && m.teamBId),
    };
  }

  private stateOf(m: TournamentMatch): MatchRowState {
    if (matchIsCompleted(m)) return 'done';
    if (matchIsLive(m)) return 'live';
    if (matchIsCanceled(m)) return 'canceled';
    return m.scheduleTime ? 'scheduled' : 'tbd';
  }

  // ── Lateral ────────────────────────────────────────────────
  protected readonly standingsTitle = computed(() => {
    const poolId = this.selectedPoolId();
    return poolId ? `${groupLabelOf(poolId, this.categoryMatches())} · classificação parcial` : null;
  });

  protected readonly standings = computed(() => {
    const poolId = this.selectedPoolId();
    if (!poolId) return [];
    const qualifiers = this.selectedCategory()?.qualifiersPerGroup ?? 2;
    const myTeamIds = this.store.myTeamIds();
    return this.store.standingsOf(poolId).map((s, index) => ({
      rank: index + 1,
      name: this.store.duoNameOf(s.teamId),
      isMe: myTeamIds.has(s.teamId),
      wins: s.wins,
      losses: this.categoryMatches().filter(
        (m) => m.poolId === poolId && matchIsCompleted(m) && (m.teamAId === s.teamId || m.teamBId === s.teamId) && m.winnerId !== s.teamId,
      ).length,
      sets: `${s.setsWon}–${s.setsLost}`,
      points: s.points,
      qualifies: index < qualifiers,
    }));
  });

  protected readonly standingsKicker = computed(() => {
    const poolId = this.selectedPoolId();
    if (!poolId) return null;
    const pool = this.categoryMatches().filter((m) => m.poolId === poolId);
    const rounds = new Set(pool.map((m) => m.round)).size;
    const playedRounds = new Set(pool.filter((m) => matchIsCompleted(m)).map((m) => m.round)).size;
    const qualifiers = this.selectedCategory()?.qualifiersPerGroup ?? 2;
    return `Após ${playedRounds} de ${rounds} rodadas · ${qualifiers} primeiros avançam`;
  });

  protected readonly qualificationText = computed<string | null>(() => {
    const poolId = this.selectedPoolId();
    const category = this.selectedCategory();
    if (!poolId || !category) return null;
    const myTeamId = [...this.store.myTeamIds()].find((id) => this.store.standingsOf(poolId).some((s) => s.teamId === id)) ?? null;
    const info = qualificationOf(this.categoryMatches(), poolId, myTeamId, this.store.standingsOf(poolId), category.qualifiersPerGroup);
    if (!info) return null;
    if (info.decided) {
      return info.qualifies
        ? `Grupo encerrado em ${ordinalOf(info.rank)}. Você avançou.`
        : `Grupo encerrado em ${ordinalOf(info.rank)}. Passavam os ${info.qualifiersPerGroup} primeiros.`;
    }
    const remaining = info.remainingMatches === 1 ? 'Falta 1 partida' : `Faltam ${info.remainingMatches} partidas`;
    return `Você está em ${ordinalOf(info.rank)}. ${remaining} no grupo.`;
  });

  protected selectCategory(id: string): void {
    this.manualCategoryId.set(id);
    this.manualPoolId.set(null);
  }

  protected selectPool(id: string): void {
    this.manualPoolId.set(id);
  }

  protected toggleOnlyMine(): void {
    this.onlyMine.update((v) => !v);
  }
}
