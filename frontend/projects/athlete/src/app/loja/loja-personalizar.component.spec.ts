import { Component, computed, input, provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { AuthService } from '../auth/auth.service';
import {
  STORE_CUSTOMIZE_API,
  type AddCustomItemInput,
  type AddCustomItemResult,
  type CustomUpload,
  type StoreCustomizeApi,
} from '../data/store-customize-api';
import type { NameProblem } from '../data/store-customize-model';
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
import { LojaPersonalizarComponent } from './loja-personalizar.component';

@Component({ selector: 'app-at-panel-shell', template: '<ng-content />' })
class PanelShellStubComponent {
  readonly userName = input('Atleta');
  readonly guest = input(false);
}

const COR = {
  id: 'cor',
  label: 'Cor',
  values: [
    { id: 'areia', label: 'Areia', hex: '#ede6da' },
    { id: 'preto', label: 'Preto', hex: '#17171a' },
  ],
};
const TAM = { id: 'tam', label: 'Tamanho', values: ['p', 'm', 'g'].map((id) => ({ id, label: id.toUpperCase(), hex: null })) };

function sku(cor: string, tam: string, maxQty: number) {
  return { id: `${cor}_${tam}`, values: { cor, tam }, priceCents: 12990, inStock: maxQty > 0, maxQty };
}

const CUSTOMIZATION = {
  fromCents: 1490,
  leadDays: 5,
  defectOnlyReturns: true,
  version: 1760000000000,
  name: { enabled: true, maxChars: 12, placement: 'costas_superior', fonts: ['bloco', 'classica', 'mono'], colors: ['#f4f4f5', '#17171a', '#ff6a1a'] },
  image: {
    enabled: true,
    formats: ['png', 'jpg', 'svg'],
    maxSizeMb: 10,
    minWidthPx: 1000,
    minHeightPx: 1000,
    areas: [
      { id: 'peito_esquerdo', name: 'Peito esquerdo', widthCm: 9, heightCm: 9 },
      { id: 'centro_frente', name: 'Centro da frente', widthCm: 25, heightCm: 30 },
    ],
  },
  price: { nameOnlyCents: 1490, imageOnlyCents: 1990, bothCents: 2490 },
};

function camiseta(customization: Record<string, unknown> | null = CUSTOMIZATION): StoreProduct {
  return storeProductFromDoc('cam', {
    name: 'Camiseta Personalizada Dry UV50',
    slug: 'camiseta-personalizada',
    category: 'vestuario',
    priceCents: 12990,
    axes: [COR, TAM],
    variants: [sku('areia', 'm', 4), sku('preto', 'p', 3), sku('preto', 'm', 3), sku('preto', 'g', 0)],
    customizable: customization !== null,
    customization,
  })!;
}

class FakeSource implements StoreShowcaseSource {
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
  watchShopper(_uid: string, _onChange: (s: StoreShopper) => void) {
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

class FakeApi implements StoreCustomizeApi {
  nameProblem: NameProblem | null = null;
  checked: string[] = [];
  added: AddCustomItemInput[] = [];
  addError: unknown = null;
  uploads: Array<{ uid: string; format: string; contentType: string; progress: (pct: number) => void; resolve: (path: string) => void; reject: (e: unknown) => void }> = [];

  checkName(_productId: string, text: string) {
    this.checked.push(text);
    return Promise.resolve(this.nameProblem);
  }
  uploadImage(uid: string, _file: Blob, format: string, contentType: string, onProgress: (pct: number) => void): CustomUpload {
    let resolve!: (path: string) => void;
    let reject!: (e: unknown) => void;
    const done = new Promise<string>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    this.uploads.push({ uid, format, contentType, progress: onProgress, resolve, reject });
    return { done, cancel: () => undefined };
  }
  addToCart(input: AddCustomItemInput): Promise<AddCustomItemResult> {
    this.added.push(input);
    if (this.addError) return Promise.reject(this.addError);
    return Promise.resolve({ lineId: 'l1', extraPriceCents: 2490, unitPriceCents: 15480, quality: null });
  }
}

function text(el: Element | null | undefined): string {
  return el?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
}


/** PNG de verdade (o componente lê largura × altura pelo navegador). */
function pngFile(width: number, height: number, name = 'logo.png'): Promise<File> {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return new Promise((resolve) =>
    canvas.toBlob((blob) => resolve(new File([blob!], name, { type: 'image/png' })), 'image/png'),
  );
}

async function settle(harness: RouterTestingHarness, ms = 0): Promise<void> {
  await new Promise((r) => setTimeout(r, ms));
  await harness.fixture.whenStable();
  harness.detectChanges();
}

describe('LojaPersonalizarComponent', () => {
  let source: FakeSource;
  let api: FakeApi;
  let toasts: string[];

  async function render(url: string, products: StoreProduct[] = [camiseta()]) {
    source = new FakeSource();
    api = new FakeApi();
    toasts = [];
    const record = (title: string, detail?: string) => toasts.push(detail ? `${title} · ${detail}` : title);
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([
          { path: 'loja/p/:slug/personalizar', component: LojaPersonalizarComponent },
          { path: 'loja/p/:slug', children: [] },
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
        { provide: STORE_CUSTOMIZE_API, useValue: api },
        { provide: NxToastService, useValue: { error: record, warning: record, info: record, success: record } },
      ],
    }).overrideComponent(LojaPersonalizarComponent, {
      remove: { imports: [AtPanelShellComponent] },
      add: { imports: [PanelShellStubComponent] },
    });
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(url, LojaPersonalizarComponent);
    source.products!(products, false);
    source.config!(storeConfigFromDoc({ benefits: { pixDiscountPct: 5, exchangeDays: 30 } }));
    harness.detectChanges();
    return { harness, el: harness.routeNativeElement as HTMLElement };
  }

  function button(el: HTMLElement, label: string): HTMLButtonElement {
    const found = [...el.querySelectorAll('button')].find((b) => text(b) === label || b.getAttribute('aria-label') === label);
    if (!found) throw new Error(`botão "${label}" não encontrado`);
    return found as HTMLButtonElement;
  }

  function type(el: HTMLElement, value: string): HTMLInputElement {
    const input = el.querySelector('#lz-name-input') as HTMLInputElement;
    input.value = value;
    input.dispatchEvent(new Event('input'));
    return input;
  }

  async function pick(harness: RouterTestingHarness, el: HTMLElement, file: File): Promise<void> {
    const input = el.querySelector('input[type=file]') as HTMLInputElement;
    const dt = new DataTransfer();
    dt.items.add(file);
    input.files = dt.files;
    input.dispatchEvent(new Event('change'));
    // Leitura da resolução pelo navegador.
    for (let i = 0; i < 20 && api.uploads.length === 0 && !el.querySelector('.lz-file--bad'); i++) await settle(harness, 20);
  }

  it('abre com cor e tamanho da URL, passos, preços sozinhos e a nota de produção', async () => {
    const { el } = await render('/loja/p/camiseta-personalizada/personalizar?cor=preto&tam=m');
    expect([...el.querySelectorAll('.lz-tag')].map(text)).toEqual(['Personalizável', 'Nome + imagem']);
    expect(text(el.querySelector('.lz-price'))).toBe('R$ 129,90');
    expect(el.querySelector('.lz-breakdown')).toBeNull();
    expect(text(el.querySelector('#lz-step-2'))).toBe('Nome nas costas');
    expect(text(el.querySelector('#lz-step-3'))).toBe('Imagem na frente');
    expect(text(el.querySelector('.lz-step-price'))).toBe('+ R$ 14,90 sozinho');
    expect(button(el, 'Preto').getAttribute('aria-checked')).toBe('true');
    expect(button(el, 'M').getAttribute('aria-checked')).toBe('true');
    expect(button(el, 'G, esgotado').disabled).toBeTrue();
    expect(text(el.querySelector('.lz-note'))).toBe(
      'Feito sob demanda: fica pronto em 5 dias úteis depois que a arte é aprovada. Personalizados só têm troca em caso de defeito.',
    );
    expect(text(el.querySelector('.lz-rules'))).toContain('mínimo 1000 × 1000 px');
  });

  it('nome em maiúsculas atualiza prévia, contagem e total; cor padrão contrasta com a peça', async () => {
    const { harness, el } = await render('/loja/p/camiseta-personalizada/personalizar?cor=preto&tam=m');
    type(el, 'antunes');
    harness.detectChanges();
    expect((el.querySelector('#lz-name-input') as HTMLInputElement).value).toBe('ANTUNES');
    expect(text(el.querySelector('.lz-hint'))).toBe('7 de 12 caracteres · letras, números e espaço');
    expect(text(el.querySelector('.lz-price'))).toBe('R$ 144,80');
    expect(text(el.querySelector('.lz-breakdown'))).toBe('R$ 129,90 + R$ 14,90 de personalização');
    const name = el.querySelector('.lz-stage-main .cp-name') as HTMLElement;
    expect(text(name)).toBe('ANTUNES');
    // Peça preta → o nome claro.
    expect(button(el, 'Cor #f4f4f5').getAttribute('aria-checked')).toBe('true');

    type(el, 'antunes silv');
    harness.detectChanges();
    expect(el.querySelector('.lz-hint')!.classList).toContain('lz-hint--warn');
  });

  it('caractere inválido não entra e o hint avisa; nome bloqueado no blur trava o Adicionar', async () => {
    const { harness, el } = await render('/loja/p/camiseta-personalizada/personalizar?cor=preto&tam=m');
    const input = type(el, 'ana!');
    harness.detectChanges();
    expect(input.value).toBe('ANA');
    expect(text(el.querySelector('.lz-hint'))).toBe('Só letras, números e espaço');

    api.nameProblem = 'blocked';
    input.dispatchEvent(new Event('blur'));
    await settle(harness);
    expect(api.checked).toEqual(['ANA']);
    expect(text(el.querySelector('.lz-hint'))).toBe('Esse nome não pode ser usado');
    expect(input.classList).toContain('lz-input--bad');
    expect(button(el, 'Adicionar ao carrinho').disabled).toBeTrue();

    type(el, 'anab');
    harness.detectChanges();
    expect(button(el, 'Adicionar ao carrinho').disabled).toBeFalse();
  });

  it('"Não quero" recolhe o passo e volta pelo "Adicionar nome"', async () => {
    const { harness, el } = await render('/loja/p/camiseta-personalizada/personalizar?cor=preto&tam=m');
    type(el, 'ana');
    harness.detectChanges();
    button(el, 'Não quero').click();
    harness.detectChanges();
    expect(el.querySelector('#lz-name-input')).toBeNull();
    expect(text(el.querySelector('.lz-price'))).toBe('R$ 129,90');
    button(el, 'Adicionar nome').click();
    harness.detectChanges();
    expect((el.querySelector('#lz-name-input') as HTMLInputElement).value).toBe('ANA');
  });

  it('sem nome nem imagem não adiciona; com nome manda o pedido e abre o mini-carrinho', async () => {
    const { harness, el } = await render('/loja/p/camiseta-personalizada/personalizar?cor=preto&tam=m');
    button(el, 'Adicionar ao carrinho').click();
    await settle(harness);
    expect(api.added.length).toBe(0);
    expect(toasts[0]).toContain('Escolha um nome, uma imagem ou as costas');

    type(el, 'antunes ');
    button(el, 'Clássica').click();
    harness.detectChanges();
    button(el, 'Mais uma').click();
    button(el, 'Adicionar ao carrinho').click();
    await settle(harness);
    expect(api.added).toEqual([
      { productId: 'cam', skuId: 'preto_m', qty: 2, name: { text: 'ANTUNES', fontId: 'classica', color: '#f4f4f5' } },
    ]);
    expect(text(el.querySelector('.lp-add'))).toBe('Adicionado');
    source.cart!([
      { productId: 'cam', skuId: 'preto_m', qty: 2, lineId: 'l1', customization: { extraPriceCents: 1490 } },
    ]);
    harness.detectChanges();
    expect(text(el.ownerDocument.querySelector('app-loja-mini-cart .mc-line'))).toContain('Preto · M · Personalizada');
    expect(text(el.ownerDocument.querySelector('app-loja-mini-cart .mc-price'))).toBe('R$ 289,60');
  });

  it('costas: passo só com a config ligada; número só com dígitos, na prévia e no pedido com o preço', async () => {
    const off = await render('/loja/p/camiseta-personalizada/personalizar?cor=preto&tam=m');
    expect(off.el.querySelector('#lz-step-4')).toBeNull();
    TestBed.resetTestingModule();

    const withBack = {
      ...CUSTOMIZATION,
      back: { enabled: true, allowNumber: true, allowImage: true, numberMaxDigits: 2, widthCm: 25, heightCm: 25 },
      price: { ...CUSTOMIZATION.price, backCents: 990 },
    };
    const { harness, el } = await render('/loja/p/camiseta-personalizada/personalizar?cor=preto&tam=m', [camiseta(withBack)]);
    expect(text(el.querySelector('#lz-step-4'))).toBe('Costas · abaixo do nome');
    expect([...el.querySelectorAll('.lz-tag')].map(text)).toContain('Nome + imagem + costas');
    expect(button(el, 'Número').getAttribute('aria-checked')).toBe('true');

    const number = el.querySelector('#lz-back-number') as HTMLInputElement;
    number.value = '1a0';
    number.dispatchEvent(new Event('input'));
    harness.detectChanges();
    expect(number.value).toBe('10');
    expect(el.querySelector('.lz-hint--bad')).not.toBeNull();
    expect(text(el.querySelector('.lz-stage-main .cp-back-number'))).toBe('10');
    expect(text(el.querySelector('.lz-price'))).toBe('R$ 139,80');

    button(el, 'Adicionar ao carrinho').click();
    await settle(harness);
    expect(api.added).toEqual([{ productId: 'cam', skuId: 'preto_m', qty: 1, back: { type: 'numero', number: '10' } }]);

    // Imagem nas costas: o mesmo envio da frente.
    button(el, 'Imagem').click();
    harness.detectChanges();
    expect(text(el.querySelector('section[aria-labelledby="lz-step-4"] .lz-drop'))).toContain('Enviar imagem das costas');
  });

  it('erro do servidor vira toast com a mensagem dele', async () => {
    const { harness, el } = await render('/loja/p/camiseta-personalizada/personalizar?cor=preto&tam=m');
    api.addError = { code: 'functions/failed-precondition', message: 'Acabou o estoque dessa variação.' };
    type(el, 'ana');
    button(el, 'Adicionar ao carrinho').click();
    await settle(harness);
    expect(toasts).toContain('Não deu pra adicionar ao carrinho · Acabou o estoque dessa variação.');
  });

  it('imagem pequena demais fica no card vermelho e não sobe', async () => {
    const { harness, el } = await render('/loja/p/camiseta-personalizada/personalizar?cor=preto&tam=m');
    await pick(harness, el, await pngFile(400, 400, 'pequena.png'));
    await settle(harness);
    expect(api.uploads.length).toBe(0);
    expect(text(el.querySelector('.lz-file--bad'))).toContain('Imagem pequena demais · mínimo 1000 × 1000 px');
  });

  it('imagem boa sobe com progresso, mostra a qualidade e vai no pedido com área e ajuste', async () => {
    const { harness, el } = await render('/loja/p/camiseta-personalizada/personalizar?cor=preto&tam=m');
    await pick(harness, el, await pngFile(1200, 1200));
    await settle(harness);
    expect(api.uploads.length).toBe(1);
    expect(api.uploads[0]!.format).toBe('png');
    expect(api.uploads[0]!.contentType).toBe('image/png');
    api.uploads[0]!.progress(40);
    harness.detectChanges();
    expect(text(el.querySelector('.lz-progress-label'))).toBe('Enviando… 40%');
    expect(button(el, 'Adicionar ao carrinho').disabled).toBeTrue();

    api.uploads[0]!.resolve('store/custom-uploads/ana/x.png');
    await settle(harness);
    expect(text(el.querySelector('.lz-q'))).toBe('Boa qualidade · 1200 × 1200 px');
    expect(text(el.querySelector('.lz-price'))).toBe('R$ 149,80');

    // 1200 px em 25 cm = 122 dpi: avisa e segue.
    button(el, 'Centro da frente, 25 × 30 cm').click();
    harness.detectChanges();
    expect(text(el.querySelector('.lz-q'))).toBe('Pode ficar levemente borrada no tamanho Centro da frente');

    button(el, 'Adicionar ao carrinho').click();
    await settle(harness);
    expect(api.added[0]!.image).toEqual({
      path: 'store/custom-uploads/ana/x.png',
      areaId: 'centro_frente',
      transform: { x: 0.5, y: 0.5, scale: 1 },
    });
    expect(api.added[0]!.name).toBeUndefined();
  });

  it('envio que falha deixa tentar de novo', async () => {
    const { harness, el } = await render('/loja/p/camiseta-personalizada/personalizar?cor=preto&tam=m');
    await pick(harness, el, await pngFile(1200, 1200));
    api.uploads[0]!.reject(new Error('rede'));
    await settle(harness);
    expect(text(el.querySelector('.lz-q--bad'))).toBe('Não deu pra enviar a imagem');
    button(el, 'Tentar de novo').click();
    harness.detectChanges();
    expect(api.uploads.length).toBe(2);
  });

  it('produto sem opção de personalização manda de volta ao produto', async () => {
    const { el } = await render('/loja/p/camiseta-personalizada/personalizar', [
      camiseta({ fromCents: 1490, leadDays: 5, defectOnlyReturns: true }),
    ]);
    expect(text(el.querySelector('.lp-state h2'))).toBe('Esse produto não está personalizável agora');
  });
});
