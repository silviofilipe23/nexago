import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  computed,
  effect,
  inject,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { map } from 'rxjs';
import { AuthService } from '../auth/auth.service';
import { persistRedirectIntent } from '../auth/redirect-intent';
import { formatCentsBRL } from '../data/cashback-model';
import {
  STORE_SORT_OPTIONS,
  categoryLabel,
  collectionLabel,
  displayPriceCents,
  isStoreSort,
  liveBanners,
  matchesSearch,
  searchSuggestions,
  sortProducts,
  visibleCategories,
  type StoreBanner,
  type StoreProduct,
  type StoreSort,
} from '../data/store-showcase-model';
import { AtPanelShellComponent } from '../painel/at-panel-shell.component';
import { NxSkeletonComponent } from '../shared/loading/nx-skeleton.component';
import { LojaBannerComponent } from './loja-banner.component';
import { LojaProductCardComponent } from './loja-product-card.component';
import { trackLojaEvent } from './loja-telemetry';
import { LojaVitrineStore } from './loja-vitrine.store';

/** A grade cresce de 24 em 24 ao chegar no fim (spec). */
export const PAGE_SIZE = 24;

interface VitrineFilters {
  category: string | null;
  collection: string | null;
  query: string;
  sort: StoreSort;
}

/**
 * Loja · Vitrine (tela 01, portal web). Estado da grade mora na URL (`?categoria`, `?colecao`,
 * `?q`, `?ordem`) — voltar do produto devolve a mesma grade, e o link é compartilhável.
 * Aberta a visitante deslogado: favoritar e carrinho pedem login.
 */
