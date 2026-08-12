import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { matchIsCompleted } from '../../data/matches-repository';
import type { TournamentAnnouncement } from '../../data/tournament-announcements-repository';
import { roundsProgressLabel } from '../tournament-format';
import { groupLabelOf, hasPendingKnockout, isPending } from '../tournament-live.selectors';
import { TournamentLiveStore } from '../tournament-live.store';
import { focusViewContextOf, liveRowsOf, nextMatchViewOf, qualificationNoteOf, standingsViewOf, timelineOf } from '../focus/focus-views';

const ANNOUNCE_TIME = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });

/**
 * Aba "Hoje": o que o atleta precisa saber com o torneio rolando — próxima partida, o dia
 * inteiro em linha do tempo, situação no grupo, o que está em quadra e os avisos do organizador.
 *
 * É uma das duas telas que assinam o tempo real (`acquireLive`); a baixa acontece no destroy,
 * então sair da aba fecha o listener.
 */
@Component({
  selector: 'app-today-tab',
  imports: [RouterLink],
  templateUrl: './today-tab.component.html',
  styleUrl: './today-tab.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TodayTabComponent {
  protected readonly store = inject(TournamentLiveStore);
  private readonly destroyRef = inject(DestroyRef);

  constructor() {
    const release = this.store.acquireLive();
    this.destroyRef.onDestroy(release);
  }

  protected readonly categoryLine = computed(() => {
    const category = this.store.focusCategory();
    if (!category) return null;
    const poolId = this.store.focusPoolId();
    const phase = poolId ? 'fase de grupos e depois mata-mata' : 'mata-mata';
    return `${category.categoryName} · ${phase}`;
  });

  /** Fotografia do store consumida pelas funções puras de `focus/focus-views` — ver a
   *  documentação de `FocusViewContext` sobre por que essa indireção existe. */
  private readonly ctx = computed(() => focusViewContextOf(this.store));

  protected readonly nextMatch = computed(() => nextMatchViewOf(this.ctx(), this.store.now()));

  protected readonly timeline = computed(() => timelineOf(this.ctx(), this.store.dayTimeline()));

  /** Rodapé da timeline: existe mata-mata pela frente, mas o slot ainda não tem dono. */
  protected readonly pendingKnockout = computed(() => {
    const categoryId = this.store.focusCategoryId();
    if (!categoryId) return false;
    const stillAlive = this.store.myMatches().some((m) => m.categoryId === categoryId && isPending(m));
    return !stillAlive && hasPendingKnockout(this.store.matches(), categoryId);
  });

  protected readonly standings = computed(() =>
    standingsViewOf(this.ctx(), this.store.focusPoolId() ?? '', this.store.focusCategory()?.qualifiersPerGroup ?? 2, this.store.myTeamIdInFocus()),
  );

  protected readonly standingsTitle = computed(() => {
    const poolId = this.store.focusPoolId();
    return poolId ? `${groupLabelOf(poolId, this.store.matches())} · classificação parcial` : null;
  });

  protected readonly standingsKicker = computed(() => {
    const poolId = this.store.focusPoolId();
    if (!poolId) return null;
    const pool = this.store.matches().filter((m) => m.poolId === poolId);
    const qualifiers = this.store.focusCategory()?.qualifiersPerGroup ?? 2;
    const rounds = new Set(pool.map((m) => m.round)).size;
    const playedRounds = new Set(pool.filter((m) => matchIsCompleted(m)).map((m) => m.round)).size;
    return `${roundsProgressLabel(playedRounds, rounds)} · ${qualifiers} primeiros avançam`;
  });

  protected readonly qualificationNote = computed(() =>
    qualificationNoteOf(this.ctx(), this.store.focusPoolId() ?? '', this.store.focusCategory(), this.store.myTeamIdInFocus()),
  );

  protected readonly liveNow = computed(() => liveRowsOf(this.ctx(), this.store.focusCategoryId()));

  protected readonly announcements = computed(() =>
    this.store.announcements().map((a: TournamentAnnouncement) => ({
      id: a.id,
      time: a.createdAt ? ANNOUNCE_TIME.format(a.createdAt) : '',
      message: a.message,
    })),
  );

  protected readonly mapsUrl = computed(() => {
    const t = this.store.tournament();
    if (!t) return '';
    const q = t.locationAddress ?? `${t.location}, ${t.city}`;
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
  });
}
