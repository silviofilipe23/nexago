import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, signal, untracked } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from '../auth/auth.service';
import { persistRedirectIntent } from '../auth/redirect-intent';
import { formatCentsBRL } from '../data/cashback-model';
import { hasCustomOptions } from '../data/store-customize-model';
import {
  axisValueAvailable,
  chooseAxisMessage,
  deliveryPriceCents,
  galleryPhotos,
  initialSelection,
  isColorAxis,
  lowStockCaption,
  maxQuantity,
  missingAxis,
  pickupReadyLabel,
  relatedProducts,
  selectAxisValue,
  selectedVariant,
  selectionPrice,
  soldOutMessage,
} from '../data/store-product-model';
import {
  cardBadge,
  categoryLabel,
  collectionLabel,
  displayPriceCents,
  formatRating,
  pixPriceCents,
  priceVaries,
  showRating,
  sortProducts,
  type StoreAxis,
  type StoreProduct,
  type StoreVariant,
} from '../data/store-showcase-model';
import { AtPanelShellComponent } from '../painel/at-panel-shell.component';
import { NxToastService } from '../shared/feedback';
import { NxSkeletonComponent } from '../shared/loading/nx-skeleton.component';
import { LojaMiniCartComponent, buildMiniCartLines, type MiniCartLine } from './loja-mini-cart.component';
import { LojaProdutoGalleryComponent } from './loja-produto-gallery.component';
import { LojaProductCardComponent } from './loja-product-card.component';
import { trackLojaEvent } from './loja-telemetry';
import { LojaVitrineStore } from './loja-vitrine.store';

/** Quanto o botão fica em "✓ Adicionado" e quanto o mini-carrinho fica aberto (spec). */
const ADDED_FLASH_MS = 1500;
const MINI_CART_MS = 4000;
const SHAKE_MS = 450;

interface ReceiveOption {
  id: string;
  kind: 'retirada' | 'entrega';
  title: string;
  subtitle: string;
  priceLabel: string;
  free: boolean;
}

/**
 * Loja · Produto (tela 02, portal web). Lê o mesmo catálogo da vitrine (`LojaVitrineStore`) e acha
 * o produto por slug (`/loja/p/:slug`) ou id (`/loja/produto/:id`, o link antigo). Regras em
 * `docs/business-rules/loja-produto.md`. Aberta a visitante: carrinho e favoritos pedem login, e a
 * adição volta do login pela URL (`?add=<sku>&qtd=<n>`).
 */
@Component({
  selector: 'app-loja-produto',
  imports: [
    AtPanelShellComponent,
    RouterLink,
    NxSkeletonComponent,
    LojaProdutoGalleryComponent,
    LojaProductCardComponent,
    LojaMiniCartComponent,
  ],
  providers: [LojaVitrineStore],
  templateUrl: './loja-produto.component.html',
  styleUrl: './loja-produto.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:keydown.escape)': 'closeOverlays()' },
})
export class LojaProdutoComponent {
  protected readonly store = inject(LojaVitrineStore);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly toast = inject(NxToastService);

  protected readonly now = new Date();
  protected readonly skeletonThumbs = [1, 2, 3, 4];
  protected readonly accountLabel = computed(() => this.auth.user()?.displayName?.trim() || 'Atleta');
  protected readonly guest = computed(() => !this.auth.isAuthenticated());

  private readonly params = toSignal(this.route.paramMap, { initialValue: this.route.snapshot.paramMap });
  private readonly query = toSignal(this.route.queryParamMap, { initialValue: this.route.snapshot.queryParamMap });
  private readonly key = computed(() => this.params().get('slug') ?? this.params().get('id') ?? '');

  protected readonly product = computed<StoreProduct | null>(() => {
    const key = this.key();
    const list = this.store.products();
    return list.find((p) => p.slug === key) ?? list.find((p) => p.id === key) ?? null;
  });
  /** Só o id: o produto muda a cada snapshot, e a seleção não pode voltar ao início com ele. */
  private readonly productId = computed(() => this.product()?.id ?? null);

