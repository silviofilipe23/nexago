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
import { LojaProdutoComponent } from './loja-produto.component';

@Component({ selector: 'app-at-panel-shell', template: '<ng-content />' })
class PanelShellStubComponent {
  readonly userName = input('Atleta');
  readonly guest = input(false);
}

const COR = {
  id: 'cor',
  label: 'Cor',
  values: [
    { id: 'branco', label: 'Branco areia', hex: '#f1ece2' },
    { id: 'preto', label: 'Preto', hex: '#111111' },
  ],
};
const TAM = { id: 'tam', label: 'Tamanho', values: ['p', 'm', 'g'].map((id) => ({ id, label: id.toUpperCase() })) };

function sku(cor: string, tam: string, maxQty: number, over: Record<string, unknown> = {}) {
  return { id: `${cor}_${tam}`, values: { cor, tam }, priceCents: 12990, inStock: maxQty > 0, maxQty, ...over };
}

function camiseta(over: Record<string, unknown> = {}): StoreProduct {
  return storeProductFromDoc('cam', {
    name: 'Camiseta Dry UV50 Areia',
    slug: 'camiseta-dry-uv50-areia',
    category: 'vestuario',
    collection: 'verao-2026',
    badge: 'nova',
    priceCents: 12990,
    minPriceCents: 12990,
    maxPriceCents: 12990,
    pickup: true,
    delivery: true,
    axes: [COR, TAM],
    variants: [sku('branco', 'p', 5), sku('branco', 'm', 2, { lowStock: true }), sku('branco', 'g', 0), sku('preto', 'm', 0)],
    details: [{ label: 'Tecido', value: 'Poliamida dry com elastano' }],
    soldLast30: 40,
    ...over,
  })!;
}

function other(id: string, sold: number, category = 'acessorios'): StoreProduct {
  return storeProductFromDoc(id, {
    name: `Produto ${id}`,
    slug: id,
    category,
    priceCents: 6990,
    soldLast30: sold,
    variants: [{ id: 'unico', values: {}, priceCents: 6990, inStock: true }],
  })!;
}

class FakeSource implements StoreShowcaseSource {
  products?: (p: StoreProduct[], fromCache: boolean) => void;
  config?: (c: StoreShowcaseConfig) => void;
  shopper?: (s: StoreShopper) => void;
  cart?: (items: StoreCartItem[]) => void;
  addCalls: Array<{ productId: string; skuId: string; qty: number; maxQty: number }> = [];
  addResult: number | null = 1;

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
  setFavorite(): Promise<void> {
    return Promise.resolve();
  }
  saveRecentSearches(): Promise<void> {
    return Promise.resolve();
  }
  setPickupArena(): Promise<void> {
    return Promise.resolve();
  }
  addToCart(_uid: string, item: { productId: string; skuId: string; qty: number; maxQty: number }) {
    this.addCalls.push(item);
    return Promise.resolve(this.addResult);
  }
}

function text(el: Element | null | undefined): string {
  return el?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
}

