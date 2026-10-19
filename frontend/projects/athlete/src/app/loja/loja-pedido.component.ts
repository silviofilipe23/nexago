import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, signal, untracked } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from '../auth/auth.service';
import { formatCentsBRL } from '../data/cashback-model';
import { resolvePixQrSrc } from '../data/pix-qr';
import { STORE_CHECKOUT_API, type CreateOrderResult } from '../data/store-checkout-api';
import {
  formatDeadline,
  formatOrderDate,
  mapsUrl,
  orderInfo,
  orderProgress,
  orderWhere,
  pixCountdown,
  type StoreOrderItem,
  type StoreOrderView,
} from '../data/store-checkout-model';
import { STORE_REVIEWS_API } from '../data/store-reviews-api';
import { orderReviewState, type OrderReview } from '../data/store-reviews-model';
import { AtPanelShellComponent } from '../painel/at-panel-shell.component';
import { NxToastService } from '../shared/feedback';
import { NxSkeletonComponent } from '../shared/loading/nx-skeleton.component';
import { LojaAvaliarModalComponent } from './loja-avaliar-modal.component';
import type { PixHandoff } from './loja-checkout.component';
import { LojaOrderPillComponent, LojaOrderProgressComponent, orderPersonalized, rebuyItems } from './loja-order-bits';
import { trackLojaEvent } from './loja-telemetry';
import { LojaVitrineStore } from './loja-vitrine.store';

/** Sem o espelho do pedido depois disso (e sem o Pix na mão), é porque não existe ou não é dele. */
const NOT_FOUND_AFTER_MS = 8000;

/**
 * Loja · Pedido (web): o Pix logo depois do checkout e o acompanhamento depois. Lê a visão do
 * pedido (`storeOrderViews/{id}`, só do dono) ao vivo — o pagamento cai pelo webhook e a tela vira
 * sozinha. O Pix recém-criado chega pela navegação, porque o espelho nasce ~1 s depois.
 */
