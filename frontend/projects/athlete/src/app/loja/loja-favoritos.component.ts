import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, signal, untracked } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../auth/auth.service';
import { formatCentsBRL } from '../data/cashback-model';
import {
  FAVORITES_FILTERS,
  FAVORITE_ACTION_LABELS,
  bulkAddMessage,
  bulkAddPlan,
  directVariant,
  favoriteAction,
  favoriteBadge,
  matchesFavoritesFilter,
  orderedFavorites,
  relatedToFavorites,
  type FavoritesFilter,
} from '../data/store-favorites-model';
import { hasCustomOptions } from '../data/store-customize-model';
import {
  categoryLabel,
  displayPriceCents,
  pixPriceCents,
  priceVaries,
  strikePriceCents,
  type StoreProduct,
} from '../data/store-showcase-model';
import { AtPanelShellComponent } from '../painel/at-panel-shell.component';
import { NxToastService } from '../shared/feedback';
import { NxSkeletonComponent } from '../shared/loading/nx-skeleton.component';
import { LojaMiniCartComponent, buildMiniCartLines } from './loja-mini-cart.component';
import { trackLojaEvent } from './loja-telemetry';
import { LojaVitrineStore } from './loja-vitrine.store';

const MINI_CART_MS = 4000;

/**
 * Loja · Favoritos (tela 07, portal web). Lê os favoritos do atleta (`storeShoppers`) sobre o
 * mesmo catálogo da vitrine. Regras em `docs/business-rules/loja-favoritos.md`.
 */
@Component({
  selector: 'app-loja-favoritos',
  imports: [AtPanelShellComponent, RouterLink, NxSkeletonComponent, LojaMiniCartComponent],
  providers: [LojaVitrineStore],
  templateUrl: './loja-favoritos.component.html',
  styleUrl: './loja-favoritos.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:keydown.escape)': 'miniCartOpen.set(false)' },
})
export class LojaFavoritosComponent {
  protected readonly store = inject(LojaVitrineStore);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly toast = inject(NxToastService);

  protected readonly accountLabel = computed(() => this.auth.user()?.displayName?.trim() || 'Atleta');
  protected readonly filters = FAVORITES_FILTERS;
  protected readonly skeletonCards = [1, 2, 3, 4];

  protected readonly filter = signal<FavoritesFilter>('todos');
  protected readonly adding = signal<string | null>(null);
  protected readonly bulkAdding = signal(false);
  protected readonly cartPulse = signal(false);
  protected readonly miniCartOpen = signal(false);

  /** Favoritos na ordem da tela (o último favoritado primeiro), já com o coração otimista. */
  protected readonly favorites = computed(() =>
    orderedFavorites(this.store.shopper().favoriteIds, this.store.products()).filter((p) =>
      this.store.favoriteIds().has(p.id),
    ),
  );
  protected readonly counts = computed(() => {
    const favs = this.favorites();
    return Object.fromEntries(FAVORITES_FILTERS.map((f) => [f.id, favs.filter((p) => matchesFavoritesFilter(p, f.id)).length])) as Record<
      FavoritesFilter,
      number
    >;
  });
  protected readonly visible = computed(() => this.favorites().filter((p) => matchesFavoritesFilter(p, this.filter())));
  protected readonly plan = computed(() => bulkAddPlan(this.favorites()));
  protected readonly related = computed(() => relatedToFavorites(this.favorites(), this.store.products(), 6));
  protected readonly miniCartLines = computed(() => buildMiniCartLines(this.store.cart(), this.store.products()));
  protected readonly miniCartSubtotal = computed(() => this.miniCartLines().reduce((t, l) => t + l.totalCents, 0));

  private viewTracked = false;
  private miniCartTimer: ReturnType<typeof setTimeout> | null = null;
  private pulseTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    // Um evento por visita, quando o catálogo e os favoritos já chegaram.
    effect(() => {
      if (this.store.loading() || this.viewTracked) return;
      const total = this.favorites().length;
      untracked(() => {
        this.viewTracked = true;
        trackLojaEvent('loja_favoritos_view', { canal: 'web', total });
      });
    });

