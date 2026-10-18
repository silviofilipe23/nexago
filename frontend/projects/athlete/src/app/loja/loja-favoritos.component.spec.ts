import { Component, computed, input, provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { AuthService } from '../auth/auth.service';
import { STORE_SHOWCASE_SOURCE, type StoreShopper, type StoreShowcaseSource } from '../data/store-showcase-repository';
import {
  storeConfigFromDoc,
  storeProductFromDoc,
  type StoreCartItem,
  type StoreProduct,
  type StoreShowcaseConfig,
} from '../data/store-showcase-model';
import { AtPanelShellComponent } from '../painel/at-panel-shell.component';
import { NxToastService } from '../shared/feedback';
import { LojaFavoritosComponent } from './loja-favoritos.component';

@Component({ selector: 'app-at-panel-shell', template: '<ng-content />' })
class PanelShellStubComponent {
  readonly userName = input('Atleta');
  readonly guest = input(false);
}

function product(id: string, over: Record<string, unknown> = {}): StoreProduct {
  return storeProductFromDoc(id, {
    name: `Produto ${id}`,
    slug: id,
    category: 'acessorios',
    priceCents: 10000,
    variants: [{ id: 'unico', values: {}, priceCents: 10000, inStock: true, maxQty: 5 }],
    ...over,
  })!;
}

const CATALOG = [
  product('oculos', { name: 'Óculos Sunline', compareAtPriceCents: 12000 }),
  product('mochila', { name: 'Mochila Praia', soldOut: true }),
  product('camiseta', {
    name: 'Camiseta Dry',
    category: 'vestuario',
    customizable: true,
    customization: {
      fromCents: 1490,
      leadDays: 5,
      name: { enabled: true, maxChars: 12, placement: 'costas_superior', fonts: ['bloco'], colors: ['#ffffff'] },
    },
  }),
  product('rede', {
    name: 'Rede Oficial',
    variants: [
      { id: '8m', values: { tam: '8m' }, priceCents: 10000, inStock: true },
      { id: '9m', values: { tam: '9m' }, priceCents: 10000, inStock: true },
    ],
  }),
  product('bola', { name: 'Bola Pro', soldLast30: 50 }),
];

class FakeSource implements StoreShowcaseSource {
  products?: (p: StoreProduct[], fromCache: boolean) => void;
  config?: (c: StoreShowcaseConfig) => void;
  shopper?: (s: StoreShopper) => void;
  cart?: (items: StoreCartItem[]) => void;
  favoriteCalls: Array<{ productId: string; on: boolean }> = [];
  favoriteError = false;
  addCalls: Array<{ productId: string; skuId: string; qty: number; maxQty: number }> = [];

  watchProducts(onChange: (p: StoreProduct[], fromCache: boolean) => void) {
    this.products = onChange;
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
    this.favoriteCalls.push({ productId, on });
    return this.favoriteError ? Promise.reject(new Error('negado')) : Promise.resolve();
  }
  saveRecentSearches = () => Promise.resolve();
  setPickupArena = () => Promise.resolve();
  addToCart(_uid: string, item: { productId: string; skuId: string; qty: number; maxQty: number }) {
    this.addCalls.push(item);
    return Promise.resolve(1);
  }
}

function text(el: Element | null | undefined): string {
  return el?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
}

describe('LojaFavoritosComponent', () => {
  let source: FakeSource;
  let toasts: string[];

  async function render(favoriteIds: string[]) {
    source = new FakeSource();
    toasts = [];
    const record = (title: string, detail?: string) => toasts.push(detail ? `${title} · ${detail}` : title);
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([
          { path: 'loja/favoritos', component: LojaFavoritosComponent },
          { path: 'loja/p/:slug', children: [] },
          { path: 'loja/p/:slug/personalizar', children: [] },
          { path: 'loja', children: [] },
        ]),
        {
          provide: AuthService,
          useFactory: () => {
            const u = signal({ uid: 'ana', displayName: 'Ana' });
            return { user: u, isAuthenticated: computed(() => true) };
          },
        },
        { provide: STORE_SHOWCASE_SOURCE, useValue: source },
        { provide: NxToastService, useValue: { error: record, warning: record, info: record, success: record } },
      ],
    }).overrideComponent(LojaFavoritosComponent, {
      remove: { imports: [AtPanelShellComponent] },
      add: { imports: [PanelShellStubComponent] },
    });
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/loja/favoritos', LojaFavoritosComponent);
    source.products!(CATALOG, false);
    source.config!(storeConfigFromDoc({ benefits: { pixDiscountPct: 5, exchangeDays: 30 } }));
    source.shopper!({ favoriteIds, pickupArenaId: null, recentSearches: [] });
    harness.detectChanges();
    return { harness, el: harness.routeNativeElement as HTMLElement };
  }

  function card(el: HTMLElement, name: string): HTMLElement {
    const found = [...el.querySelectorAll('.lf-card')].find((c) => text(c.querySelector('.lf-name')) === name);
    if (!found) throw new Error(`card "${name}" não encontrado`);
    return found as HTMLElement;
  }

  it('vazio: convite para explorar a loja', async () => {
    const { el } = await render([]);
    expect(text(el.querySelector('.lf-empty h2'))).toBe('Nada salvo ainda');
    expect(el.querySelector('.lf-empty a')?.getAttribute('href')).toBe('/loja');
  });

  it('último favoritado primeiro, com selo e ação de cada tipo', async () => {
    const { el } = await render(['oculos', 'mochila', 'camiseta', 'rede', 'sumiu']);
    expect([...el.querySelectorAll('.lf-name')].map(text)).toEqual([
      'Rede Oficial',
      'Camiseta Dry',
      'Mochila Praia',
      'Óculos Sunline',
    ]);
    expect(text(card(el, 'Óculos Sunline').querySelector('.lf-note'))).toBe('Baixou R$ 20');
    expect(text(card(el, 'Óculos Sunline').querySelector('.lf-strike'))).toBe('R$ 120,00');
    expect(text(card(el, 'Mochila Praia').querySelector('.lf-note'))).toBe('Esgotado');
    expect(text(card(el, 'Camiseta Dry').querySelector('.lf-tag'))).toBe('Personalizável');
    expect(text(card(el, 'Óculos Sunline').querySelector('.lf-action'))).toBe('Adicionar');
    expect(text(card(el, 'Mochila Praia').querySelector('.lf-action'))).toBe('Avise-me quando chegar');
    expect(text(card(el, 'Camiseta Dry').querySelector('.lf-action'))).toBe('Personalizar');
    expect(text(card(el, 'Rede Oficial').querySelector('.lf-action'))).toBe('Ver opções');
  });

  it('filtros com contagem; "Com desconto" mostra só o que baixou', async () => {
    const { harness, el } = await render(['oculos', 'mochila', 'camiseta', 'rede']);
    const chips = [...el.querySelectorAll('.lf-chip')].map(text);
    expect(chips).toEqual(['Todos4', 'Com desconto1', 'Disponíveis3']);
    (el.querySelectorAll('.lf-chip')[1] as HTMLButtonElement).click();
    harness.detectChanges();
    expect([...el.querySelectorAll('.lf-name')].map(text)).toEqual(['Óculos Sunline']);
  });

  it('adicionar direto põe 1 no carrinho e abre o mini-carrinho', async () => {
    const { harness, el } = await render(['oculos']);
    (card(el, 'Óculos Sunline').querySelector('.lf-action') as HTMLButtonElement).click();
    await harness.fixture.whenStable();
    harness.detectChanges();
    expect(source.addCalls).toEqual([{ productId: 'oculos', skuId: 'unico', qty: 1, maxQty: 5 }]);
    expect(el.querySelector('app-loja-mini-cart')).not.toBeNull();
  });

  it('personalizar e ver opções navegam; avise-me só avisa', async () => {
    const { harness, el } = await render(['mochila', 'camiseta', 'rede']);
    (card(el, 'Mochila Praia').querySelector('.lf-action') as HTMLButtonElement).click();
    expect(toasts[0]).toContain('Aviso de reposição chega em breve');
    (card(el, 'Camiseta Dry').querySelector('.lf-action') as HTMLButtonElement).click();
    await harness.fixture.whenStable();
    expect(TestBed.inject(Router).url).toBe('/loja/p/camiseta/personalizar');
  });

  it('adicionar disponíveis: só os sem escolha, com o resumo', async () => {
    const { harness, el } = await render(['oculos', 'bola', 'rede', 'mochila']);
    (el.querySelector('.lf-bulk') as HTMLButtonElement).click();
    await harness.fixture.whenStable();
    expect(source.addCalls.map((c) => c.productId).sort()).toEqual(['bola', 'oculos']);
    expect(toasts).toContain('2 itens no carrinho · 1 pede cor ou tamanho na página do produto');
  });

  it('coração tira na hora; se o servidor recusar, o card volta', async () => {
    const { harness, el } = await render(['oculos', 'bola']);
    source.favoriteError = true;
    (card(el, 'Bola Pro').querySelector('.lf-heart') as HTMLButtonElement).click();
    harness.detectChanges();
    expect([...el.querySelectorAll('.lf-name')].map(text)).toEqual(['Óculos Sunline']);
    expect(source.favoriteCalls).toEqual([{ productId: 'bola', on: false }]);
    await harness.fixture.whenStable();
    harness.detectChanges();
    expect([...el.querySelectorAll('.lf-name')].map(text)).toEqual(['Bola Pro', 'Óculos Sunline']);
    expect(toasts[0]).toContain('Não deu pra salvar o favorito');
  });

  it('"combina com" traz produtos fora dos favoritos', async () => {
    const { el } = await render(['oculos']);
    const names = [...el.querySelectorAll('.lf-mini-name')].map(text);
    expect(names).toContain('Bola Pro');
    expect(names).not.toContain('Óculos Sunline');
    expect(names).not.toContain('Mochila Praia');
  });
});