  // ── Estado da página ────────────────────────────────────────────
  protected readonly selected = signal<Record<string, string>>({});
  protected readonly qty = signal(1);
  private readonly receive = signal<string | null>(null);
  private readonly pickedArenaId = signal<string | null>(null);
  /** Eixo que faltou no "Adicionar": mostra "Escolha um tamanho" até ser escolhido. */
  protected readonly attention = signal<string | null>(null);
  protected readonly shaking = signal<string | null>(null);
  protected readonly added = signal(false);
  protected readonly adding = signal(false);
  protected readonly cartPulse = signal(false);
  protected readonly miniCartOpen = signal(false);
  protected readonly arenaMenuOpen = signal(false);

  // ── Derivados ───────────────────────────────────────────────────
  protected readonly variant = computed(() => {
    const p = this.product();
    return p ? selectedVariant(p, this.selected()) : null;
  });
  protected readonly price = computed(() => {
    const p = this.product();
    return p ? selectionPrice(p, this.selected()) : null;
  });
  protected readonly pixLabel = computed(() => {
    const pct = this.store.config().benefits.pixDiscountPct;
    const price = this.price();
    return pct === null || price === null ? null : formatCentsBRL(pixPriceCents(price.cents, pct));
  });
  protected readonly maxQty = computed(() => {
    const p = this.product();
    return p ? maxQuantity(p, this.selected()) : 1;
  });
  protected readonly lowStock = computed(() => {
    const p = this.product();
    return p ? lowStockCaption(p, this.selected()) : null;
  });
  protected readonly photos = computed(() => {
    const p = this.product();
    return p ? galleryPhotos(p, this.selected()) : [];
  });
  protected readonly badge = computed(() => {
    const p = this.product();
    const b = p ? cardBadge(p, this.now) : null;
    return b ? { label: b.label, tone: b.label === 'Esgotado' ? 'dark' : 'orange' } : null;
  });
  protected readonly collection = computed(() => {
    const p = this.product();
    const label = p ? collectionLabel(this.store.config(), p.collection) : '';
    return label ? `Coleção ${label}` : null;
  });
  protected readonly rating = computed(() => {
    const p = this.product();
    return p && showRating(p) ? { avg: formatRating(p.ratingAvg!), count: p.ratingCount } : null;
  });
  protected readonly placeholderTone = computed(() => {
    switch (this.product()?.category) {
      case 'vestuario':
      case 'rede-quadra':
        return 'warm';
      case 'acessorios':
        return 'cool';
      default:
        return 'neutral';
    }
  });
  protected readonly totalCents = computed(() => (this.price()?.cents ?? 0) * this.qty());
  protected readonly related = computed(() => {
    const p = this.product();
    return p ? relatedProducts(p, this.store.products(), 3) : [];
  });
  /** Produto fora do catálogo do canal: os 4 mais vendidos de consolo (spec). */
  protected readonly fallbackProducts = computed(() => sortProducts(this.store.products(), 'mais-vendidos').slice(0, 4));