describe('LojaProdutoComponent', () => {
  let source: FakeSource;
  let toasts: string[];

  async function render(url: string, user: { uid: string; displayName: string } | null = { uid: 'ana', displayName: 'Ana' }) {
    source = new FakeSource();
    toasts = [];
    const record = (title: string) => toasts.push(title);
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([
          { path: 'loja/p/:slug', component: LojaProdutoComponent },
          { path: 'loja/p/:slug/personalizar', children: [] },
          { path: 'loja/produto/:id', component: LojaProdutoComponent },
          { path: 'loja', children: [] },
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
        { provide: NxToastService, useValue: { error: record, warning: record, info: record, success: record } },
      ],
    }).overrideComponent(LojaProdutoComponent, {
      remove: { imports: [AtPanelShellComponent] },
      add: { imports: [PanelShellStubComponent] },
    });
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(url, LojaProdutoComponent);
    return harness;
  }

  function load(harness: RouterTestingHarness, products: StoreProduct[], config: Record<string, unknown> = {}) {
    source.products!(products, false);
    source.config!(
      storeConfigFromDoc({
        benefits: { pixDiscountPct: 5, exchangeDays: 30 },
        pickupArenas: [{ arenaId: 'a1', name: 'Arena Errejota', readyHours: 24 }],
        delivery: { freeAboveCents: 39900, modes: [{ id: 'expressa', name: 'Expressa', description: 'Loggi · 24 h', priceCents: 3490 }] },
        ...config,
      }),
    );
    harness.detectChanges();
    return harness.routeNativeElement as HTMLElement;
  }

  function button(el: HTMLElement, label: string): HTMLButtonElement {
    const found = [...el.querySelectorAll('button')].find((b) => text(b) === label || b.getAttribute('aria-label') === label);
    if (!found) throw new Error(`botão "${label}" não encontrado`);
    return found as HTMLButtonElement;
  }

  it('mostra skeleton até catálogo e config chegarem', async () => {
    const harness = await render('/loja/p/camiseta-dry-uv50-areia');
    expect(harness.routeNativeElement!.querySelector('.lp-skeleton')).not.toBeNull();
  });

  it('acha pelo slug e mostra selo, coleção, preço, Pix e a cor pré-escolhida', async () => {
    const harness = await render('/loja/p/camiseta-dry-uv50-areia');
    const el = load(harness, [camiseta()]);
    expect(text(el.querySelector('.lp-name'))).toBe('Camiseta Dry UV50 Areia');
    expect(text(el.querySelector('.lp-badge'))).toBe('Nova');
    expect(text(el.querySelector('.lp-collection'))).toBe('Coleção Verão 2026');
    expect(text(el.querySelector('.lp-price'))).toBe('R$ 129,90');
    expect(text(el.querySelector('.lp-pix'))).toBe('R$ 123,41 no Pix');
    expect(text(el.querySelector('.lp-eyebrow'))).toBe('Cor · Branco areia');
    expect(el.querySelector('.lp-size--on')).toBeNull();
    expect(text(el.querySelector('.lp-detail dd'))).toBe('Poliamida dry com elastano');
  });

  it('o link antigo por id abre a mesma página', async () => {
    const harness = await render('/loja/produto/cam');
    const el = load(harness, [camiseta()]);
    expect(text(el.querySelector('.lp-name'))).toBe('Camiseta Dry UV50 Areia');
  });

  it('adicionar sem tamanho pede o tamanho e não grava', async () => {
    const harness = await render('/loja/p/camiseta-dry-uv50-areia');
    const el = load(harness, [camiseta()]);
    button(el, 'Adicionar ao carrinho').click();
    harness.detectChanges();
    expect(text(el.querySelector('.lp-attention'))).toBe('Escolha um tamanho');
    expect(source.addCalls).toEqual([]);
  });

  it('com tamanho, grava SKU e quantidade, respeitando o saldo do SKU', async () => {
    const harness = await render('/loja/p/camiseta-dry-uv50-areia');
    const el = load(harness, [camiseta()]);
    button(el, 'M').click();
    harness.detectChanges();
    expect(text(el.querySelector('.lp-low'))).toBe('Só 2 no tamanho M');
    button(el, 'Mais uma').click();
    harness.detectChanges();
    expect(button(el, 'Mais uma').disabled).toBeTrue();
    button(el, 'Adicionar ao carrinho').click();
    await harness.fixture.whenStable();
    harness.detectChanges();
    expect(source.addCalls).toEqual([{ productId: 'cam', skuId: 'branco_m', qty: 2, maxQty: 2 }]);
    expect(text(el.querySelector('.lp-add'))).toBe('Adicionado');
    expect(el.querySelector('.lp-minicart')).not.toBeNull();
  });

  it('tamanho esgotado não é escolhido: vira o aviso do Avise-me', async () => {
    const harness = await render('/loja/p/camiseta-dry-uv50-areia');
    const el = load(harness, [camiseta()]);
    const g = button(el, 'G, esgotado — avise-me');
    expect(g.classList).toContain('lp-size--out');
    g.click();
    harness.detectChanges();
    expect(el.querySelector('.lp-size--on')).toBeNull();
    expect(toasts).toEqual(['Aviso de reposição chega em breve']);
  });

  it('cor sem saldo é escolhível e deixa todos os tamanhos indisponíveis', async () => {
    const harness = await render('/loja/p/camiseta-dry-uv50-areia');
    const el = load(harness, [camiseta()]);
    button(el, 'Preto, esgotada').click();
    harness.detectChanges();
    expect(text(el.querySelector('.lp-eyebrow'))).toBe('Cor · Preto');
    expect(el.querySelectorAll('.lp-size--out').length).toBe(3);
  });

  it('visitante vai pro login com a adição na volta', async () => {
    const harness = await render('/loja/p/camiseta-dry-uv50-areia', null);
    const el = load(harness, [camiseta()]);
    button(el, 'P').click();
    harness.detectChanges();
    button(el, 'Adicionar ao carrinho').click();
    await harness.fixture.whenStable();
    const router = TestBed.inject(Router);
    expect(router.url).toContain('/entrar');
    expect(decodeURIComponent(router.url)).toContain('/loja/p/camiseta-dry-uv50-areia?add=branco_p&qtd=1');
    expect(source.addCalls).toEqual([]);
  });

  it('de volta do login, conclui a adição pendente e limpa a URL', async () => {
    const harness = await render('/loja/p/camiseta-dry-uv50-areia?add=branco_p&qtd=3');
    load(harness, [camiseta()]);
    await harness.fixture.whenStable();
    expect(source.addCalls).toEqual([{ productId: 'cam', skuId: 'branco_p', qty: 3, maxQty: 5 }]);
    expect(TestBed.inject(Router).url).toBe('/loja/p/camiseta-dry-uv50-areia');
  });

  it('como receber: retirada grátis na arena e a entrega com preço', async () => {
    const harness = await render('/loja/p/camiseta-dry-uv50-areia');
    const el = load(harness, [camiseta()]);
    const options = [...el.querySelectorAll('.lp-receive-opt')].map((o) => text(o.querySelector('strong')));
    expect(options).toEqual(['Retirar na Arena Errejota', 'Receber em casa · Expressa']);
    expect(text(el.querySelectorAll('.lp-receive-price')[0])).toBe('Grátis');
    expect(text(el.querySelectorAll('.lp-receive-price')[1])).toBe('R$ 34,90');
    expect(text(el.querySelector('.lp-hint'))).toBe('Frete grátis a partir de R$ 399,00');
  });

  it('esgotado inteiro: o CTA vira "Avise-me quando chegar"', async () => {
    const harness = await render('/loja/p/camiseta-dry-uv50-areia');
    const el = load(harness, [camiseta({ soldOut: true, variants: [sku('branco', 'm', 0)] })]);
    expect(el.querySelector('.lp-add')).toBeNull();
    expect(text(el.querySelector('.lp-notify'))).toBe('Avise-me quando chegar');
  });

  it('combina com: mais vendidos, sem o próprio', async () => {
    const harness = await render('/loja/p/camiseta-dry-uv50-areia');
    const el = load(harness, [camiseta(), other('viseira', 30), other('oculos', 20), other('garrafa', 10), other('bola', 5)]);
    expect([...el.querySelectorAll('.lp-mini-name')].map((n) => text(n))).toEqual([
      'Produto viseira',
      'Produto oculos',
      'Produto garrafa',
    ]);
  });

  it('Personalizar abre a 02b com a cor e o tamanho escolhidos', async () => {
    const custom = {
      fromCents: 1490,
      leadDays: 5,
      name: { enabled: true, maxChars: 12, placement: 'costas_superior', fonts: ['bloco'], colors: ['#ffffff'] },
    };
    const harness = await render('/loja/p/camiseta-dry-uv50-areia');
    const el = load(harness, [camiseta({ customizable: true, customization: custom })]);
    button(el, 'P').click();
    harness.detectChanges();
    button(el, 'Personalizar').click();
    await harness.fixture.whenStable();
    expect(TestBed.inject(Router).url).toBe('/loja/p/camiseta-dry-uv50-areia/personalizar?cor=branco&tam=p');
  });

  it('Personalizar sem opção no espelho (doc antigo) só avisa', async () => {
    const harness = await render('/loja/p/camiseta-dry-uv50-areia');
    const el = load(harness, [camiseta({ customizable: true, customization: { fromCents: 1490, leadDays: 5 } })]);
    button(el, 'Personalizar').click();
    expect(toasts).toContain('A personalização chega em breve');
  });

  it('produto fora do catálogo: indisponível + mais vendidos', async () => {
    const harness = await render('/loja/p/sumiu');
    const el = load(harness, [other('viseira', 30), other('oculos', 20)]);
    expect(text(el.querySelector('.lp-state h2'))).toBe('Esse produto não está mais disponível');
    expect(el.querySelectorAll('app-loja-product-card').length).toBe(2);
  });
});
