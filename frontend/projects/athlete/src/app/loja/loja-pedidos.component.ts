import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../auth/auth.service';
import { formatCentsBRL } from '../data/cashback-model';
import { STORE_CHECKOUT_API } from '../data/store-checkout-api';
import { STORE_REVIEWS_API } from '../data/store-reviews-api';
import { orderReviewState, type OrderReview, type OrderReviewState } from '../data/store-reviews-model';
import {
  ORDER_FILTERS,
  formatDeadline,
  formatOrderDate,
  mapsUrl,
  orderActive,
  orderInfo,
  orderMatchesFilter,
  orderMatchesSearch,
  orderProgress,
  orderTitle,
  orderWhere,
  type OrderFilter,
  type StoreOrderView,
} from '../data/store-checkout-model';
import { AtPanelShellComponent } from '../painel/at-panel-shell.component';
import { NxToastService } from '../shared/feedback';
import { NxSkeletonComponent } from '../shared/loading/nx-skeleton.component';
import { LojaAvaliarModalComponent } from './loja-avaliar-modal.component';
import { LojaOrderPillComponent, LojaOrderProgressComponent, orderPersonalized, rebuyItems } from './loja-order-bits';
import { trackLojaEvent } from './loja-telemetry';
import { LojaVitrineStore } from './loja-vitrine.store';

/** Miniaturas no card antes do "+N". */
const THUMBS = 3;

interface OrderCard {
  order: StoreOrderView;
  title: string;
  date: string;
  where: string;
  info: string;
  thumbs: (string | null)[];
  more: number;
  progress: { steps: string[]; step: number } | null;
  personalized: boolean;
  mapsUrl: string | null;
  review: OrderReviewState;
}

/**
 * Loja · Meus pedidos (web 06). Lista a visão dos pedidos do atleta (`storeOrderViews`, só do dono),
 * mais recentes primeiro, com filtro por momento e busca por número ou produto. Pedido entregue ou
 * retirado abre a avaliação da compra (06b) aqui mesmo.
 */