  // ── Como receber ────────────────────────────────────────────────
  private readonly pickupArenas = computed(() => (this.product()?.pickup ? this.store.config().pickupArenas : []));
  /** Escolhida aqui → a do atleta (`storeShoppers`) → a única ativa → nenhuma. */
  protected readonly pickupArena = computed(() => {
    const arenas = this.pickupArenas();
    const id = this.pickedArenaId() ?? this.store.shopper().pickupArenaId;
    return arenas.find((a) => a.arenaId === id) ?? (arenas.length === 1 ? arenas[0]! : null);
  });
  protected readonly arenaChoices = computed(() => this.pickupArenas());
  protected readonly receiveOptions = computed<ReceiveOption[]>(() => {
    const p = this.product();
    if (!p) return [];
    const options: ReceiveOption[] = [];
    const arenas = this.pickupArenas();
    if (arenas.length > 0) {
      const arena = this.pickupArena();
      options.push(
        arena
          ? {
              id: 'retirada',
              kind: 'retirada',
              title: `Retirar na ${arena.name}`,
              subtitle: pickupReadyLabel(arena.readyHours, this.now),
              priceLabel: 'Grátis',
              free: true,
            }
          : {
              id: 'retirada',
              kind: 'retirada',
              title: 'Retirar grátis numa arena parceira',
              subtitle: `${arenas.length} arenas · escolha a sua`,
              priceLabel: 'Grátis',
              free: true,
            },
      );
    }
    if (p.delivery) {
      const { modes, freeAboveCents } = this.store.config().delivery;
      for (const mode of modes) {
        const cents = deliveryPriceCents(mode, this.totalCents(), freeAboveCents);
        options.push({
          id: `entrega:${mode.id}`,
          kind: 'entrega',
          title: `Receber em casa · ${mode.name}`,
          subtitle: mode.description || 'Prazo confirmado no checkout',
          priceLabel: cents === null ? 'No checkout' : cents === 0 ? 'Grátis' : formatCentsBRL(cents),
          free: cents === 0,
        });
      }
    }
    return options;
  });
  protected readonly receiveChoice = computed(() => {
    const options = this.receiveOptions();
    const chosen = this.receive();
    return options.some((o) => o.id === chosen) ? chosen : (options[0]?.id ?? null);
  });
  protected readonly freeShippingHint = computed(() => {
    const p = this.product();
    const { freeAboveCents, modes } = this.store.config().delivery;
    if (!p?.delivery || freeAboveCents === null || modes.length === 0) return null;
    return this.totalCents() >= freeAboveCents ? null : `Frete grátis a partir de ${formatCentsBRL(freeAboveCents)}`;
  });

  // ── Mini-carrinho ───────────────────────────────────────────────
  protected readonly miniCartLines = computed<MiniCartLine[]>(() =>
    buildMiniCartLines(this.store.cart(), this.store.products()),
  );
  protected readonly miniCartSubtotal = computed(() => this.miniCartLines().reduce((t, l) => t + l.totalCents, 0));

  private timers: ReturnType<typeof setTimeout>[] = [];
  private miniCartTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingAddHandled = false;

  constructor() {
    // Produto novo (ou chegou o catálogo): seleção inicial, quantidade 1, evento de visualização.
    effect(() => {
      const id = this.productId();
      if (id === null) return;
      untracked(() => {
        const p = this.product()!;
        this.selected.set(initialSelection(p));
        this.qty.set(1);
        this.attention.set(null);
        this.receive.set(null);
        trackLojaEvent('loja_produto_view', { produto_id: id, origem: this.origin() });
      });
    });

    // Saldo caiu abaixo da quantidade escolhida (listener ou troca de SKU): ajusta pro teto.
    effect(() => {
      const max = this.maxQty();
      untracked(() => {
        if (this.qty() > max) this.qty.set(max);
      });
    });

    // Volta do login com uma adição pendente (`?add=<sku>&qtd=<n>`): conclui e limpa a URL.
    effect(() => {
      const p = this.product();
      const signedIn = this.store.signedIn();
      const skuId = this.query().get('add');
      if (!p || !signedIn || !skuId || this.pendingAddHandled) return;
      untracked(() => {
        this.pendingAddHandled = true;
        const v = p.variants.find((x) => x.id === skuId);
        if (v) {
          this.selected.set({ ...v.values });
          const qty = Number(this.query().get('qtd'));
          this.qty.set(Number.isInteger(qty) && qty > 0 ? Math.min(qty, Math.max(1, v.maxQty)) : 1);
          void this.addToCart();
        }
        void this.router.navigate([], {
          relativeTo: this.route,
          queryParams: { add: null, qtd: null },
          queryParamsHandling: 'merge',
          replaceUrl: true,
        });
      });
    });

    inject(DestroyRef).onDestroy(() => {
      for (const t of this.timers) clearTimeout(t);
      if (this.miniCartTimer) clearTimeout(this.miniCartTimer);
    });
  }

  // ── Eixos ───────────────────────────────────────────────────────

  protected isColor(axis: StoreAxis): boolean {
    return isColorAxis(axis);
  }

  protected available(axisIndex: number, valueId: string): boolean {
    const p = this.product();
    return p ? axisValueAvailable(p, axisIndex, valueId, this.selected()) : false;
  }

