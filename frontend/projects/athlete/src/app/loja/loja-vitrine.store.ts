import { DestroyRef, Injectable, computed, effect, inject, signal } from '@angular/core';
import { AuthService } from '../auth/auth.service';
import {
  EMPTY_SHOPPER,
  STORE_SHOWCASE_SOURCE,
  withRecentSearch,
  type StoreShopper,
} from '../data/store-showcase-repository';
import {
  EMPTY_SHOWCASE_CONFIG,
  cartUnits,
  type StoreCartItem,
  type StoreProduct,
  type StoreShowcaseConfig,
} from '../data/store-showcase-model';
import { NxToastService } from '../shared/feedback';
import { trackLojaEvent } from './loja-telemetry';

/**
 * Estado ao vivo da vitrine: catálogo do canal web, config pública e — com sessão — favoritos,
 * buscas recentes e carrinho. Escopo da tela (vai em `providers` do componente): sair da Loja
 * fecha os listeners.
 */
@Injectable()
export class LojaVitrineStore {
  private readonly source = inject(STORE_SHOWCASE_SOURCE);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(NxToastService);

  readonly products = signal<StoreProduct[]>([]);
  readonly config = signal<StoreShowcaseConfig>(EMPTY_SHOWCASE_CONFIG);
  private readonly productsLoaded = signal(false);
  private readonly configLoaded = signal(false);
  readonly error = signal<string | null>(null);

  readonly shopper = signal<StoreShopper>(EMPTY_SHOPPER);
  readonly cart = signal<StoreCartItem[]>([]);
  /** O primeiro snapshot do carrinho chegou (o checkout não mostra "vazio" antes disso). */
  readonly cartLoaded = signal(false);
  /** Favorito alternado na hora, antes do servidor responder. Sai quando o listener confirma. */
  private readonly favoriteOverrides = signal<ReadonlyMap<string, boolean>>(new Map());

  readonly loading = computed(() => this.error() === null && !(this.productsLoaded() && this.configLoaded()));
  readonly cartUnits = computed(() => cartUnits(this.cart()));
  readonly signedIn = computed(() => this.auth.user() !== null);
  readonly favoriteIds = computed(() => {
    const ids = new Set(this.shopper().favoriteIds);
    for (const [id, on] of this.favoriteOverrides()) {
      if (on) ids.add(id);
      else ids.delete(id);
    }
    return ids;
  });

  private stopCatalog: Array<() => void> = [];
  private stopShopper: Array<() => void> = [];

  constructor() {
    const destroyRef = inject(DestroyRef);
    destroyRef.onDestroy(() => {
      this.stop(this.stopCatalog);
      this.stop(this.stopShopper);
    });
    this.startCatalog();

    effect(() => {
      const uid = this.auth.user()?.uid ?? null;
      this.stop(this.stopShopper);
      this.shopper.set(EMPTY_SHOPPER);
      this.cart.set([]);
      this.cartLoaded.set(false);
      this.favoriteOverrides.set(new Map());
      if (!uid || !this.source) return;
      this.stopShopper = [
        this.source.watchShopper(uid, (s) => {
          this.shopper.set(s);
          this.favoriteOverrides.set(new Map());
        }),
        this.source.watchCart(uid, (items) => {
          this.cart.set(items);
          this.cartLoaded.set(true);
        }),
      ];
    });
  }

  retry(): void {
    this.stop(this.stopCatalog);
    this.error.set(null);
    this.productsLoaded.set(false);
    this.configLoaded.set(false);
    this.startCatalog();
  }

  isFavorite(productId: string): boolean {
    return this.favoriteIds().has(productId);
  }

  /** Alterna na hora; se o servidor recusar, volta ao estado anterior e avisa. */
  async toggleFavorite(productId: string): Promise<void> {
    const uid = this.auth.user()?.uid;
    if (!uid || !this.source) return;
    const next = !this.isFavorite(productId);
    this.setOverride(productId, next);
    trackLojaEvent('loja_favoritar', { produto_id: productId, on: next });
    try {
      await this.source.setFavorite(uid, productId, next);
    } catch {
      this.setOverride(productId, !next);
      this.toast.error('Não deu pra salvar o favorito', 'Tente de novo em instantes.');
    }
  }

  /**
   * Põe no carrinho. Devolve as unidades que entraram (0 = já estava no teto do SKU), `null` com o
   * carrinho cheio; lança se o servidor recusar. Sem sessão não chama (a tela manda pro login).
   */
  async addToCart(item: { productId: string; skuId: string; qty: number; maxQty: number }): Promise<number | null> {
    const uid = this.auth.user()?.uid;
    if (!uid || !this.source) throw new Error('Sem sessão.');
    return this.source.addToCart(uid, item);
  }

  /** Arena de retirada: na hora na tela, gravada em `storeShoppers` (volta se falhar). */
  async choosePickupArena(arenaId: string): Promise<void> {
    const uid = this.auth.user()?.uid;
    if (!uid || !this.source) return;
    const previous = this.shopper();
    this.shopper.update((s) => ({ ...s, pickupArenaId: arenaId }));
    trackLojaEvent('loja_arena_trocar', { arena_id: arenaId });
    try {
      await this.source.setPickupArena(uid, arenaId);
    } catch {
      this.shopper.set(previous);
      this.toast.error('Não deu pra trocar a arena', 'Tente de novo em instantes.');
    }
  }

  /** Busca recente é conveniência: falhar em gravar não atrapalha a busca. */
  rememberSearch(term: string): void {
    const uid = this.auth.user()?.uid;
    if (!uid || !this.source || !term.trim()) return;
    const next = withRecentSearch(this.shopper().recentSearches, term);
    this.shopper.update((s) => ({ ...s, recentSearches: next }));
    void this.source.saveRecentSearches(uid, next).catch(() => undefined);
  }

  private setOverride(productId: string, on: boolean): void {
    this.favoriteOverrides.update((m) => new Map(m).set(productId, on));
  }

  private startCatalog(): void {
    if (!this.source) {
      this.error.set('Loja indisponível neste ambiente.');
      return;
    }
    this.stopCatalog = [
      this.source.watchProducts(
        (products) => {
          this.products.set(products);
          this.productsLoaded.set(true);
        },
        (e) => this.error.set(e instanceof Error ? e.message : String(e)),
      ),
      // Sem a config a vitrine ainda vende: some banner e benefícios, ficam as categorias padrão.
      this.source.watchConfig(
        (config) => {
          this.config.set(config);
          this.configLoaded.set(true);
        },
        () => {
          this.config.set(EMPTY_SHOWCASE_CONFIG);
          this.configLoaded.set(true);
        },
      ),
    ];
  }

  private stop(list: Array<() => void>): void {
    for (const unsubscribe of list.splice(0)) unsubscribe();
  }
}
