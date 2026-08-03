import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { map } from 'rxjs';
import { distinctPoolIds, matchIsCompleted, matchIsLive } from '../../data/matches-repository';
import { bracketFormatLabelOf } from '../tournament-format';
import { TournamentLiveStore } from '../tournament-live.store';

export interface CategoryCardView {
  id: string;
  name: string;
  formatLabel: string;
  /** "12/18 jogos" depois do sorteio; "8 duplas inscritas" antes dele. */
  progressLabel: string;
  liveCount: number;
  mine: boolean;
}

/**
 * Lista de categorias do torneio — a porta de entrada da aba "Categorias", no modelo do site da
 * Copa VH: escolhe-se a categoria primeiro e só depois o que ver dela.
 *
 * Quem está inscrito não passa por aqui: cai direto na própria categoria (`focusCategoryId`),
 * a menos que tenha pedido a lista explicitamente pelo "Todas as categorias".
 */
@Component({
  selector: 'app-category-list',
  imports: [RouterLink],
  templateUrl: './category-list.component.html',
  styleUrl: './category-list.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CategoryListComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly store = inject(TournamentLiveStore);

  constructor() {
    // O ponto de "ao vivo" nos cards precisa acompanhar a mesa em tempo real.
    this.destroyRef.onDestroy(this.store.acquireLive());

    effect(() => {
      if (this.store.loading()) return;
      const target = this.autoOpenCategoryId();
      if (!target) return;
      void this.router.navigate(['/torneios', this.store.tournamentId(), 'categorias', target], { replaceUrl: true });
    });
  }

  /** `?categoria=` (links antigos de `/chaves`) tem prioridade sobre o atalho do inscrito. */
  private readonly categoryParam = toSignal(this.route.queryParamMap.pipe(map((p) => p.get('categoria'))), {
    initialValue: this.route.snapshot.queryParamMap.get('categoria'),
  });

  private readonly autoOpenCategoryId = computed<string | null>(() => {
    const deepLink = this.categoryParam();
    if (deepLink && this.store.categoryById(deepLink)) return deepLink;
    if (this.store.categoryListRequested()) return null;
    const focus = this.store.focusCategoryId();
    return focus && this.store.categoryById(focus) ? focus : null;
  });

  protected readonly cards = computed<CategoryCardView[]>(() => {
    const categories = this.store.tournament()?.categories ?? [];
    const mine = this.store.myCategoryIds();
    return categories.map((c) => {
      const matches = this.store.matchesOfCategory(c.id);
      const hasGroups = distinctPoolIds(matches).length > 0;
      const played = matches.filter((m) => matchIsCompleted(m)).length;
      const enrolled = this.store.enrolledByCategory().get(c.id) ?? 0;
      return {
        id: c.id,
        name: c.categoryName,
        formatLabel: hasGroups ? 'Grupos + eliminatória' : bracketFormatLabelOf(c.bracketFormat),
        progressLabel: matches.length > 0 ? `${played}/${matches.length} jogos` : `${enrolled} ${enrolled === 1 ? 'dupla inscrita' : 'duplas inscritas'}`,
        liveCount: matches.filter((m) => matchIsLive(m)).length,
        mine: mine.has(c.id),
      };
    });
  });
}