  protected selectedLabel(axis: StoreAxis): string {
    const id = this.selected()[axis.id];
    return axis.values.find((v) => v.id === id)?.label ?? '';
  }

  protected chooseMessage(axis: StoreAxis): string {
    return chooseAxisMessage(axis);
  }

  /**
   * Cor sem saldo continua escolhível (mostra as fotos). Outro eixo sem saldo não é escolhido:
   * vira o "Avise-me" daquela combinação.
   */
  protected pick(axis: StoreAxis, axisIndex: number, valueId: string): void {
    const p = this.product();
    if (!p) return;
    if (!this.isColor(axis) && !this.available(axisIndex, valueId)) {
      const sku = p.variants.find((v) =>
        p.axes.every((a) => (a.id === axis.id ? v.values[a.id] === valueId : v.values[a.id] === this.selected()[a.id])),
      );
      this.notifyMe(sku ?? null);
      return;
    }
    if (this.selected()[axis.id] === valueId) return;
    const next = selectAxisValue(p, this.selected(), axis.id, valueId);
    this.selected.set(next);
    if (this.attention() === axis.id) this.attention.set(null);
    const color = p.axes.find((a) => isColorAxis(a));
    const size = p.axes.find((a) => !isColorAxis(a));
    trackLojaEvent('loja_variacao_select', {
      produto_id: p.id,
      cor: color ? (next[color.id] ?? null) : null,
      tamanho: size ? (next[size.id] ?? null) : null,
    });
  }

  // ── Quantidade e carrinho ───────────────────────────────────────

  protected stepQty(delta: number): void {
    this.qty.update((n) => Math.min(this.maxQty(), Math.max(1, n + delta)));
  }

  protected async addToCart(): Promise<void> {
    const p = this.product();
    if (!p || this.adding()) return;
    if (p.soldOut) {
      this.notifyMe(null);
      return;
    }
    const missing = missingAxis(p, this.selected());
    if (missing) {
      this.attention.set(missing.id);
      this.shake(missing.id);
      return;
    }
    const variant = this.variant();
    if (!variant) return;
    if (!variant.inStock) {
      this.toast.warning(soldOutMessage(p, variant));
      return;
    }
    if (!this.store.signedIn()) {
      this.goToLogin({ add: variant.id, qtd: String(this.qty()) });
      return;
    }

    const qty = this.qty();
    this.adding.set(true);
    try {
      const added = await this.store.addToCart({ productId: p.id, skuId: variant.id, qty, maxQty: variant.maxQty });
      if (added === null) {
        this.toast.warning('Seu carrinho está cheio', 'Tire algum item antes de adicionar outro.');
      } else if (added === 0) {
        this.toast.info('Esse item já está no máximo no carrinho', `O limite é ${variant.maxQty} por compra.`);
      } else {
        if (added < qty) this.toast.info(`Entraram ${added} de ${qty}`, `O limite é ${variant.maxQty} por compra.`);
        trackLojaEvent('loja_add_carrinho', { sku: variant.id, qtd: added, preco: variant.priceCents });
        this.celebrate();
      }
    } catch {
      this.toast.error('Não deu pra adicionar ao carrinho', 'Tente de novo em instantes.');
    } finally {
      this.adding.set(false);
    }
  }

  /** Lista de espera ainda não existe: avisa e registra o interesse (spec: "Avise-me"). */
  protected notifyMe(sku: StoreVariant | null): void {
    const p = this.product();
    trackLojaEvent('loja_avise_me', { produto_id: p?.id ?? null, sku: sku?.id ?? null });
    this.toast.info('Aviso de reposição chega em breve', 'Por enquanto, volte aqui: a peça aparece assim que entrar.');
  }

  /** Abre a 02b com a cor e o tamanho já escolhidos (`?cor=preto&tam=m`, por id do eixo). */
  protected personalize(): void {
    const p = this.product();
    if (!p) return;
    if (!hasCustomOptions(p.customization)) {
      this.toast.info('A personalização chega em breve', 'Por enquanto, dá pra comprar a peça sem personalizar.');
      return;
    }
    void this.router.navigate(['/loja/p', p.slug || p.id, 'personalizar'], { queryParams: this.selected() });
  }