@Component({
  selector: 'app-loja-vitrine',
  imports: [AtPanelShellComponent, RouterLink, NxSkeletonComponent, LojaBannerComponent, LojaProductCardComponent],
  providers: [LojaVitrineStore],
  templateUrl: './loja-vitrine.component.html',
  styleUrl: './loja-vitrine.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LojaVitrineComponent {
  protected readonly store = inject(LojaVitrineStore);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected readonly sortOptions = STORE_SORT_OPTIONS;
  protected readonly skeletonCards = Array.from({ length: 8 }, (_, i) => i);
  protected readonly now = new Date();

  protected readonly accountLabel = computed(() => this.auth.user()?.displayName?.trim() || 'Atleta');
  protected readonly guest = computed(() => !this.auth.isAuthenticated());

  // ── Filtros (fonte: URL) ─────────────────────────────────────────
  protected readonly filters = toSignal(
    this.route.queryParamMap.pipe(
      map(
        (q): VitrineFilters => ({
          category: q.get('categoria') || null,
          collection: q.get('colecao') || null,
          query: (q.get('q') ?? '').trim(),
          sort: isStoreSort(q.get('ordem')) ? (q.get('ordem') as StoreSort) : 'mais-vendidos',
        }),
      ),
    ),
    { initialValue: { category: null, collection: null, query: '', sort: 'mais-vendidos' } as VitrineFilters },
  );

  protected readonly categories = computed(() => visibleCategories(this.store.config(), this.store.products()));
  protected readonly banners = computed(() => liveBanners(this.store.config(), this.now));
  protected readonly benefits = computed(() => this.store.config().benefits);
  protected readonly sortLabel = computed(
    () => STORE_SORT_OPTIONS.find((o) => o.id === this.filters().sort)?.label ?? 'Mais vendidos',
  );

  protected readonly results = computed(() => {
    const f = this.filters();
    const config = this.store.config();
    const list = this.store.products().filter(
      (p) =>
        (f.category === null || p.category === f.category) &&
        (f.collection === null || p.collection === f.collection) &&
        matchesSearch(p, f.query, config),
    );
    return sortProducts(list, f.sort);
  });

  protected readonly heading = computed(() => {
    const f = this.filters();
    if (f.query) return `Resultados para "${f.query}"`;
    if (f.collection) return `Coleção ${collectionLabel(this.store.config(), f.collection) || f.collection}`;
    return null;
  });

  /** Busca sem resultado mostra os 4 mais vendidos de consolo (spec). */
  protected readonly fallbackProducts = computed(() => sortProducts(this.store.products(), 'mais-vendidos').slice(0, 4));

  protected readonly hasFilters = computed(() => {
    const f = this.filters();
    return f.category !== null || f.collection !== null || f.query !== '';
  });

  // ── Paginação ───────────────────────────────────────────────────
  protected readonly visibleCount = signal(PAGE_SIZE);
  protected readonly visibleResults = computed(() => this.results().slice(0, this.visibleCount()));
  protected readonly hasMore = computed(() => this.visibleCount() < this.results().length);

  // ── Busca ───────────────────────────────────────────────────────
  protected readonly searchDraft = signal('');
  protected readonly searchOpen = signal(false);
  protected readonly activeOption = signal(-1);
  protected readonly suggestions = computed(() =>
    searchSuggestions(this.store.products(), this.store.config(), this.searchDraft()),
  );
  protected readonly recentSearches = computed(() => this.store.shopper().recentSearches);
  /** Opções navegáveis por teclado, na ordem em que aparecem no painel. */
  protected readonly searchOptions = computed(() => {
    const draft = this.searchDraft().trim();
    if (draft.length < 2) {
      return this.recentSearches().map((term) => ({ kind: 'recent' as const, term }));
    }
    const s = this.suggestions();
    return [
      ...s.products.map((product) => ({ kind: 'product' as const, product })),
      ...s.categories.map((category) => ({ kind: 'category' as const, category })),
    ];
  });

  // ── Ordenar ─────────────────────────────────────────────────────
  protected readonly sortOpen = signal(false);

  private readonly gridTop = viewChild<ElementRef<HTMLElement>>('gridTop');
  private readonly sentinel = viewChild<ElementRef<HTMLElement>>('sentinel');

  constructor() {
    trackLojaEvent('loja_vitrine_view', { canal: 'web' });

    // Filtro novo = grade nova: volta para a primeira página e mantém o campo de busca em dia.
    effect(() => {
      const f = this.filters();
      untracked(() => {
        this.visibleCount.set(PAGE_SIZE);
        this.searchDraft.set(f.query);
      });
    });

    // Rolagem infinita: o sentinela no fim da grade puxa mais 24. Reobservar a cada página
    // faz o observer reavaliar — sem isso, sentinela que continua visível não dispara de novo.
    let observer: IntersectionObserver | null = null;
    effect((onCleanup) => {
      const el = this.sentinel()?.nativeElement;
      this.visibleCount();
      if (!el || typeof IntersectionObserver === 'undefined') return;
      observer ??= new IntersectionObserver(
        (entries) => {
          if (entries.some((e) => e.isIntersecting) && untracked(this.hasMore)) {
            this.visibleCount.update((n) => n + PAGE_SIZE);
          }
        },
        { rootMargin: '600px 0px' },
      );
      observer.observe(el);
      onCleanup(() => observer?.unobserve(el));
    });
    inject(DestroyRef).onDestroy(() => observer?.disconnect());
  }

  // ── Navegação ───────────────────────────────────────────────────

  private setParams(params: Record<string, string | null>, scrollToGrid = false): void {
    void this.router
      .navigate([], { relativeTo: this.route, queryParams: params, queryParamsHandling: 'merge' })
      .then(() => {
        if (scrollToGrid) this.scrollToGrid();
      });
  }

  /** Volta pro topo da grade só se ela já ficou para cima — trocar de chip no topo não pula. */
  private scrollToGrid(): void {
    const el = this.gridTop()?.nativeElement;
    if (el && el.getBoundingClientRect().top < 0) {
      el.scrollIntoView({ block: 'start', behavior: 'smooth' });
    }
  }

  protected selectCategory(id: string | null): void {
    if (id === this.filters().category) return;
    trackLojaEvent('loja_categoria_select', { categoria: id ?? 'tudo' });
    this.setParams({ categoria: id }, true);
  }

  protected selectSort(sort: StoreSort): void {
    this.sortOpen.set(false);
    this.setParams({ ordem: sort === 'mais-vendidos' ? null : sort }, true);
  }

  protected clearFilters(): void {
    this.setParams({ categoria: null, colecao: null, q: null }, true);
  }

  protected clearCollection(): void {
    this.setParams({ colecao: null });
  }

  protected openBanner(b: StoreBanner): void {
    trackLojaEvent('loja_banner_click', { campanha_id: b.id });
    this.setParams({ colecao: b.primary.collectionId, categoria: null, q: null }, true);
  }

  protected openBannerSecondary(b: StoreBanner): void {
    trackLojaEvent('loja_banner_click', { campanha_id: b.id, cta: 'secundario' });
    const sec = b.secondary;
    if (!sec) return;
    if (sec.categoryId) {
      this.setParams({ categoria: sec.categoryId, colecao: null, q: null }, true);
    } else if (sec.url?.startsWith('/')) {
      void this.router.navigateByUrl(sec.url);
    } else if (sec.url) {
      window.open(sec.url, '_blank', 'noopener');
    }
  }

  protected productClicked(p: StoreProduct, position: number): void {
    trackLojaEvent('loja_produto_click', { produto_id: p.id, posicao: position + 1 });
  }

  protected toggleFavorite(p: StoreProduct): void {
    if (!this.store.signedIn()) {
      this.goToLogin();
      return;
    }
    void this.store.toggleFavorite(p.id);
  }

  protected goToLogin(): void {
    const url = this.router.url;
    persistRedirectIntent(url);
    void this.router.navigate(['/entrar'], { queryParams: { redirect: url } });
  }

  // ── Busca ───────────────────────────────────────────────────────

  protected onSearchInput(value: string): void {
    this.searchDraft.set(value);
    this.searchOpen.set(true);
    this.activeOption.set(-1);
  }

  protected submitSearch(term = this.searchDraft()): void {
    const q = term.trim();
    this.searchOpen.set(false);
    this.activeOption.set(-1);
    if (q) {
      this.store.rememberSearch(q);
      const total = this.store.products().filter((p) => matchesSearch(p, q, this.store.config())).length;
      trackLojaEvent('loja_busca', { termo: q, resultados: total });
    }
    this.setParams({ q: q || null }, true);
  }

  protected onSearchKeydown(event: KeyboardEvent): void {
    const options = this.searchOptions();
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        this.searchOpen.set(true);
        this.activeOption.update((i) => (options.length === 0 ? -1 : (i + 1) % options.length));
        break;
      case 'ArrowUp':
        event.preventDefault();
        this.activeOption.update((i) => (options.length === 0 ? -1 : (i - 1 + options.length) % options.length));
        break;
      case 'Enter': {
        event.preventDefault();
        const chosen = options[this.activeOption()];
        if (chosen) this.pickOption(chosen);
        else this.submitSearch();
        break;
      }
      case 'Escape':
        this.searchOpen.set(false);
        this.activeOption.set(-1);
        break;
    }
  }

  protected pickOption(option: ReturnType<typeof this.searchOptions>[number]): void {
    this.searchOpen.set(false);
    this.activeOption.set(-1);
    if (option.kind === 'recent') {
      this.submitSearch(option.term);
    } else if (option.kind === 'product') {
      trackLojaEvent('loja_produto_click', { produto_id: option.product.id, posicao: 0, origem: 'busca' });
      void this.router.navigate(['/loja/p', option.product.slug || option.product.id], { state: { origem: 'busca' } });
    } else {
      trackLojaEvent('loja_categoria_select', { categoria: option.category.id, origem: 'busca' });
      this.setParams({ categoria: option.category.id, q: null }, true);
    }
  }

  /** Fecha o painel quando o foco sai do campo E do painel (clique numa sugestão não fecha antes). */
  protected onSearchFocusOut(event: FocusEvent, container: HTMLElement): void {
    if (!container.contains(event.relatedTarget as Node | null)) {
      this.searchOpen.set(false);
      this.activeOption.set(-1);
    }
  }

  protected onSortFocusOut(event: FocusEvent, container: HTMLElement): void {
    if (!container.contains(event.relatedTarget as Node | null)) this.sortOpen.set(false);
  }

  protected categoryName(id: string): string {
    return categoryLabel(this.store.config(), id);
  }

  protected priceOf(p: StoreProduct): string {
    return formatCentsBRL(displayPriceCents(p));
  }
}
