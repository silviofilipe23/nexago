import { Component, computed, input, provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { AuthService } from '../auth/auth.service';
import { EMPTY_SHOPPER, STORE_SHOWCASE_SOURCE, type StoreShopper, type StoreShowcaseSource } from '../data/store-showcase-repository';
import {
  storeConfigFromDoc,
  storeProductFromDoc,
  type StoreCartItem,
  type StoreProduct,
  type StoreShowcaseConfig,
} from '../data/store-showcase-model';
import { AtPanelShellComponent } from '../painel/at-panel-shell.component';
import { NxToastService } from '../shared/feedback';
import { LojaVitrineComponent } from './loja-vitrine.component';

/** A casca do portal monta o menu e ouve convites — abriria WebChannel do Firestore no Karma. */
@Component({ selector: 'app-at-panel-shell', template: '<ng-content />' })
class PanelShellStubComponent {
  readonly userName = input('Atleta');
  readonly guest = input(false);
}

function product(id: string, over: Record<string, unknown> = {}): StoreProduct {
  return storeProductFromDoc(id, {
    name: `Produto ${id}`,
    category: 'acessorios',
    priceCents: 6990,
    minPriceCents: 6990,
    maxPriceCents: 6990,
    soldLast30: 1,
    variants: [{ id: 'unico', values: {}, priceCents: 6990, inStock: true }],
    ...over,
  })!;
}

/** Fonte controlada pelo teste: entrega o que e quando o teste mandar. */
class FakeSource implements StoreShowcaseSource {
  products?: (p: StoreProduct[], fromCache: boolean) => void;
  productsError?: (e: unknown) => void;
  config?: (c: StoreShowcaseConfig) => void;
  shopper?: (s: StoreShopper) => void;
  cart?: (items: StoreCartItem[]) => void;
  favoriteResult: Promise<void> = Promise.resolve();
  favoriteCalls: Array<[string, boolean]> = [];

  watchProducts(onChange: (p: StoreProduct[], fromCache: boolean) => void, onError: (e: unknown) => void) {
    this.products = onChange;
    this.productsError = onError;
    return () => undefined;
  }
  watchConfig(onChange: (c: StoreShowcaseConfig) => void) {
    this.config = onChange;
    return () => undefined;
  }
  watchShopper(_uid: string, onChange: (s: StoreShopper) => void) {
    this.shopper = onChange;
    return () => undefined;
  }
  watchCart(_uid: string, onChange: (items: StoreCartItem[]) => void) {
    this.cart = onChange;
    return () => undefined;
  }
  setFavorite(_uid: string, productId: string, on: boolean): Promise<void> {
    this.favoriteCalls.push([productId, on]);
    return this.favoriteResult;
  }
  saveRecentSearches(): Promise<void> {
    return Promise.resolve();
  }
}

function text(el: Element | null | undefined): string {
  return el?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
}

describe('LojaVitrineComponent', () => {
  let source: FakeSource;
  let toastErrors: string[];

  async function render(url = '/loja', user: { uid: string; displayName: string } | null = { uid: 'ana', displayName: 'Ana' }) {
    source = new FakeSource();
    toastErrors = [];
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([
          { path: 'loja', component: LojaVitrineComponent },
          { path: 'entrar', children: [] },
        ]),
        {
          provide: AuthService,
          useFactory: () => {
            const u = signal(user);
            return { user: u, isAuthenticated: computed(() => u() !== null) };
          },
        },
        { provide: STORE_SHOWCASE_SOURCE, useValue: source },
        { provide: NxToastService, useValue: { error: (title: string) => toastErrors.push(title) } },
      ],
    }).overrideComponent(LojaVitrineComponent, {
      remove: { imports: [AtPanelShellComponent] },
      add: { imports: [PanelShellStubComponent] },
    });
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(url, LojaVitrineComponent);
    return harness;
  }

  function load(harness: RouterTestingHarness, products: StoreProduct[], config: Record<string, unknown> = {}) {
    source.products!(products, false);
    source.config!(storeConfigFromDoc({ benefits: { pixDiscountPct: 5, pickupReadyHours: 48, exchangeDays: 30 }, ...config }));
    harness.detectChanges();
    return harness.routeNativeElement as HTMLElement;
  }

  it('mostra skeleton até catálogo e config chegarem', async () => {
    const harness = await render();
    expect(harness.routeNativeElement!.querySelector('.lj-skeleton')).not.toBeNull();
    source.products!([product('a')], false);
    harness.detectChanges();
    expect(harness.routeNativeElement!.querySelector('.lj-skeleton')).not.toBeNull();
  });

  it('grade, chips só com categoria que tem produto e preço no Pix', async () => {
    const harness = await render();
    const host = load(harness, [product('bola', { category: 'bolas', priceCents: 28990, minPriceCents: 28990, maxPriceCents: 28990 }), product('viseira')]);
    expect(host.querySelectorAll('app-loja-product-card').length).toBe(2);
    expect(Array.from(host.querySelectorAll('.lj-chip')).map(text)).toEqual(['Tudo', 'Bolas', 'Acessórios']);
    expect(text(host.querySelector('.lj-card-pix'))).toBe('R$ 275,41 no Pix');
  });

  it('?categoria filtra a grade', async () => {
    const harness = await render('/loja?categoria=bolas');
    const host = load(harness, [product('bola', { category: 'bolas' }), product('viseira')]);
    expect(host.querySelectorAll('app-loja-product-card').length).toBe(1);
    expect(host.querySelector('.lj-chip--on')?.textContent?.trim()).toBe('Bolas');
  });

  it('busca sem resultado oferece os mais vendidos', async () => {
    const harness = await render('/loja?q=raquete');
    const host = load(harness, [product('a'), product('b')]);
    expect(text(host.querySelector('.lj-state h2'))).toBe('Não achamos "raquete"');
    expect(host.querySelectorAll('app-loja-product-card').length).toBe(2);
  });

  it('filtro sem resultado oferece limpar', async () => {
    const harness = await render('/loja?colecao=nenhuma');
    const host = load(harness, [product('a')]);
    expect(text(host.querySelector('.lj-state h2'))).toBe('Nada por aqui com esses filtros');
    expect(text(host.querySelector('.lj-state-btn'))).toBe('Limpar filtros');
  });

  it('erro no catálogo mostra o motivo e tenta de novo', async () => {
    const harness = await render();
    source.productsError!(new Error('permission-denied'));
    harness.detectChanges();
    const host = harness.routeNativeElement as HTMLElement;
    expect(text(host.querySelector('.lj-state h2'))).toBe('Não deu pra carregar a loja');
    expect(text(host.querySelector('.lj-state-detail'))).toBe('permission-denied');
  });

  it('contador do carrinho soma unidades', async () => {
    const harness = await render();
    const host = load(harness, [product('a')]);
    source.cart!([
      { productId: 'a', skuId: 'unico', qty: 2 },
      { productId: 'b', skuId: 'm', qty: 1 },
    ]);
    harness.detectChanges();
    expect(text(host.querySelector('.lj-cart-count'))).toBe('3');
  });

  it('favoritar alterna na hora e volta se o servidor recusar', async () => {
    const harness = await render();
    const host = load(harness, [product('a')]);
    source.shopper!(EMPTY_SHOPPER);
    let reject!: (e: unknown) => void;
    source.favoriteResult = new Promise((_, r) => (reject = r));

    (host.querySelector('.lj-fav') as HTMLButtonElement).click();
    harness.detectChanges();
    expect(host.querySelector('.lj-fav')?.classList).toContain('lj-fav--on');
    expect(source.favoriteCalls).toEqual([['a', true]]);

    reject(new Error('offline'));
    await source.favoriteResult.catch(() => undefined);
    await Promise.resolve();
    harness.detectChanges();
    expect(host.querySelector('.lj-fav')?.classList).not.toContain('lj-fav--on');
    expect(toastErrors).toEqual(['Não deu pra salvar o favorito']);
  });

  it('visitante que favorita vai para o login e volta para a vitrine', async () => {
    const harness = await render('/loja?categoria=bolas', null);
    const host = load(harness, [product('a', { category: 'bolas' })]);
    (host.querySelector('.lj-fav') as HTMLButtonElement).click();
    await harness.fixture.whenStable();
    expect(TestBed.inject(Router).url).toBe('/entrar?redirect=%2Floja%3Fcategoria%3Dbolas');
    expect(source.favoriteCalls).toEqual([]);
  });
});