  protected toggleFavorite(): void {
    const p = this.product();
    if (!p) return;
    if (!this.store.signedIn()) {
      this.goToLogin();
      return;
    }
    void this.store.toggleFavorite(p.id);
  }

  private celebrate(): void {
    this.added.set(true);
    this.cartPulse.set(true);
    this.later(() => this.added.set(false), ADDED_FLASH_MS);
    this.later(() => this.cartPulse.set(false), 700);
    this.openMiniCart();
  }

  private shake(axisId: string): void {
    this.shaking.set(null);
    this.later(() => this.shaking.set(axisId), 0);
    this.later(() => this.shaking.set(null), SHAKE_MS);
  }

  private later(fn: () => void, ms: number): void {
    this.timers.push(setTimeout(fn, ms));
  }

  // ── Mini-carrinho ───────────────────────────────────────────────

  private openMiniCart(): void {
    this.miniCartOpen.set(true);
    this.scheduleMiniCartClose(MINI_CART_MS);
  }

  protected scheduleMiniCartClose(ms = MINI_CART_MS): void {
    if (this.miniCartTimer) clearTimeout(this.miniCartTimer);
    this.miniCartTimer = setTimeout(() => this.miniCartOpen.set(false), ms);
  }

  protected holdMiniCart(): void {
    if (this.miniCartTimer) clearTimeout(this.miniCartTimer);
    this.miniCartTimer = null;
  }

  protected closeOverlays(): void {
    this.miniCartOpen.set(false);
    this.arenaMenuOpen.set(false);
  }

  // ── Como receber ────────────────────────────────────────────────

  protected chooseReceive(option: ReceiveOption): void {
    this.receive.set(option.id);
    trackLojaEvent('loja_entrega_select', { tipo: option.kind, opcao: option.id });
  }

  protected chooseArena(arenaId: string): void {
    this.arenaMenuOpen.set(false);
    this.pickedArenaId.set(arenaId);
    this.receive.set('retirada');
    if (this.store.signedIn()) void this.store.choosePickupArena(arenaId);
  }

  protected onArenaFocusOut(event: FocusEvent, container: HTMLElement): void {
    if (!container.contains(event.relatedTarget as Node | null)) this.arenaMenuOpen.set(false);
  }

  // ── Navegação ───────────────────────────────────────────────────

  protected search(event: Event, term: string): void {
    event.preventDefault();
    const q = term.trim();
    void this.router.navigate(['/loja'], { queryParams: q ? { q } : {} });
  }

  protected photoSwiped(index: number): void {
    trackLojaEvent('loja_foto_swipe', { produto_id: this.product()?.id ?? null, foto: index + 1 });
  }

  protected relatedClicked(p: StoreProduct): void {
    trackLojaEvent('loja_relacionado_click', { produto_id: p.id });
  }

  protected goToLogin(extra: Record<string, string> = {}): void {
    const tree = this.router.createUrlTree([], {
      relativeTo: this.route,
      queryParams: extra,
      queryParamsHandling: 'merge',
    });
    const url = this.router.serializeUrl(tree);
    persistRedirectIntent(url);
    void this.router.navigate(['/entrar'], { queryParams: { redirect: url } });
  }

  /** Vitrine, busca e relacionados passam a origem no `state` da navegação; sem ela, link direto. */
  private origin(): string {
    const state = typeof history === 'undefined' ? null : (history.state as { origem?: unknown } | null);
    return typeof state?.origem === 'string' ? state.origem : 'link';
  }

  // ── Formatação ──────────────────────────────────────────────────

  protected money(cents: number): string {
    return formatCentsBRL(cents);
  }

  protected categoryName(id: string): string {
    return categoryLabel(this.store.config(), id);
  }

  protected cardPrice(p: StoreProduct): string {
    return (priceVaries(p) ? 'a partir de ' : '') + formatCentsBRL(displayPriceCents(p));
  }
}
