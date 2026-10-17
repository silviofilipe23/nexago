import { Component, computed, input, provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { AuthService } from '../auth/auth.service';
import { STORE_CHECKOUT_API, type StoreCheckoutApi } from '../data/store-checkout-api';
import { orderViewFromDoc, type StoreOrderView } from '../data/store-checkout-model';
import { STORE_SHOWCASE_SOURCE, type StoreShowcaseSource } from '../data/store-showcase-repository';
import { AtPanelShellComponent } from '../painel/at-panel-shell.component';
import { NxToastService } from '../shared/feedback';
import { LojaPedidoComponent } from './loja-pedido.component';
import { LojaPedidosComponent } from './loja-pedidos.component';

@Component({ selector: 'app-at-panel-shell', template: '<ng-content />' })
class PanelShellStubComponent {
  readonly userName = input('Atleta');
  readonly guest = input(false);
}

const SOON = new Date(Date.now() + 10 * 60_000).toISOString();

function order(id: string, over: Record<string, unknown> = {}): StoreOrderView {
  return orderViewFromDoc(id, {
    uid: 'ana',
    number: `NX-${id}`,
    status: 'sep',
    items: [{ productId: 'bola', skuId: 'unico', name: 'Bola Pro Beach', variantLabel: '', qty: 1, totalCents: 18990 }],
    units: 1,
    subtotalCents: 18990,
    totalCents: 18990,
    delivery: { type: 'arena', placeName: 'Arena Errejota', counter: 'recepção', address: 'Rua 1, Goiânia' },
    createdAt: new Date().toISOString(),
    ...over,
  })!;
}

class FakeApi implements Partial<StoreCheckoutApi> {
  list?: (o: StoreOrderView[]) => void;
  one?: (o: StoreOrderView | null) => void;
  watchOrders(_uid: string, onChange: (o: StoreOrderView[]) => void) {
    this.list = onChange;
    return () => undefined;
  }
  watchOrder(_id: string, onChange: (o: StoreOrderView | null) => void) {
    this.one = onChange;
    return () => undefined;
  }
}

const noopShowcase: StoreShowcaseSource = {
  watchProducts: () => () => undefined,
  watchConfig: () => () => undefined,
  watchShopper: () => () => undefined,
  watchCart: () => () => undefined,
  setFavorite: () => Promise.resolve(),
  saveRecentSearches: () => Promise.resolve(),
  setPickupArena: () => Promise.resolve(),
  addToCart: () => Promise.resolve(1),
};

function text(el: Element | null | undefined): string {
  return el?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
}

describe('Loja · pedidos', () => {
  let api: FakeApi;

  async function render(url: string, component: typeof LojaPedidosComponent | typeof LojaPedidoComponent, state?: unknown) {
    api = new FakeApi();
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([
          { path: 'loja/pedidos', component: LojaPedidosComponent },
          { path: 'loja/pedidos/:id', component: LojaPedidoComponent },
          { path: 'loja', children: [] },
        ]),
        {
          provide: AuthService,
          useFactory: () => {
            const u = signal({ uid: 'ana', displayName: 'Ana' });
            return { user: u, isAuthenticated: computed(() => true) };
          },
        },
        { provide: STORE_SHOWCASE_SOURCE, useValue: noopShowcase },
        { provide: STORE_CHECKOUT_API, useValue: api },
        { provide: NxToastService, useValue: { error: () => 0, warning: () => 0, info: () => 0, success: () => 0 } },
      ],
    });
    for (const c of [LojaPedidosComponent, LojaPedidoComponent]) {
      TestBed.overrideComponent(c, { remove: { imports: [AtPanelShellComponent] }, add: { imports: [PanelShellStubComponent] } });
    }
    const harness = await RouterTestingHarness.create();
    if (state) {
      await TestBed.inject(Router).navigateByUrl(url, { state: state as Record<string, unknown> });
      harness.detectChanges();
    } else {
      await harness.navigateByUrl(url, component as typeof LojaPedidosComponent);
    }
    return harness;
  }

  it('lista em andamento e anteriores, com o código da retirada na lateral', async () => {
    const harness = await render('/loja/pedidos', LojaPedidosComponent);
    api.list!([
      order('1', { status: 'ret', delivery: { type: 'arena', placeName: 'Arena Errejota', pickupCode: '4821', address: 'Rua 1' } }),
      order('2', { status: 'ent', delivery: { type: 'casa', address: 'Rua T-37, 1240' } }),
      order('3', { status: 'can', cancelReason: 'Pix expirou sem pagamento' }),
    ]);
    harness.detectChanges();
    const el = harness.routeNativeElement as HTMLElement;
    expect([...el.querySelectorAll('.ps-label')].map(text)).toEqual(['Em andamento', 'Anteriores']);
    expect(el.querySelectorAll('.ps-card').length).toBe(3);
    expect(text(el.querySelector('.ps-ready .ps-code strong'))).toBe('4821');
    expect(text(el.querySelector('.ps-filter'))).toBe('Todos3');
  });

  it('filtro e busca', async () => {
    const harness = await render('/loja/pedidos', LojaPedidosComponent);
    api.list!([order('1'), order('2', { status: 'can' }), order('3', { status: 'rtd', items: [{ name: 'Viseira Areia', qty: 1 }] })]);
    harness.detectChanges();
    const el = harness.routeNativeElement as HTMLElement;
    ([...el.querySelectorAll('.ps-filter')].find((b) => text(b).startsWith('Cancelados')) as HTMLButtonElement).click();
    harness.detectChanges();
    expect([...el.querySelectorAll('.ps-number')].map(text)).toEqual(['#NX-2']);
    ([...el.querySelectorAll('.ps-filter')][0] as HTMLButtonElement).click();
    const search = el.querySelector('.ps-search input') as HTMLInputElement;
    search.value = 'viseira';
    search.dispatchEvent(new Event('input'));
    harness.detectChanges();
    expect([...el.querySelectorAll('.ps-number')].map(text)).toEqual(['#NX-3']);
  });

  it('sem pedidos: convite pra vitrine', async () => {
    const harness = await render('/loja/pedidos', LojaPedidosComponent);
    api.list!([]);
    harness.detectChanges();
    expect(text((harness.routeNativeElement as HTMLElement).querySelector('.lp-state h2'))).toBe('Você ainda não fez pedidos');
  });

  it('logo depois do checkout mostra o Pix que veio na navegação, antes do espelho chegar', async () => {
    const state = { order: { orderId: 'ord_pedido_1', number: 'NX-0001', totalCents: 18040, pix: { copyPaste: 'x'.repeat(40), expiresAt: SOON } } };
    const harness = await render('/loja/pedidos/ord_pedido_1', LojaPedidoComponent, state);
    api.one!(null);
    harness.detectChanges();
    const el = harness.routeNativeElement as HTMLElement;
    expect(text(el.querySelector('.pd-pix .pd-h'))).toBe('Pague com Pix');
    expect(text(el.querySelector('.pd-amount strong'))).toBe('R$ 180,40');
    expect((el.querySelector('.pd-copy-input') as HTMLInputElement).value).toBe('x'.repeat(40));
    expect(text(el.querySelector('.pd-timer strong'))).toMatch(/^\d{2}:\d{2}$/);
  });

  it('o pagamento cai com a tela aberta: troca o Pix pelo "Pagamento aprovado"', async () => {
    const harness = await render('/loja/pedidos/ord_pedido_1', LojaPedidoComponent);
    api.one!(order('ord_pedido_1', { status: 'pag', pix: { copyPaste: 'x'.repeat(40), expiresAt: SOON } }));
    harness.detectChanges();
    const el = harness.routeNativeElement as HTMLElement;
    expect(el.querySelector('.pd-pix')).not.toBeNull();
    api.one!(order('ord_pedido_1', { status: 'sep' }));
    harness.detectChanges();
    expect(el.querySelector('.pd-pix')).toBeNull();
    expect(text(el.querySelector('.pd-paid .pd-h'))).toBe('Pagamento aprovado!');
    expect(text(el.querySelector('app-loja-order-pill'))).toBe('Em separação');
  });

  it('na arena mostra o código e o prazo', async () => {
    const harness = await render('/loja/pedidos/ord_pedido_1', LojaPedidoComponent);
    api.one!(
      order('ord_pedido_1', {
        status: 'ret',
        delivery: { type: 'arena', placeName: 'Arena Errejota', pickupCode: '0427', pickupDeadline: '2026-10-19T01:00:00.000Z', address: 'Rua 1' },
      }),
    );
    harness.detectChanges();
    const el = harness.routeNativeElement as HTMLElement;
    expect(text(el.querySelector('.pd-code-value'))).toBe('0427');
    expect(text(el.querySelector('.pd-code small'))).toBe('Retire até dom, 18 out · 22h');
  });

  it('pedido que não é do atleta (sem espelho e sem Pix na mão): "não achamos"', async () => {
    const harness = await render('/loja/pedidos/ord_outro_1', LojaPedidoComponent);
    api.one!(null);
    harness.detectChanges();
    expect(text((harness.routeNativeElement as HTMLElement).querySelector('.lp-state h2'))).toBe('Não achamos esse pedido');
  });
});