@Component({
  selector: 'app-loja-pedido',
  imports: [AtPanelShellComponent, RouterLink, NxSkeletonComponent, LojaOrderPillComponent, LojaOrderProgressComponent, LojaAvaliarModalComponent],
  providers: [LojaVitrineStore],
  templateUrl: './loja-pedido.component.html',
  styleUrl: './loja-pedido.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LojaPedidoComponent {
  protected readonly store = inject(LojaVitrineStore);
  private readonly api = inject(STORE_CHECKOUT_API);
  private readonly reviewsApi = inject(STORE_REVIEWS_API);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly toast = inject(NxToastService);

  protected readonly accountLabel = computed(() => this.auth.user()?.displayName?.trim() || 'Atleta');
  protected readonly guest = computed(() => !this.auth.isAuthenticated());

  private readonly params = toSignal(this.route.paramMap, { initialValue: this.route.snapshot.paramMap });
  protected readonly orderId = computed(() => this.params().get('id') ?? '');

  /** O Pix que o checkout acabou de gerar (some ao recarregar só se o navegador perder o state). */
  private readonly handoff = signal<CreateOrderResult | null>(
    readHandoff(this.router.getCurrentNavigation()?.extras.state) ?? readHandoff(globalThis.history?.state),
  );
  protected readonly order = signal<StoreOrderView | null>(null);
  private readonly loaded = signal(false);
  protected readonly notFound = signal(false);
  protected readonly now = signal(new Date());
  protected readonly qrSrc = signal<string | null>(null);
  protected readonly copied = signal(false);
  protected readonly rebuying = signal(false);
  /** A avaliação da compra deste pedido (06b), se já existe. */
  protected readonly review = signal<OrderReview | null>(null);
  protected readonly reviewOpen = signal(false);
  protected readonly productsById = computed(() => new Map(this.store.products().map((p) => [p.id, p])));
  protected readonly reviewState = computed(() => {
    const o = this.order();
    return o ? orderReviewState(o, this.review(), this.now()) : 'unavailable';
  });
  /** O pagamento caiu com a tela aberta: mostra o "Pagamento aprovado". */
  protected readonly justPaid = signal(false);

  protected readonly pix = computed(() => {
    const o = this.order();
    if (o) return o.status === 'pag' && o.pix ? { copyPaste: o.pix.copyPaste, expiresAt: o.pix.expiresAt } : null;
    const h = this.handoff();
    return h && h.orderId === this.orderId() ? { copyPaste: h.pix.copyPaste, expiresAt: new Date(h.pix.expiresAt) } : null;
  });
  protected readonly countdown = computed(() => {
    const p = this.pix();
    return p ? pixCountdown(p.expiresAt, this.now()) : null;
  });
  protected readonly expired = computed(() => this.pix() !== null && this.countdown() === null);
  protected readonly number = computed(() => this.order()?.number ?? this.handoff()?.number ?? '');
  protected readonly totalCents = computed(() => this.order()?.totalCents ?? this.handoff()?.totalCents ?? 0);
  protected readonly progress = computed(() => {
    const o = this.order();
    return o ? orderProgress(o) : null;
  });
  protected readonly info = computed(() => {
    const o = this.order();
    return o ? orderInfo(o) : '';
  });
  protected readonly where = computed(() => {
    const o = this.order();
    return o ? orderWhere(o) : '';
  });
  protected readonly arenaMaps = computed(() => {
    const d = this.order()?.delivery;
    return d?.type === 'arena' && d.address ? mapsUrl(d.address) : null;
  });
  protected readonly pickupDeadline = computed(() => {
    const d = this.order()?.delivery;
    return d?.type === 'arena' && d.pickupDeadline ? formatDeadline(d.pickupDeadline) : null;
  });
  protected readonly createdLabel = computed(() => {
    const o = this.order();
    return o ? formatOrderDate(o.createdAt, this.now()) : '';
  });
  protected readonly personalized = computed(() => {
    const o = this.order();
    return o ? orderPersonalized(o) : false;
  });

  constructor() {
    const destroyRef = inject(DestroyRef);
    const tick = setInterval(() => this.now.set(new Date()), 1000);
    destroyRef.onDestroy(() => clearInterval(tick));

    effect((onCleanup) => {
      const id = this.orderId();
      const uid = this.auth.user()?.uid ?? null;
      untracked(() => {
        this.order.set(null);
        this.loaded.set(false);
        this.notFound.set(false);
      });
      if (!id || !uid || !this.api) return;
      const timer = setTimeout(() => {
        if (!this.order() && !this.pix()) this.notFound.set(true);
      }, NOT_FOUND_AFTER_MS);
      const stop = this.api.watchOrder(
        id,
        (o) => {
          const before = this.order();
          if (before?.status === 'pag' && o && o.status !== 'pag' && o.status !== 'can') this.justPaid.set(true);
          this.order.set(o);
          this.loaded.set(true);
          // Sem espelho e sem o Pix do checkout: não é um pedido deste atleta.
          if (!o && !this.handoff()) this.notFound.set(true);
          if (o) this.notFound.set(false);
        },
        () => this.notFound.set(true),
      );
      trackLojaEvent('loja_pedido_view', { pedido_id: id });
      onCleanup(() => {
        clearTimeout(timer);
        stop();
      });
    });

    effect((onCleanup) => {
      const id = this.orderId();
      const uid = this.auth.user()?.uid ?? null;
      untracked(() => this.review.set(null));
      if (!id || !uid || !this.reviewsApi) return;
      const stop = this.reviewsApi.watchMyReviews(uid, (map) => this.review.set(map.get(id) ?? null), () => this.review.set(null));
      onCleanup(stop);
    });

    // QR gerado no navegador a partir do copia-e-cola (vetor, nítido em qualquer tela).
    effect(() => {
      const code = this.pix()?.copyPaste ?? null;
      untracked(() => {
        this.qrSrc.set(null);
        if (code) void resolvePixQrSrc({ qrCode: code }).then((src) => this.qrSrc.set(src));
      });
    });
  }

  protected openReview(): void {
    trackLojaEvent('loja_avaliar_open', { pedido_id: this.orderId(), origem: 'pedido' });
    this.reviewOpen.set(true);
  }

  protected money(cents: number): string {
    return formatCentsBRL(cents);
  }

  /** "Preta · M · ANTUNES · 2×" — sem o ponto solto quando não há variação. */
  protected itemDetail(i: StoreOrderItem): string {
    return [i.variantLabel, i.customizationLabel, `${i.qty}×`].filter(Boolean).join(' · ');
  }

  protected async copyPix(): Promise<void> {
    const code = this.pix()?.copyPaste;
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 2500);
      trackLojaEvent('loja_pix_copiar', { pedido_id: this.orderId() });
    } catch {
      this.toast.error('Não deu pra copiar', 'Selecione o código e copie na mão.');
    }
  }

  protected async rebuy(): Promise<void> {
    const o = this.order();
    if (!o || this.rebuying()) return;
    this.rebuying.set(true);
    trackLojaEvent('loja_comprar_de_novo', { pedido_id: o.id });
    try {
      const r = await rebuyItems(this.store, o.items);
      if (r.added === 0) {
        this.toast.warning('Nada pra repor', 'Os itens desse pedido saíram da loja ou são personalizados.');
        return;
      }
      if (r.skipped > 0) this.toast.info('Alguns itens ficaram de fora', 'Personalizados ou fora da loja não voltam pro carrinho.');
      await this.router.navigateByUrl('/loja/carrinho');
    } catch {
      this.toast.error('Não deu pra montar o carrinho', 'Tente de novo em instantes.');
    } finally {
      this.rebuying.set(false);
    }
  }
}

/** O state da navegação do checkout (ou o do histórico, num recarregar). */
function readHandoff(state: unknown): CreateOrderResult | null {
  const o = (state as Partial<PixHandoff> | null | undefined)?.order;
  return o && typeof o.orderId === 'string' && typeof o.pix?.copyPaste === 'string' ? o : null;
}