@Component({
  selector: 'app-loja-pedidos',
  imports: [AtPanelShellComponent, RouterLink, NxSkeletonComponent, LojaOrderPillComponent, LojaOrderProgressComponent, LojaAvaliarModalComponent],
  providers: [LojaVitrineStore],
  templateUrl: './loja-pedidos.component.html',
  styleUrl: './loja-pedidos.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LojaPedidosComponent {
  protected readonly store = inject(LojaVitrineStore);
  private readonly api = inject(STORE_CHECKOUT_API);
  private readonly reviewsApi = inject(STORE_REVIEWS_API);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly toast = inject(NxToastService);

  protected readonly accountLabel = computed(() => this.auth.user()?.displayName?.trim() || 'Atleta');
  protected readonly guest = computed(() => !this.auth.isAuthenticated());
  protected readonly filters = ORDER_FILTERS;
  protected readonly skeletons = [1, 2, 3];
  private readonly now = new Date();

  protected readonly orders = signal<StoreOrderView[]>([]);
  protected readonly loaded = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly filter = signal<OrderFilter>('todos');
  protected readonly search = signal('');
  protected readonly rebuying = signal<string | null>(null);
  /** Avaliações do atleta por pedido; vazio enquanto carrega (ou sem a rule no ar). */
  protected readonly reviews = signal<ReadonlyMap<string, OrderReview>>(new Map());
  /** Pedido com a janela de avaliação aberta. */
  protected readonly reviewing = signal<StoreOrderView | null>(null);
  protected readonly productsById = computed(() => new Map(this.store.products().map((p) => [p.id, p])));

  protected readonly counts = computed(() => {
    const list = this.orders();
    return Object.fromEntries(this.filters.map((f) => [f.id, list.filter((o) => orderMatchesFilter(o, f.id)).length])) as Record<
      OrderFilter,
      number
    >;
  });

  private readonly cards = computed<OrderCard[]>(() =>
    this.orders()
      .filter((o) => orderMatchesFilter(o, this.filter()) && orderMatchesSearch(o, this.search()))
      .map((o) => ({
        order: o,
        title: orderTitle(o),
        date: formatOrderDate(o.createdAt, this.now),
        where: orderWhere(o),
        info: orderInfo(o),
        thumbs: o.items.slice(0, THUMBS).map((i) => i.imageUrl),
        more: Math.max(0, o.items.length - THUMBS),
        progress: orderProgress(o),
        personalized: orderPersonalized(o),
        mapsUrl: o.status === 'ret' && o.delivery.type === 'arena' && o.delivery.address ? mapsUrl(o.delivery.address) : null,
        review: orderReviewState(o, this.reviews().get(o.id), this.now),
      })),
  );
  protected readonly active = computed(() => this.cards().filter((c) => orderActive(c.order.status)));
  protected readonly past = computed(() => this.cards().filter((c) => !orderActive(c.order.status)));
  protected readonly sections = computed(() =>
    [
      { label: 'Em andamento', cards: this.active() },
      { label: 'Anteriores', cards: this.past() },
    ].filter((s) => s.cards.length > 0),
  );

  /** O destaque da lateral: o pedido na arena esperando o atleta. */
  protected readonly ready = computed(() => {
    const o = this.orders().find((x) => x.status === 'ret' && x.delivery.type === 'arena');
    if (!o || o.delivery.type !== 'arena') return null;
    return {
      id: o.id,
      number: o.number,
      place: o.delivery.placeName ?? 'Arena',
      code: o.delivery.pickupCode ?? '—',
      deadline: o.delivery.pickupDeadline ? formatDeadline(o.delivery.pickupDeadline) : null,
    };
  });
  protected readonly awaitingPix = computed(() => this.orders().find((o) => o.status === 'pag' && o.pix) ?? null);

  constructor() {
    effect((onCleanup) => {
      const uid = this.auth.user()?.uid ?? null;
      untracked(() => {
        this.orders.set([]);
        this.loaded.set(false);
        this.error.set(null);
      });
      if (!uid || !this.api) {
        if (!this.api) untracked(() => this.error.set('Pedidos indisponíveis neste ambiente.'));
        return;
      }
      const stop = this.api.watchOrders(
        uid,
        (list) => {
          this.orders.set(list);
          this.loaded.set(true);
        },
        (e) => {
          this.error.set(e instanceof Error ? e.message : String(e));
          this.loaded.set(true);
        },
      );
      onCleanup(stop);
    });
    effect((onCleanup) => {
      const uid = this.auth.user()?.uid ?? null;
      untracked(() => this.reviews.set(new Map()));
      if (!uid || !this.reviewsApi) return;
      // Sem a avaliação no ar (rule/callable ainda não deployadas), o botão continua "Avaliar compra".
      const stop = this.reviewsApi.watchMyReviews(uid, (map) => this.reviews.set(map), () => this.reviews.set(new Map()));
      onCleanup(stop);
    });
    trackLojaEvent('loja_pedidos_view');
  }

  protected openReview(order: StoreOrderView): void {
    trackLojaEvent('loja_avaliar_open', { pedido_id: order.id, origem: 'pedidos' });
    this.reviewing.set(order);
  }

  protected reviewOf(orderId: string): OrderReview | null {
    return this.reviews().get(orderId) ?? null;
  }

  protected money(cents: number): string {
    return formatCentsBRL(cents);
  }

  protected async rebuy(order: StoreOrderView): Promise<void> {
    if (this.rebuying()) return;
    this.rebuying.set(order.id);
    trackLojaEvent('loja_comprar_de_novo', { pedido_id: order.id });
    try {
      const r = await rebuyItems(this.store, order.items);
      if (r.added === 0) {
        this.toast.warning('Nada pra repor', 'Os itens desse pedido saíram da loja ou são personalizados.');
        return;
      }
      if (r.skipped > 0) this.toast.info('Alguns itens ficaram de fora', 'Personalizados ou fora da loja não voltam pro carrinho.');
      await this.router.navigateByUrl('/loja/carrinho');
    } catch {
      this.toast.error('Não deu pra montar o carrinho', 'Tente de novo em instantes.');
    } finally {
      this.rebuying.set(null);
    }
  }
}
