import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { buildBracketColumns, matchIsCanceled, matchIsCompleted, matchIsLive, matchLiveCurrentSet, matchSetWins, type TournamentMatch } from '../../data/matches-repository';
import { timeLabelOf } from '../tournament-format';
import { byScheduleTime, displaySetsOf, groupLabelOf, isMyMatch, knockoutLabelOf, roundGroupsOf } from '../tournament-live.selectors';
import { TournamentLiveStore, type DuoPlayer } from '../tournament-live.store';
import { parentCategoryId } from './category-route';

export type MatchRowState = 'done' | 'live' | 'scheduled' | 'canceled' | 'tbd';

export interface MatchCardSideView {
  name: string;
  players: [DuoPlayer, DuoPlayer];
  mine: boolean;
  /** Slot ainda sem dupla ("Vencedor do jogo 3"). */
  tbd: boolean;
  /** Sets vencidos (encerrada) ou pontos do set atual (ao vivo); '—' sem placar. */
  score: string;
  won: boolean;
  lost: boolean;
  /** Ao vivo: está na frente no set atual. */
  leading: boolean;
}

export interface SetPillView {
  label: string;
  tone: 'win' | 'current';
}

export interface MatchRowView {
  matchId: string;
  /** "Grupo A · 17:30 · Quadra 1" — a linha mono do topo do card. */
  head: string;
  state: MatchRowState;
  stateLabel: string;
  /** Final e 3º lugar ganham o tratamento premium (ouro/bronze) da Copa VH. */
  stage: 'final' | 'third' | null;
  sideA: MatchCardSideView;
  sideB: MatchCardSideView;
  pills: SetPillView[];
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
 * Sub-visão "Partidas": todos os jogos da categoria em ordem de rodada, com filtro por grupo.
 *
 * A categoria vem da ROTA (`categorias/:categoriaId`), não de um chip local — ir para Grupos ou
 * Chave mantém exatamente a mesma categoria. A classificação saiu da lateral daqui: vive na
 * sub-visão "Grupos", com todos os grupos de uma vez.
 *
 * Assina o tempo real (`acquireLive`) como a aba Hoje e o detalhe: quando o organizador dá o
 * start na mesa, o selo vira "Ao vivo" e os pontos do set correm aqui sem recarregar.
 */
@Component({
  selector: 'app-category-matches',
  imports: [NgTemplateOutlet, RouterLink],
  templateUrl: './category-matches.component.html',
  styleUrl: './category-matches.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CategoryMatchesComponent {
  protected readonly store = inject(TournamentLiveStore);
  private readonly destroyRef = inject(DestroyRef);

  constructor() {
    this.destroyRef.onDestroy(this.store.acquireLive());
  }

  protected readonly onlyMine = signal(false);
  /** `null` = "Todos"; qualquer outro valor é o grupo escolhido no chip. */
  private readonly manualPoolId = signal<string | null>(null);
  private readonly poolTouched = signal(false);

  private readonly categoryId = parentCategoryId();

  private readonly categoryMatches = computed<TournamentMatch[]>(() => this.store.matchesOfCategory(this.categoryId()));

  protected readonly pools = computed(() => {
    const matches = this.categoryMatches();
    const ids = [...new Set(matches.filter((m) => m.poolId).map((m) => m.poolId))].sort();
    return ids.map((id) => ({ id, label: groupLabelOf(id, matches) }));
  });

  protected readonly selectedPoolId = computed<string | null>(() => {
    const pools = this.pools();
    if (pools.length === 0) return null;
    if (this.poolTouched()) {
      const manual = this.manualPoolId();
      return manual && pools.some((p) => p.id === manual) ? manual : null;
    }
    // Sem escolha explícita, quem joga a categoria abre no próprio grupo; quem assiste vê todos.
    const focus = this.store.focusPoolId();
    const mine = this.store.myCategoryIds().has(this.categoryId());
    return mine && focus && pools.some((p) => p.id === focus) ? focus : null;
  });

  /** Fase de grupos: seções por rodada. Mata-mata: seções por fase da chave. Em "Todos" de uma
   *  categoria com grupos + eliminatória, as duas listas aparecem em sequência. */
  protected readonly sections = computed<MatchSectionView[]>(() => {
    const matches = this.categoryMatches();
    const poolId = this.selectedPoolId();
    const hasGroups = this.pools().length > 0;

    const sections: MatchSectionView[] = [];
    if (hasGroups) sections.push(...this.groupSections(matches, poolId));
    if (!poolId) sections.push(...this.knockoutSections(matches.filter((m) => !m.poolId)));

    return sections.map((s) => ({ ...s, rows: this.onlyMine() ? s.rows.filter((r) => r.isMine) : s.rows })).filter((s) => s.rows.length > 0);
  });

  private groupSections(matches: readonly TournamentMatch[], poolId: string | null): MatchSectionView[] {
    const groups = roundGroupsOf(matches, poolId);
    const lastOpen = groups.filter((g) => !g.allCompleted)[0];
    return groups.map((g) => {
      const status = g.allCompleted
        ? 'encerrada'
        : g.hasLive
          ? 'em andamento'
          : g.round === lastOpen?.round && g.round === groups[groups.length - 1]?.round
            ? 'define a classificação'
            : 'a seguir';
      const title = [`Rodada ${g.displayNumber}`, g.startAt ? timeLabelOf(g.startAt) : null, status].filter((p): p is string => p != null).join(' · ');
      // Sem filtro de grupo a rodada mistura os grupos, então cada card diz de qual grupo é.
      return { id: `round-${g.round}`, title, rows: g.matches.map((m) => this.rowOf(m, poolId == null)) };
    });
  }

  private knockoutSections(matches: readonly TournamentMatch[]): MatchSectionView[] {
    return buildBracketColumns(matches).map((column) => ({
      id: column.key,
      title: column.label,
      rows: [...column.matches].sort(byScheduleTime).map((m) => this.rowOf(m, false)),
    }));
  }

  private rowOf(m: TournamentMatch, showGroup: boolean): MatchRowView {
    const state = this.stateOf(m);
    const showPills = state === 'done' || state === 'live';
    const group = showGroup && m.poolId ? groupLabelOf(m.poolId, this.categoryMatches()) : null;
    return {
      matchId: m.id,
      head: [group, timeLabelOf(m.scheduleTime), this.courtOf(m)].filter((p): p is string => p != null).join(' · '),
      state,
      stateLabel: state === 'scheduled' ? timeLabelOf(m.scheduleTime) : STATE_LABEL[state],
      stage: this.stageOf(m),
      sideA: this.sideViewOf(m, 'A', state),
      sideB: this.sideViewOf(m, 'B', state),
      pills: showPills ? displaySetsOf(m).map((s) => ({ label: `${s.a}·${s.b}`, tone: s.inProgress ? ('current' as const) : ('win' as const) })) : [],
      isMine: isMyMatch(m, this.store.myTeamIds()),
      clickable: Boolean(m.teamAId && m.teamBId),
    };
  }

  private courtOf(m: TournamentMatch): string | null {
    const court = m.courtName?.trim() ?? '';
    if (!court) return null;
    return /quadra/i.test(court) ? court : `Quadra ${court}`;
  }

  /** Final e 3º lugar têm identidade própria (ouro/bronze) — só no mata-mata. */
  private stageOf(m: TournamentMatch): 'final' | 'third' | null {
    if (m.poolId) return null;
    const label = knockoutLabelOf(m);
    if (label === 'Final' || label === 'Grand final') return 'final';
    if (label === '3º lugar') return 'third';
    return null;
  }

  private sideViewOf(m: TournamentMatch, side: 'A' | 'B', state: MatchRowState): MatchCardSideView {
    const teamId = side === 'A' ? m.teamAId : m.teamBId;
    const description = side === 'A' ? m.teamADescription : m.teamBDescription;
    const [setsA, setsB] = matchSetWins(m);
    const mySets = side === 'A' ? setsA : setsB;

    let score = '—';
    let won = false;
    let lost = false;
    let leading = false;
    if (state === 'done') {
      score = String(mySets);
      won = m.winnerId != null && m.winnerId === teamId;
      lost = m.winnerId != null && m.winnerId !== teamId;
    } else if (state === 'live') {
      const live = matchLiveCurrentSet(m);
      if (live) {
        const mine = side === 'A' ? live.a : live.b;
        const theirs = side === 'A' ? live.b : live.a;
        score = String(mine);
        leading = mine > theirs;
      } else {
        score = String(mySets);
      }
    }

    return {
      name: this.store.duoNameOf(teamId, description),
      players: this.store.duoPlayersOf(teamId),
      mine: this.store.isMyTeam(teamId),
      tbd: !teamId,
      score,
      won,
      lost,
      leading,
    };
  }

  private stateOf(m: TournamentMatch): MatchRowState {
    if (matchIsCompleted(m)) return 'done';
    if (matchIsLive(m)) return 'live';
    if (matchIsCanceled(m)) return 'canceled';
    return m.scheduleTime ? 'scheduled' : 'tbd';
  }

  protected selectPool(id: string | null): void {
    this.poolTouched.set(true);
    this.manualPoolId.set(id);
  }

  protected toggleOnlyMine(): void {
    this.onlyMine.update((v) => !v);
  }
}
