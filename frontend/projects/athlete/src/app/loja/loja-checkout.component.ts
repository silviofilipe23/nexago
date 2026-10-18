import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, signal, untracked } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../auth/auth.service';
import { formatCentsBRL } from '../data/cashback-model';
import { STORE_CHECKOUT_API, checkoutErrorOf, type CreateOrderResult } from '../data/store-checkout-api';
import {
  LINE_PROBLEM_LABEL,
  addressArea,
  addressLine,
  appliedCoupon,
  cartLineKey,
  defaultAddressId,
  quoteBlocker,
  removeAddress,
  upsertAddress,
  type CheckoutDeliveryInput,
  type CheckoutQuote,
  type CheckoutRequest,
  type QuoteLineProblem,
  type StoreAddress,
} from '../data/store-checkout-model';
import { deliveryPriceCents, pickupReadyLabel, variantLabel } from '../data/store-product-model';
import { MAX_QTY_PER_ITEM, cartLineExtraCents, type StoreDeliveryMode, type StorePickupArena } from '../data/store-showcase-model';
import { AtPanelShellComponent } from '../painel/at-panel-shell.component';
import { NxToastService } from '../shared/feedback';
import { NxSkeletonComponent } from '../shared/loading/nx-skeleton.component';
import { LojaEnderecoModalComponent, type AddressSaved } from './loja-endereco-modal.component';
import { trackLojaEvent } from './loja-telemetry';
import { LojaVitrineStore } from './loja-vitrine.store';

/** Espera entre a última mudança (quantidade, entrega, cupom) e a nova cotação. */
const QUOTE_DEBOUNCE_MS = 250;

interface CheckoutLine {
  key: string;
  name: string;
  detail: string;
  slug: string | null;
  coverUrl: string | null;
  qty: number;
  maxQty: number;
  totalCents: number;
  problem: QuoteLineProblem | null;
}

/** Estado que volta pela navegação até a tela do Pix (o espelho do pedido chega ~1 s depois). */
export interface PixHandoff {
  order: CreateOrderResult;
}

/**
 * Loja · Carrinho e checkout (web 03/04/05). O cliente monta o pedido (linhas, entrega, cupom) e
 * o servidor cota tudo de novo (`quoteStoreCheckout`); o "Pagar com Pix" manda o total que a
 * tela mostrou e o servidor recusa se mudou. Regras em `docs/business-rules/loja-checkout.md`.
 */
