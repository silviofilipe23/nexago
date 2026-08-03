import { ChangeDetectionStrategy, Component, computed, effect, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, NavigationEnd, Router, RouterLink, RouterOutlet } from '@angular/router';
import { filter, map, startWith } from 'rxjs';
import { distinctPoolIds } from '../../data/matches-repository';
import type { TournamentCategoryOffer } from '../../data/tournaments-repository';
import { bracketFormatLabelOf } from '../tournament-format';
import { categoryViewsOf, defaultCategoryViewOf, type CategoryViewId } from '../tournament-live.selectors';
import { TournamentLiveStore } from '../tournament-live.store';

const VIEW_LABEL: Record<CategoryViewId, string> = {
  partidas: 'Partidas',
  grupos: 'Grupos',
  chave: 'Chave',
};

/**
 * Casca de UMA categoria: cabeçalho + segmentado Partidas/Grupos/Chave + `<router-outlet>`.
 *
 * A categoria vive na ROTA (`/torneios/:id/categorias/:categoriaId/...`), não num signal local de
 * cada sub-visão. Era exatamente o contrário antes: "Partidas" e "Chaves" eram abas do torneio,
 * cada uma com sua própria seleção de categoria, então trocar de aba jogava o atleta de volta na
 * categoria em foco. Com o id na URL, trocar de sub-visão nunca troca de categoria — e o link
 * compartilhado leva a outra pessoa exatamente para a mesma vista.
 */
@Component({
  selector: 'app-category-shell',
  imports: [RouterLink, RouterOutlet],
  templateUrl: './category-shell.component.html',
  styleUrl: './category-shell.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CategoryShellComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  protected readonly store = inject(TournamentLiveStore);

  protected readonly categoryId = toSignal(this.route.paramMap.pipe(map((p) => p.get('categoriaId') ?? '')), {
    initialValue: this.route.snapshot.paramMap.get('categoriaId') ?? '',
  });

  private readonly activeView = toSignal(
    this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      map(() => this.currentView()),
      startWith(this.currentView()),
    ),
    { initialValue: this.currentView() },
  );

  protected readonly category = computed<TournamentCategoryOffer | null>(() => this.store.categoryById(this.categoryId()));

  private readonly categoryMatches = computed(() => this.store.matchesOfCategory(this.categoryId()));

  private readonly poolIds = computed(() => distinctPoolIds(this.categoryMatches()));

  protected readonly views = computed(() =>
    categoryViewsOf({ hasMatches: this.categoryMatches().length > 0, hasGroups: this.poolIds().length > 0 }).map((id) => ({
      id,
      label: VIEW_LABEL[id],
    })),
  );

  protected readonly hasOtherCategories = computed(() => (this.store.tournament()?.categories.length ?? 0) > 1);

  /** "4 grupos · 11 duplas · top 2 avançam" — a linha de contexto do modelo da Copa VH. */
  protected readonly metaLine = computed(() => {
    const category = this.category();
    if (!category) return '';
    const parts: string[] = [];
    const groups = this.poolIds().length;
    if (groups > 0) parts.push(groups === 1 ? 'grupo único' : `${groups} grupos`);
    else parts.push(bracketFormatLabelOf(category.bracketFormat));
    const duos = this.duoCount();
    if (duos > 0) parts.push(duos === 1 ? '1 dupla' : `${duos} duplas`);
    if (groups > 0) parts.push(`top ${category.qualifiersPerGroup} avançam`);
    return parts.join(' · ');
  });

  /** Duplas na disputa: as que já entraram na chave; antes do sorteio, as inscrições pagas. */
  private duoCount(): number {
    const inBracket = new Set(this.categoryMatches().flatMap((m) => [m.teamAId, m.teamBId]).filter((id) => id.length > 0));
    return inBracket.size > 0 ? inBracket.size : (this.store.enrolledByCategory().get(this.categoryId()) ?? 0);
  }

  constructor() {
    // Categoria inexistente (link velho, categoria removida) volta para a lista em vez de deixar
    // a casca vazia na tela.
    effect(() => {
      if (this.store.loading() || !this.store.tournament()) return;
      if (this.category()) return;
      void this.router.navigate(['/torneios', this.store.tournamentId(), 'categorias'], { replaceUrl: true });
    });

    // `/categorias/:id` sem sub-visão resolve para a primeira disponível assim que os dados
    // chegam — e uma sub-visão que deixou de existir (grupos de uma categoria sem grupos)
    // também cai aqui.
    effect(() => {
      if (this.store.loading()) return;
      const views = this.views().map((v) => v.id);
      const current = this.activeView();
      if (current && views.includes(current)) return;
      void this.router.navigate([defaultCategoryViewOf(views)], { relativeTo: this.route, replaceUrl: true });
    });
  }

  private currentView(): CategoryViewId | null {
    const child = this.route.snapshot.firstChild?.routeConfig?.path ?? '';
    return child.length > 0 ? (child as CategoryViewId) : null;
  }

  protected isActive(id: CategoryViewId): boolean {
    return this.activeView() === id;
  }

  /** Marca que o atleta pediu a lista: sem isso a lista o devolveria à própria categoria. */
  protected openCategoryList(): void {
    this.store.categoryListRequested.set(true);
  }
}
