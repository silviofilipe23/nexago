import { Component, computed, input, provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { AuthService } from '../auth/auth.service';
import { STORE_CHECKOUT_API, type CreateOrderInput, type CreateOrderResult, type StoreCheckoutApi } from '../data/store-checkout-api';
import { quoteFromData, type CheckoutQuote, type CheckoutRequest, type StoreAddress, type StoreOrderView } from '../data/store-checkout-model';
import { STORE_SHOWCASE_SOURCE, type StoreShopper, type StoreShowcaseSource } from '../data/store-showcase-repository';
import { storeConfigFromDoc, storeProductFromDoc, type StoreCartItem, type StoreProduct, type StoreShowcaseConfig } from '../data/store-showcase-model';
import { AtPanelShellComponent } from '../painel/at-panel-shell.component';
import { NxToastService } from '../shared/feedback';
import { LojaCheckoutComponent } from './loja-checkout.component';

@Component({ selector: 'app-at-panel-shell', template: '<ng-content />' })
class PanelShellStubComponent {
  readonly userName = input('Atleta');
  readonly guest = input(false);
}

const BOLA: StoreProduct = storeProductFromDoc('bola', {
  name: 'Bola Pro Beach',
  slug: 'bola-pro-beach',
  category: 'bolas',
  priceCents: 18990,
  pickup: true,
  delivery: true,
  variants: [{ id: 'unico', values: {}, priceCents: 18990, inStock: true, maxQty: 3 }],
})!;

class FakeShowcase implements StoreShowcaseSource {
  products?: (p: StoreProduct[], fromCache: boolean) => void;
  config?: (c: StoreShowcaseConfig) => void;
  cart?: (items: StoreCartItem[]) => void;
  watchProducts(onChange: (p: StoreProduct[], fromCache: boolean) => void) {
    this.products = onChange;
    return () => undefined;
  }
  watchConfig(onChange: (c: StoreShowcaseConfig) => void) {
    this.config = onChange;
    return () => undefined;
  }
  watchShopper(_uid: string, onChange: (s: StoreShopper) => void) {
    onChange({ favoriteIds: [], pickupArenaId: null, recentSearches: [] });
    return () => undefined;
  }
  watchCart(_uid: string, onChange: (items: StoreCartItem[]) => void) {
    this.cart = onChange;
    return () => undefined;
  }
  setFavorite = () => Promise.resolve();
  saveRecentSearches = () => Promise.resolve();
  setPickupArena = () => Promise.resolve();
  addToCart = () => Promise.resolve(1);
}

function quoteFor(req: CheckoutRequest, over: Record<string, unknown> = {}): CheckoutQuote {
  const casa = req.delivery?.type === 'casa';
  return quoteFromData({
    lines: [{ key: 'bola/unico', productId: 'bola', skuId: 'unico', qty: 1, name: 'Bola Pro Beach', unitCents: 18990, totalCents: 18990, problem: null }],
    units: 1,
    subtotalCents: 18990,
    coupon: null,
    pixDiscountPct: 5,
    pixDiscountCents: 950,
    shippingCents: casa ? 3490 : 0,
    freeShipping: false,
    totalCents: casa ? 21530 : 18040,
    problems: req.delivery ? [] : ['entrega_faltando'],
    ...over,
  })!;
}

class FakeApi implements StoreCheckoutApi {
  quotes: CheckoutRequest[] = [];
  creates: CreateOrderInput[] = [];
  qtyCalls: Array<[string, number]> = [];
  saved: StoreAddress[][] = [];
  quoteOver: Record<string, unknown> = {};
  createImpl: (input: CreateOrderInput) => Promise<CreateOrderResult> = (input) =>
    Promise.resolve({ orderId: 'ord_pedido_1', number: 'NX-0001', totalCents: input.expectedTotalCents, pix: { copyPaste: 'x'.repeat(40), expiresAt: '2026-10-17T20:30:00.000Z' } });
  addresses?: (items: StoreAddress[]) => void;

  quote(input: CheckoutRequest) {
    this.quotes.push(input);
    return Promise.resolve(quoteFor(input, this.quoteOver));
  }
  createOrder(input: CreateOrderInput) {
    this.creates.push(input);
    return this.createImpl(input);
  }
  watchAddresses(_uid: string, onChange: (items: StoreAddress[]) => void) {
    this.addresses = onChange;
    onChange([]);
    return () => undefined;
  }
  saveAddresses(_uid: string, items: StoreAddress[]) {
    this.saved.push(items);
    return Promise.resolve();
  }
  setCartLineQty(_uid: string, key: string, qty: number) {
    this.qtyCalls.push([key, qty]);
    return Promise.resolve();
  }
  watchOrders(_uid: string, _onChange: (o: StoreOrderView[]) => void) {
    return () => undefined;
  }
  watchOrder(_id: string, _onChange: (o: StoreOrderView | null) => void) {
    return () => undefined;
  }
}

function text(el: Element | null | undefined): string {
  return el?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
}

const settle = () => new Promise((r) => setTimeout(r, 320));

describe('LojaCheckoutComponent', () => {
  let showcase: FakeShowcase;
  let api: FakeApi;
  let toasts: string[];

  async function render() {
    showcase = new FakeShowcase();
    api = new FakeApi();
    toasts = [];
    const record = (title: string) => toasts.push(title);
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([
          { path: 'loja/carrinho', component: LojaCheckoutComponent },
          { path: 'loja/pedidos/:id', children: [] },
          { path: 'loja', children: [] },
        ]),
        {
          provide: AuthService,
          useFactory: () => {
            const u = signal({ uid: 'ana', displayName: 'Ana Souza' });
            return { user: u, isAuthenticated: computed(() => u() !== null) };
          },
        },
        { provide: STORE_SHOWCASE_SOURCE, useValue: showcase },
        { provide: STORE_CHECKOUT_API, useValue: api },
        { provide: NxToastService, useValue: { error: record, warning: record, info: record, success: record } },
      ],
    }).overrideComponent(LojaCheckoutComponent, {
      remove: { imports: [AtPanelShellComponent] },
      add: { imports: [PanelShellStubComponent] },
    });
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/loja/carrinho', LojaCheckoutComponent);
    return harness;
  }

  async function load(harness: RouterTestingHarness, cart: StoreCartItem[] = [{ productId: 'bola', skuId: 'unico', qty: 1 }]) {
    showcase.products!([BOLA], false);
    showcase.config!(
      storeConfigFromDoc({
        benefits: { pixDiscountPct: 5, exchangeDays: 30 },
        pickupArenas: [{ arenaId: 'a1', name: 'Arena Errejota', readyHours: 24 }],
        delivery: { freeAboveCents: 39900, modes: [{ id: 'expressa', name: 'Expressa', description: 'Chega amanhã', priceCents: 3490 }] },
      }),
    );
    showcase.cart!(cart);
    harness.detectChanges();
    await settle();
    harness.detectChanges();
    return harness.routeNativeElement as HTMLElement;
  }

  function button(el: HTMLElement, label: string): HTMLButtonElement {
    const found = [...el.querySelectorAll('button')].find((b) => text(b) === label || b.getAttribute('aria-label') === label);
    if (!found) throw new Error(`botão "${label}" não encontrado`);
    return found as HTMLButtonElement;
  }

  function radio(el: HTMLElement, name: string, value: string): HTMLInputElement {
    return el.querySelector(`input[name="${name}"][value="${value}"]`) as HTMLInputElement;
  }

  it('carrinho vazio mostra o convite pra vitrine e não cota', async () => {
    const harness = await render();
    const el = await load(harness, []);
    expect(text(el.querySelector('.ck-empty h2'))).toBe('Seu carrinho está vazio');
    expect(api.quotes).toEqual([]);
  });

  it('cota com retirada na arena e mostra o resumo do servidor', async () => {
    const harness = await render();
    const el = await load(harness);
    expect(api.quotes.at(-1)).toEqual({ channel: 'web', delivery: { type: 'arena', arenaId: 'a1' }, couponCode: null });
    expect(text(el.querySelector('.ck-line-name'))).toBe('Bola Pro Beach');
    expect(text(el.querySelector('.ck-total'))).toBe('R$ 180,40');
    const pixRow = [...el.querySelectorAll('.ck-summary .ck-row')].find((r) => text(r).startsWith('Desconto Pix'));
    expect(text(pixRow?.querySelector('.ck-row-v'))).toBe('− R$ 9,50');
    expect(button(el, 'Pagar com Pix').disabled).toBeFalse();
  });

  it('quantidade e remover gravam a linha pela chave', async () => {
    const harness = await render();
    const el = await load(harness);
    button(el, 'Aumentar').click();
    button(el, 'Remover Bola Pro Beach').click();
    await settle();
    expect(api.qtyCalls).toEqual([
      ['bola/unico', 2],
      ['bola/unico', 0],
    ]);
  });

  it('linha com problema trava o Pagar e diz o porquê', async () => {
    const harness = await render();
    api.quoteOver = {
      lines: [{ key: 'bola/unico', productId: 'bola', skuId: 'unico', qty: 1, name: 'Bola Pro Beach', totalCents: 18990, problem: 'esgotado' }],
      problems: ['linha_com_problema'],
    };
    const el = await load(harness);
    expect(text(el.querySelector('.ck-line-problem'))).toBe('Sem estoque nessa quantidade');
    expect(button(el, 'Pagar com Pix').disabled).toBeTrue();
    expect(text(el.querySelector('.ck-pay-hint'))).toBe('Revise os itens marcados no carrinho.');
  });

  it('receber em casa sem endereço pede o cadastro; salvar escolhe o novo e cota com ele', async () => {
    const harness = await render();
    const el = await load(harness);
    radio(el, 'ck-kind', 'casa').dispatchEvent(new Event('change'));
    harness.detectChanges();
    await settle();
    harness.detectChanges();
    expect(text(el.querySelector('.ck-pay-hint'))).toBe('Cadastre um endereço de entrega.');
    (el.querySelector('.ck-addr-empty') as HTMLButtonElement).click();
    harness.detectChanges();
    expect(el.querySelector('app-loja-endereco-modal')).not.toBeNull();
    expect(el.querySelector('.em-check')).toBeNull(); // o primeiro nasce principal
  });

  it('pagar manda o total mostrado e vai pro Pix do pedido', async () => {
    const harness = await render();
    const el = await load(harness);
    const router = TestBed.inject(Router);
    button(el, 'Pagar com Pix').click();
    await settle();
    expect(api.creates[0]).toEqual({ channel: 'web', delivery: { type: 'arena', arenaId: 'a1' }, couponCode: null, expectedTotalCents: 18040, cpf: null });
    expect(router.url).toBe('/loja/pedidos/ord_pedido_1');
  });

  it('sem CPF no cadastro: pede o CPF e reenvia com ele', async () => {
    const harness = await render();
    const el = await load(harness);
    api.createImpl = () => Promise.reject({ code: 'functions/failed-precondition', message: 'Informe seu CPF para pagar com Pix.', details: { reason: 'cpf_required' } });
    button(el, 'Pagar com Pix').click();
    await settle();
    harness.detectChanges();
    expect(text(el.querySelector('.ck-pay-error'))).toBe('Informe seu CPF para pagar com Pix.');
    const cpf = el.querySelector('.ck-cpf-input') as HTMLInputElement;
    cpf.value = '123.456.789-09';
    cpf.dispatchEvent(new Event('input'));
    api.createImpl = (input) => Promise.resolve({ orderId: 'ord_pedido_2', number: 'NX-2', totalCents: input.expectedTotalCents, pix: { copyPaste: 'y'.repeat(40), expiresAt: '2026-10-17T20:30:00.000Z' } });
    button(el, 'Pagar com Pix').click();
    await settle();
    expect(api.creates.at(-1)!.cpf).toBe('12345678909');
  });

  it('total mudou no servidor: troca pela cotação nova e avisa', async () => {
    const harness = await render();
    const el = await load(harness);
    api.createImpl = () =>
      Promise.reject({
        code: 'functions/aborted',
        message: 'Os valores do carrinho mudaram.',
        details: { quote: { ...quoteFor({ channel: 'web', delivery: { type: 'arena', arenaId: 'a1' }, couponCode: null }), totalCents: 17000 } },
      });
    button(el, 'Pagar com Pix').click();
    await settle();
    harness.detectChanges();
    expect(toasts).toContain('O total mudou');
    expect(text(el.querySelector('.ck-total'))).toBe('R$ 170,00');
  });

  it('cupom com problema mostra a mensagem do servidor e trava até remover', async () => {
    const harness = await render();
    const el = await load(harness);
    api.quoteOver = { coupon: { code: 'VERAO', discountCents: 0, problem: 'minimo', message: 'Pedido mínimo de R$ 200,00 pra esse cupom.' } };
    const input = el.querySelector('.ck-coupon-input') as HTMLInputElement;
    input.value = 'verao';
    input.dispatchEvent(new Event('input'));
    harness.detectChanges();
    button(el, 'Aplicar').click();
    harness.detectChanges();
    await settle();
    harness.detectChanges();
    expect(api.quotes.at(-1)!.couponCode).toBe('VERAO');
    expect(text(el.querySelector('.ck-coupon-msg'))).toBe('Pedido mínimo de R$ 200,00 pra esse cupom.');
    expect(button(el, 'Pagar com Pix').disabled).toBeTrue();
    button(el, 'Remover').click();
    harness.detectChanges();
    await settle();
    expect(api.quotes.at(-1)!.couponCode).toBeNull();
  });
});