@Component({
  selector: 'app-loja-checkout',
  imports: [AtPanelShellComponent, RouterLink, NxSkeletonComponent, LojaEnderecoModalComponent],
  providers: [LojaVitrineStore],
  templateUrl: './loja-checkout.component.html',
  styleUrl: './loja-checkout.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LojaCheckoutComponent {
  protected readonly store = inject(LojaVitrineStore);
  private readonly api = inject(STORE_CHECKOUT_API);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly toast = inject(NxToastService);

  protected readonly now = new Date();
  protected readonly accountLabel = computed(() => this.auth.user()?.displayName?.trim() || 'Atleta');
  protected readonly guest = computed(() => !this.auth.isAuthenticated());
  protected readonly lineSkeletons = [1, 2, 3];

  // ── Escolhas do atleta ──────────────────────────────────────────
  private readonly kindChoice = signal<'arena' | 'casa' | null>(null);
  private readonly arenaChoice = signal<string | null>(null);
  private readonly addressChoice = signal<string | null>(null);
  private readonly modeChoice = signal<string | null>(null);
  protected readonly couponInput = signal('');
  protected readonly couponCode = signal<string | null>(null);
  protected readonly arenaMenuOpen = signal(false);

  // ── Endereços ───────────────────────────────────────────────────
  protected readonly addresses = signal<StoreAddress[]>([]);
  protected readonly addressModal = signal<{ address: StoreAddress | null } | null>(null);
  protected readonly savingAddress = signal(false);

  // ── Cotação e pagamento ─────────────────────────────────────────
  protected readonly quote = signal<CheckoutQuote | null>(null);
  /** Para qual pedido (escolhas + carrinho) a cotação atual vale. */
  private readonly quotedKey = signal<string | null>(null);
  protected readonly quoteError = signal<string | null>(null);
  protected readonly paying = signal(false);
  protected readonly payError = signal<string | null>(null);
  protected readonly needCpf = signal(false);
  protected readonly cpf = signal('');
  protected readonly cpfError = signal<string | null>(null);

  // ── Derivados ───────────────────────────────────────────────────
  protected readonly arenas = computed(() => this.store.config().pickupArenas);
  protected readonly modes = computed<StoreDeliveryMode[]>(() =>
    this.store.config().delivery.modes.filter((m) => m.priceCents !== null),
  );

  protected readonly kind = computed<'arena' | 'casa' | null>(() => {
    const choice = this.kindChoice();
    if (choice === 'arena' && this.arenas().length > 0) return 'arena';
    if (choice === 'casa' && this.modes().length > 0) return 'casa';
    if (this.arenas().length > 0) return 'arena';
    return this.modes().length > 0 ? 'casa' : null;
  });

  protected readonly arena = computed<StorePickupArena | null>(() => {
    const list = this.arenas();
    const id = this.arenaChoice() ?? this.store.shopper().pickupArenaId;
    return list.find((a) => a.arenaId === id) ?? list[0] ?? null;
  });

  protected readonly address = computed<StoreAddress | null>(() => {
    const list = this.addresses();
    const id = this.addressChoice();
    return list.find((a) => a.id === id) ?? list.find((a) => a.id === defaultAddressId(list)) ?? null;
  });

  protected readonly mode = computed<StoreDeliveryMode | null>(() => {
    const list = this.modes();
    return list.find((m) => m.id === this.modeChoice()) ?? list[0] ?? null;
  });

  private readonly delivery = computed<CheckoutDeliveryInput | null>(() => {
    if (this.kind() === 'arena') {
      const a = this.arena();
      return a ? { type: 'arena', arenaId: a.arenaId } : null;
    }
    if (this.kind() === 'casa') {
      const a = this.address();
      const m = this.mode();
      // Sem endereço ainda: cota sem entrega (o servidor devolve "entrega_faltando" e o resumo segue).
      return a && m ? { type: 'casa', addressId: a.id, modeId: m.id } : null;
    }
    return null;
  });

  protected readonly request = computed<CheckoutRequest>(() => ({
    channel: 'web',
    delivery: this.delivery(),
    couponCode: this.couponCode(),
  }));

  /** Muda a cada linha/quantidade do carrinho: a cotação velha deixa de valer. */
  private readonly cartKey = computed(() =>
    this.store
      .cart()
      .map((i) => `${cartLineKey(i)}:${i.qty}`)
      .join('|'),
  );
  private readonly requestKey = computed(() => `${JSON.stringify(this.request())}#${this.cartKey()}`);
  protected readonly quoteFresh = computed(() => this.quote() !== null && this.quotedKey() === this.requestKey());

  protected readonly lines = computed<CheckoutLine[]>(() => {
    const byId = new Map(this.store.products().map((p) => [p.id, p]));
    const quoted = new Map((this.quote()?.lines ?? []).map((l) => [l.key, l]));
    const fresh = this.quoteFresh();
    return this.store.cart().map((item) => {
      const key = cartLineKey(item);
      const p = byId.get(item.productId);
      const v = p?.variants.find((x) => x.id === item.skuId);
      const q = quoted.get(key);
      const custom = item.customization ? 'Personalizada' : '';
      const name = p?.name ?? q?.name ?? 'Produto';
      const variant = p && v ? variantLabel(p, v) : (q?.variantLabel ?? '');
      return {
        key,
        name,
        detail: [variant, custom].filter(Boolean).join(' · '),
        slug: p?.slug ?? null,
        coverUrl: p?.coverUrl ?? q?.imageUrl ?? null,
        qty: item.qty,
        maxQty: Math.max(1, Math.min(v?.maxQty ?? item.qty, MAX_QTY_PER_ITEM)),
        // Cotação em dia manda (preço e adicional atuais); antes dela, a conta local da vitrine.
        totalCents: q && fresh && q.qty === item.qty ? q.totalCents : v ? (v.priceCents + cartLineExtraCents(item)) * item.qty : (q?.totalCents ?? 0),
        // Produto fora da vitrine: o servidor confirma, mas a tela já marca.
        problem: q?.problem ?? (p && v ? null : 'indisponivel'),
      };
    });
  });

  protected readonly units = computed(() => this.store.cart().reduce((n, i) => n + i.qty, 0));
  protected readonly localSubtotal = computed(() => this.lines().reduce((n, l) => n + l.totalCents, 0));
  protected readonly coupon = computed(() => appliedCoupon(this.quote()));
  protected readonly couponProblem = computed(() => {
    const c = this.quote()?.coupon;
    return c && c.problem !== null && this.couponCode() !== null ? (c.message ?? 'Cupom inválido.') : null;
  });

  protected readonly blocker = computed(() => {
    const q = this.quote();
    if (!q) return null;
    if (this.kind() === 'casa' && this.addresses().length === 0) return 'Cadastre um endereço de entrega.';
    if (this.couponProblem()) return 'Remova ou troque o cupom pra seguir.';
    return quoteBlocker(q);
  });

  protected readonly canPay = computed(
    () => this.quoteFresh() && this.blocker() === null && !this.paying() && (this.quote()?.totalCents ?? 0) > 0,
  );

  protected readonly arenaOption = computed(() => {
    const a = this.arena();
    return a ? { title: `Retirar na ${a.name}`, subtitle: pickupReadyLabel(a.readyHours, this.now) } : null;
  });

  protected readonly homeOption = computed(() => {
    const list = this.modes();
    if (list.length === 0) return null;
    const subtotal = this.quote()?.subtotalCents ?? this.localSubtotal();
    const free = this.store.config().delivery.freeAboveCents;
    const prices = list.map((m) => deliveryPriceCents(m, subtotal, free) ?? 0);
    const min = Math.min(...prices);
    const selected = this.mode();
    return {
      subtitle: selected?.description || selected?.name || 'Escolha o prazo',
      priceLabel: min === 0 ? 'Grátis' : `${list.length > 1 ? 'a partir de ' : ''}${formatCentsBRL(min)}`,
      free: min === 0,
    };
  });

  /** Frete grátis a partir de X: quanto falta (o desenho de incentivo do resumo). */
  protected readonly freeShippingGap = computed(() => {
    const free = this.store.config().delivery.freeAboveCents;
    const q = this.quote();
    if (this.kind() !== 'casa' || free === null || !q || q.freeShipping) return null;
    const gap = free - q.subtotalCents;
    return gap > 0 ? formatCentsBRL(gap) : null;
  });

  private quoteTimer: ReturnType<typeof setTimeout> | null = null;
  private quoteSeq = 0;

  constructor() {
    const destroyRef = inject(DestroyRef);
    destroyRef.onDestroy(() => {
      if (this.quoteTimer) clearTimeout(this.quoteTimer);
    });

    // Endereços do atleta (só o dono lê).
    effect((onCleanup) => {
      const uid = this.auth.user()?.uid ?? null;
      untracked(() => this.addresses.set([]));
      if (!uid || !this.api) return;
      const stop = this.api.watchAddresses(uid, (items) => this.addresses.set(items));
      onCleanup(stop);
    });

    // Cota de novo a cada mudança — só depois do carrinho carregar e com o atleta logado.
    effect(() => {
      const key = this.requestKey();
      const req = this.request();
      const ready = this.store.cartLoaded() && this.store.cart().length > 0 && this.auth.user() !== null;
      untracked(() => {
        if (ready) this.scheduleQuote(req, key);
      });
    });

    effect(() => {
      if (this.store.cartLoaded()) untracked(() => trackLojaEvent('loja_carrinho_view', { itens: this.units() }));
    });
  }

  protected money(cents: number): string {
    return formatCentsBRL(cents);
  }

  protected problemLabel(problem: QuoteLineProblem): string {
    return LINE_PROBLEM_LABEL[problem];
  }

  protected addressLine(a: StoreAddress): string {
    return addressLine(a);
  }

  protected addressArea(a: StoreAddress): string {
    return `${addressArea(a)} · ${a.zip.replace(/^(\d{5})(\d{3})$/, '$1-$2')}`;
  }

  protected modePrice(m: StoreDeliveryMode): { label: string; free: boolean } {
    const subtotal = this.quote()?.subtotalCents ?? this.localSubtotal();
    const cents = deliveryPriceCents(m, subtotal, this.store.config().delivery.freeAboveCents) ?? 0;
    return { label: cents === 0 ? 'Grátis' : formatCentsBRL(cents), free: cents === 0 };
  }

  // ── Quote ───────────────────────────────────────────────────────

  private scheduleQuote(req: CheckoutRequest, key: string): void {
    if (this.quoteTimer) clearTimeout(this.quoteTimer);
    this.quoteTimer = setTimeout(() => void this.runQuote(req, key), QUOTE_DEBOUNCE_MS);
  }

  private async runQuote(req: CheckoutRequest, key: string): Promise<void> {
    if (!this.api) {
      this.quoteError.set('Checkout indisponível neste ambiente.');
      return;
    }
    const seq = ++this.quoteSeq;
    try {
      const q = await this.api.quote(req);
      if (seq !== this.quoteSeq) return;
      this.quote.set(q);
      this.quotedKey.set(key);
      this.quoteError.set(null);
    } catch (e) {
      if (seq !== this.quoteSeq) return;
      this.quoteError.set(checkoutErrorOf(e).message.replace('fechar o pedido', 'calcular o total'));
    }
  }

  protected retryQuote(): void {
    this.quoteError.set(null);
    this.scheduleQuote(this.request(), this.requestKey());
  }

  // ── Carrinho ────────────────────────────────────────────────────

  protected async setQty(line: CheckoutLine, qty: number): Promise<void> {
    const uid = this.auth.user()?.uid;
    if (!uid || !this.api) return;
    const next = Math.max(0, Math.min(qty, line.maxQty));
    if (next === line.qty) return;
    trackLojaEvent(next === 0 ? 'loja_carrinho_remover' : 'loja_carrinho_qtd', { linha: line.key, qtd: next });
    try {
      await this.api.setCartLineQty(uid, line.key, next);
    } catch {
      this.toast.error('Não deu pra atualizar o carrinho', 'Tente de novo em instantes.');
    }
  }

  // ── Entrega ─────────────────────────────────────────────────────

  protected chooseKind(kind: 'arena' | 'casa'): void {
    this.kindChoice.set(kind);
    trackLojaEvent('loja_entrega_select', { tipo: kind, tela: 'checkout' });
  }

  protected chooseArena(arenaId: string): void {
    this.arenaChoice.set(arenaId);
    this.arenaMenuOpen.set(false);
    this.kindChoice.set('arena');
    void this.store.choosePickupArena(arenaId);
  }

  protected onArenaFocusOut(event: FocusEvent, container: HTMLElement): void {
    if (!container.contains(event.relatedTarget as Node | null)) this.arenaMenuOpen.set(false);
  }

  protected chooseAddress(id: string): void {
    this.addressChoice.set(id);
  }

  protected chooseMode(id: string): void {
    this.modeChoice.set(id);
  }

  protected openAddress(address: StoreAddress | null): void {
    this.addressModal.set({ address });
  }

  protected async saveAddress(event: AddressSaved): Promise<void> {
    const uid = this.auth.user()?.uid;
    if (!uid || !this.api) return;
    const next = upsertAddress(this.addresses(), event.address, event.makeMain);
    if (next === null) {
      this.toast.warning('Limite de endereços', 'Exclua um endereço antigo pra cadastrar outro.');
      return;
    }
    const isNew = !this.addresses().some((a) => a.id === event.address.id);
    this.savingAddress.set(true);
    try {
      await this.api.saveAddresses(uid, next);
      this.addresses.set(next);
      this.addressChoice.set(event.address.id);
      this.addressModal.set(null);
      trackLojaEvent('loja_endereco_salvar', { novo: isNew });
    } catch {
      this.toast.error('Não deu pra salvar o endereço', 'Confira a conexão e tente de novo.');
    } finally {
      this.savingAddress.set(false);
    }
  }

  protected async deleteAddress(id: string): Promise<void> {
    const uid = this.auth.user()?.uid;
    if (!uid || !this.api) return;
    const next = removeAddress(this.addresses(), id);
    this.savingAddress.set(true);
    try {
      await this.api.saveAddresses(uid, next);
      this.addresses.set(next);
      if (this.addressChoice() === id) this.addressChoice.set(null);
      this.addressModal.set(null);
    } catch {
      this.toast.error('Não deu pra excluir o endereço', 'Tente de novo em instantes.');
    } finally {
      this.savingAddress.set(false);
    }
  }

  // ── Cupom ───────────────────────────────────────────────────────

  protected applyCoupon(event: Event): void {
    event.preventDefault();
    const code = this.couponInput().trim().toUpperCase();
    if (!code) return;
    this.couponCode.set(code);
    trackLojaEvent('loja_cupom_aplicar', { cupom: code });
  }

  protected removeCoupon(): void {
    this.couponCode.set(null);
    this.couponInput.set('');
  }

  // ── Pagamento ───────────────────────────────────────────────────

  protected onCpfInput(value: string): void {
    this.cpf.set(value.replace(/\D/g, '').slice(0, 11));
    this.cpfError.set(null);
  }

  protected cpfLabel(): string {
    const d = this.cpf();
    return d
      .replace(/^(\d{3})(\d)/, '$1.$2')
      .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
      .replace(/\.(\d{3})(\d{1,2})$/, '.$1-$2');
  }

  protected async pay(): Promise<void> {
    const q = this.quote();
    if (!this.api || !q || !this.canPay()) return;
    if (this.needCpf() && this.cpf().length !== 11) {
      this.cpfError.set('CPF com 11 números.');
      return;
    }
    this.paying.set(true);
    this.payError.set(null);
    trackLojaEvent('loja_checkout_pagar', { total: q.totalCents, entrega: this.kind(), cupom: this.couponCode() });
    try {
      const order = await this.api.createOrder({
        ...this.request(),
        expectedTotalCents: q.totalCents,
        cpf: this.needCpf() ? this.cpf() : null,
      });
      const handoff: PixHandoff = { order };
      await this.router.navigate(['/loja/pedidos', order.orderId], { state: handoff });
    } catch (e) {
      const err = checkoutErrorOf(e);
      if (err.quote) {
        this.quote.set(err.quote);
        this.quotedKey.set(this.requestKey());
      }
      switch (err.kind) {
        case 'cpf':
          this.needCpf.set(true);
          this.payError.set(err.message);
          break;
        case 'changed':
          this.toast.warning('O total mudou', 'Confira o novo valor antes de pagar.');
          break;
        default:
          this.payError.set(err.message);
      }
    } finally {
      this.paying.set(false);
    }
  }
}