    inject(DestroyRef).onDestroy(() => {
      if (this.miniCartTimer) clearTimeout(this.miniCartTimer);
      if (this.pulseTimer) clearTimeout(this.pulseTimer);
    });
  }

  // ── Card ────────────────────────────────────────────────────────

  protected badge(p: StoreProduct) {
    return favoriteBadge(p);
  }

  protected customizable(p: StoreProduct): boolean {
    return hasCustomOptions(p.customization);
  }

  protected action(p: StoreProduct) {
    return favoriteAction(p);
  }

  protected actionLabel(p: StoreProduct): string {
    return FAVORITE_ACTION_LABELS[favoriteAction(p)];
  }

  protected async act(p: StoreProduct): Promise<void> {
    switch (favoriteAction(p)) {
      case 'avise':
        trackLojaEvent('loja_avise_me', { produto_id: p.id, sku: null });
        this.toast.info('Aviso de reposição chega em breve', 'Por enquanto, volte aqui: a peça aparece assim que entrar.');
        return;
      case 'personalizar':
        void this.router.navigate(['/loja/p', p.slug || p.id, 'personalizar']);
        return;
      case 'opcoes':
        void this.router.navigate(['/loja/p', p.slug || p.id], { state: { origem: 'favoritos' } });
        return;
      case 'adicionar':
        await this.addOne(p);
        return;
    }
  }

  private async addOne(p: StoreProduct): Promise<void> {
    const v = directVariant(p);
    if (!v || this.adding()) return;
    this.adding.set(p.id);
    try {
      const added = await this.store.addToCart({ productId: p.id, skuId: v.id, qty: 1, maxQty: v.maxQty });
      if (added === null) {
        this.toast.warning('Seu carrinho está cheio', 'Tire algum item antes de adicionar outro.');
      } else if (added === 0) {
        this.toast.info('Esse item já está no máximo no carrinho', `O limite é ${v.maxQty} por compra.`);
      } else {
        trackLojaEvent('loja_add_carrinho', { sku: v.id, qtd: added, preco: v.priceCents, origem: 'favoritos' });
        this.celebrate();
      }
    } catch {
      this.toast.error('Não deu pra adicionar ao carrinho', 'Tente de novo em instantes.');
    } finally {
      this.adding.set(null);
    }
  }

  /** Um de cada favorito sem escolha a fazer; os que pedem cor/tamanho ficam de fora. */
  protected async addAvailable(): Promise<void> {
    const { add, needChoice } = this.plan();
    if (add.length === 0 || this.bulkAdding()) return;
    this.bulkAdding.set(true);
    let added = 0;
    try {
      for (const p of add) {
        const v = directVariant(p)!;
        const n = await this.store.addToCart({ productId: p.id, skuId: v.id, qty: 1, maxQty: v.maxQty });
        if (n === null) break;
        if (n > 0) {
          added += 1;
          trackLojaEvent('loja_add_carrinho', { sku: v.id, qtd: n, preco: v.priceCents, origem: 'favoritos' });
        }
      }
    } catch {
      this.toast.error('Não deu pra adicionar tudo', 'Confira o carrinho e tente de novo.');
    } finally {
      this.bulkAdding.set(false);
    }
    if (added === 0) {
      this.toast.info('Esses itens já estão no carrinho', 'Ou o carrinho chegou ao limite de itens.');
      return;
    }
    // Só o aviso (com quantos pedem escolha) e o pulso da sacola: o mini-carrinho abriria no mesmo
    // canto e cobriria o aviso.
    const msg = bulkAddMessage(added, needChoice);
    this.toast.success(msg.title, msg.detail);
    this.pulseCart();
  }

  protected toggleFavorite(p: StoreProduct): void {
    void this.store.toggleFavorite(p.id);
  }

  protected chooseFilter(id: FavoritesFilter): void {
    this.filter.set(id);
  }

  private celebrate(): void {
    this.pulseCart();
    this.miniCartOpen.set(true);
    this.scheduleMiniCartClose(MINI_CART_MS);
  }

  private pulseCart(): void {
    this.cartPulse.set(true);
    if (this.pulseTimer) clearTimeout(this.pulseTimer);
    this.pulseTimer = setTimeout(() => this.cartPulse.set(false), 700);
  }

  protected scheduleMiniCartClose(ms = MINI_CART_MS): void {
    if (this.miniCartTimer) clearTimeout(this.miniCartTimer);
    this.miniCartTimer = setTimeout(() => this.miniCartOpen.set(false), ms);
  }

  protected holdMiniCart(): void {
    if (this.miniCartTimer) clearTimeout(this.miniCartTimer);
    this.miniCartTimer = null;
  }

  protected search(event: Event, term: string): void {
    event.preventDefault();
    const q = term.trim();
    void this.router.navigate(['/loja'], { queryParams: q ? { q } : {} });
  }

  // ── Formatação ──────────────────────────────────────────────────

  protected categoryName(id: string): string {
    return categoryLabel(this.store.config(), id);
  }

  protected price(p: StoreProduct): string {
    return formatCentsBRL(displayPriceCents(p));
  }

  protected from(p: StoreProduct): boolean {
    return priceVaries(p);
  }

  protected strike(p: StoreProduct): string | null {
    const cents = strikePriceCents(p);
    return cents === null ? null : formatCentsBRL(cents);
  }

  protected pix(p: StoreProduct): string | null {
    const pct = this.store.config().benefits.pixDiscountPct;
    return pct === null || p.soldOut ? null : formatCentsBRL(pixPriceCents(displayPriceCents(p), pct));
  }

  protected tone(p: StoreProduct): string {
    switch (p.category) {
      case 'vestuario':
      case 'rede-quadra':
        return 'warm';
      case 'acessorios':
        return 'cool';
      default:
        return 'neutral';
    }
  }
}
