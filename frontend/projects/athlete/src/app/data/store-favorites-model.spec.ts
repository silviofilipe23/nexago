import {
  biggestDiscount,
  bulkAddMessage,
  bulkAddPlan,
  directVariant,
  favoriteAction,
  favoriteBadge,
  lastUnits,
  matchesFavoritesFilter,
  orderedFavorites,
  relatedToFavorites,
} from './store-favorites-model';
import { storeProductFromDoc, type StoreProduct } from './store-showcase-model';

function product(id: string, over: Record<string, unknown> = {}): StoreProduct {
  return storeProductFromDoc(id, {
    name: `Produto ${id}`,
    slug: id,
    category: 'acessorios',
    priceCents: 10000,
    variants: [{ id: 'unico', values: {}, priceCents: 10000, inStock: true, maxQty: 10 }],
    ...over,
  })!;
}

const CUSTOM = {
  fromCents: 1490,
  leadDays: 5,
  name: { enabled: true, maxChars: 12, placement: 'costas_superior', fonts: ['bloco'], colors: ['#ffffff'] },
};

describe('store-favorites-model', () => {
  it('o último favoritado primeiro; fora do catálogo e repetido ficam de fora', () => {
    const catalog = [product('a'), product('b'), product('c')];
    expect(orderedFavorites(['a', 'sumiu', 'b', 'c', 'b'], catalog).map((p) => p.id)).toEqual(['b', 'c', 'a']);
  });

  it('selo: esgotado > desconto > últimas unidades', () => {
    expect(favoriteBadge(product('x', { soldOut: true, compareAtPriceCents: 12000 }))?.label).toBe('Esgotado');
    expect(favoriteBadge(product('x', { compareAtPriceCents: 12000 }))).toEqual({ kind: 'desconto', label: 'Baixou R$ 20' });
    const low = product('x', {
      variants: [
        { id: 'p', values: { tam: 'p' }, priceCents: 10000, inStock: true, maxQty: 2, lowStock: true },
        { id: 'm', values: { tam: 'm' }, priceCents: 10000, inStock: true, maxQty: 1, lowStock: true },
        { id: 'g', values: { tam: 'g' }, priceCents: 10000, inStock: false, maxQty: 0 },
      ],
    });
    expect(lastUnits(low)).toBe(3);
    expect(favoriteBadge(low)?.label).toBe('Últimas 3 unidades');
    expect(favoriteBadge(product('x'))).toBeNull();
  });

  it('últimas unidades só quando TODO SKU com saldo está no fim; 10+ vira "Últimas unidades"', () => {
    const mixed = product('x', {
      variants: [
        { id: 'p', values: { tam: 'p' }, priceCents: 10000, inStock: true, maxQty: 2, lowStock: true },
        { id: 'm', values: { tam: 'm' }, priceCents: 10000, inStock: true, maxQty: 10 },
      ],
    });
    expect(lastUnits(mixed)).toBeNull();
    const many = product('x', {
      variants: [
        { id: 'p', values: { tam: 'p' }, priceCents: 10000, inStock: true, maxQty: 6, lowStock: true },
        { id: 'm', values: { tam: 'm' }, priceCents: 10000, inStock: true, maxQty: 5, lowStock: true },
      ],
    });
    expect(favoriteBadge(many)?.label).toBe('Últimas unidades');
  });

  it('ação: avise-me, personalizar, adicionar direto ou ver opções', () => {
    expect(favoriteAction(product('x', { soldOut: true }))).toBe('avise');
    expect(favoriteAction(product('x', { customizable: true, customization: CUSTOM }))).toBe('personalizar');
    expect(favoriteAction(product('x'))).toBe('adicionar');
    const sizes = product('x', {
      variants: [
        { id: 'p', values: { tam: 'p' }, priceCents: 10000, inStock: true },
        { id: 'm', values: { tam: 'm' }, priceCents: 10000, inStock: true },
      ],
    });
    expect(favoriteAction(sizes)).toBe('opcoes');
    expect(directVariant(sizes)).toBeNull();
    expect(directVariant(product('x', { variants: [{ id: 'u', values: {}, priceCents: 1, inStock: false }] }))).toBeNull();
  });

  it('filtros e o plano do "adicionar disponíveis"', () => {
    const favs = [
      product('a', { compareAtPriceCents: 12000 }),
      product('b', { soldOut: true }),
      product('c', { variants: [{ id: 'p', values: { t: 'p' } }, { id: 'm', values: { t: 'm' } }].map((v) => ({ ...v, priceCents: 1, inStock: true })) }),
    ];
    expect(favs.filter((p) => matchesFavoritesFilter(p, 'desconto')).map((p) => p.id)).toEqual(['a']);
    expect(favs.filter((p) => matchesFavoritesFilter(p, 'disponiveis')).map((p) => p.id)).toEqual(['a', 'c']);
    const plan = bulkAddPlan(favs);
    expect(plan.add.map((p) => p.id)).toEqual(['a']);
    expect(plan.needChoice).toBe(1);
    expect(bulkAddMessage(1, 1)).toEqual({ title: '1 item no carrinho', detail: '1 pede cor ou tamanho na página do produto' });
    expect(bulkAddMessage(3, 0)).toEqual({ title: '3 itens no carrinho', detail: undefined });
  });

  it('"combina com": categorias dos favoritos primeiro, mais vendidos antes, sem favoritos e esgotados', () => {
    const favs = [product('fav', { category: 'bolas' })];
    const catalog = [
      ...favs,
      product('acc-top', { category: 'acessorios', soldLast30: 90 }),
      product('bola-low', { category: 'bolas', soldLast30: 1 }),
      product('bola-top', { category: 'bolas', soldLast30: 50 }),
      product('bola-out', { category: 'bolas', soldOut: true, soldLast30: 99 }),
    ];
    expect(relatedToFavorites(favs, catalog, 3).map((p) => p.id)).toEqual(['bola-top', 'bola-low', 'acc-top']);
  });

  it('destaque do app: o maior desconto entre os disponíveis', () => {
    const favs = [
      product('a', { compareAtPriceCents: 11000 }),
      product('b', { compareAtPriceCents: 13000 }),
      product('c', { compareAtPriceCents: 20000, soldOut: true }),
    ];
    expect(biggestDiscount(favs)).toEqual({ product: favs[1]!, cents: 3000 });
    expect(biggestDiscount([product('x')])).toBeNull();
  });
});
