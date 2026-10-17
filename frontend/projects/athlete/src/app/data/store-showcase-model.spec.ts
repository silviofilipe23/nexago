import {
  EMPTY_SHOWCASE_CONFIG,
  cardBadge,
  cartItemsFromDoc,
  cartUnits,
  displayPriceCents,
  liveBanners,
  matchesSearch,
  pixPriceCents,
  priceVaries,
  saoPauloDateKey,
  searchSuggestions,
  showRating,
  sortProducts,
  storeConfigFromDoc,
  storeProductFromDoc,
  strikePriceCents,
  visibleCategories,
  type StoreProduct,
} from './store-showcase-model';

function product(over: Partial<StoreProduct> = {}): StoreProduct {
  return {
    id: 'p1',
    name: 'Bola NexaGO Pro Beach',
    slug: 'bola',
    category: 'bolas',
    collection: 'linha-pro',
    brand: 'NexaGO',
    badge: null,
    badgeExpiresAt: null,
    priceCents: 28990,
    compareAtPriceCents: null,
    minPriceCents: 28990,
    maxPriceCents: 28990,
    coverUrl: null,
    photos: [],
    description: '',
    details: [],
    pickup: true,
    delivery: true,
    axes: [],
    variants: [{ id: 'unico', values: {}, priceCents: 28990, inStock: true, maxQty: 10, lowStock: false }],
    soldOut: false,
    customizable: false,
    customization: null,
    ratingAvg: null,
    ratingCount: 0,
    soldLast30: 10,
    publishedAt: new Date('2026-10-01T12:00:00Z'),
    ...over,
  };
}

const NOW = new Date('2026-10-16T18:00:00Z');

describe('store-showcase-model', () => {
  describe('storeProductFromDoc', () => {
    it('lê o espelho e converte Timestamp', () => {
      const p = storeProductFromDoc('p1', {
        name: 'Viseira Dry Fit',
        priceCents: 6990,
        minPriceCents: 6990,
        maxPriceCents: 6990,
        compareAtPriceCents: 6990,
        badge: 'nova',
        badgeExpiresAt: { toDate: () => new Date('2026-10-31T00:00:00Z') },
        variants: [{ id: 'unico', values: {}, priceCents: 6990, inStock: true }],
      })!;
      expect(p.name).toBe('Viseira Dry Fit');
      expect(p.compareAtPriceCents).toBeNull();
      expect(p.badgeExpiresAt?.toISOString()).toBe('2026-10-31T00:00:00.000Z');
      expect(p.variants[0]!.inStock).toBeTrue();
    });

    it('lê galeria, detalhes, personalização e o saldo da compra', () => {
      const p = storeProductFromDoc('p1', {
        name: 'Camiseta',
        priceCents: 12990,
        photos: [{ url: 'https://cdn/a.jpg', colorValueId: 'branco' }, { url: '' }, { url: 'https://cdn/b.jpg' }],
        description: ' Leve. ',
        details: [{ label: 'Tecido', value: 'Dry' }, { label: 'Vazio', value: '' }],
        customizable: true,
        customization: { fromCents: 1490, leadDays: 5, defectOnlyReturns: true },
        variants: [
          { id: 'm', values: { tam: 'm' }, priceCents: 12990, inStock: true, maxQty: 2, lowStock: true },
          { id: 'g', values: { tam: 'g' }, priceCents: 12990, inStock: false, maxQty: 0 },
        ],
      })!;
      expect(p.photos).toEqual([
        { url: 'https://cdn/a.jpg', colorValueId: 'branco' },
        { url: 'https://cdn/b.jpg', colorValueId: null },
      ]);
      expect(p.description).toBe('Leve.');
      expect(p.details).toEqual([{ label: 'Tecido', value: 'Dry' }]);
      expect(p.customization).toEqual({ fromCents: 1490, leadDays: 5, defectOnlyReturns: true });
      expect(p.variants.map((v) => [v.id, v.maxQty, v.lowStock])).toEqual([
        ['m', 2, true],
        ['g', 0, false],
      ]);
    });

    it('doc anterior aos campos da página: teto com saldo, nada de galeria nem entrega', () => {
      const p = storeProductFromDoc('p1', {
        name: 'Bola',
        priceCents: 28990,
        variants: [
          { id: 'unico', values: {}, priceCents: 28990, inStock: true },
          { id: 'outra', values: {}, priceCents: 28990, inStock: false },
        ],
      })!;
      expect(p.variants.map((v) => v.maxQty)).toEqual([10, 0]);
      expect(p.photos).toEqual([]);
      expect(p.customization).toBeNull();
      expect(storeConfigFromDoc({}).delivery).toEqual({ freeAboveCents: null, modes: [] });
    });

    it('descarta doc sem nome ou sem preço', () => {
      expect(storeProductFromDoc('x', { name: '', priceCents: 100 })).toBeNull();
      expect(storeProductFromDoc('x', { name: 'A', priceCents: 0 })).toBeNull();
      expect(storeProductFromDoc('x', undefined)).toBeNull();
    });
  });

  describe('storeConfigFromDoc', () => {
    it('sem doc não promete Pix nem retirada', () => {
      const c = storeConfigFromDoc(undefined);
      expect(c.benefits.pixDiscountPct).toBeNull();
      expect(c.benefits.pickupReadyHours).toBeNull();
      expect(c.categories.map((x) => x.id)).toEqual(['bolas', 'vestuario', 'acessorios', 'rede-quadra', 'kits']);
    });

    it('lê benefícios e banners válidos', () => {
      const c = storeConfigFromDoc({
        benefits: { pixDiscountPct: 5, pickupReadyHours: 48, exchangeDays: 30 },
        banners: [
          { id: 'v', title: 'Equipamento', primary: { collectionId: 'verao-2026' } },
          { id: 'sem-colecao', title: 'x', primary: {} },
        ],
      });
      expect(c.benefits).toEqual({ pixDiscountPct: 5, pickupReadyHours: 48, exchangeDays: 30 });
      expect(c.banners.map((b) => b.id)).toEqual(['v']);
      expect(c.banners[0]!.primary.label).toBe('Ver coleção');
    });
  });

  describe('preço', () => {
    it('Pix arredonda ao centavo como o servidor', () => {
      expect(pixPriceCents(28990, 5)).toBe(27541);
      expect(pixPriceCents(12990, 5)).toBe(12341);
      expect(pixPriceCents(6990, 5)).toBe(6641);
      expect(pixPriceCents(10000, 5)).toBe(9500);
    });

    it('variação com preços diferentes vira "a partir de" e solta o "de"', () => {
      const p = product({ minPriceCents: 12990, maxPriceCents: 14990, compareAtPriceCents: 15990 });
      expect(priceVaries(p)).toBeTrue();
      expect(displayPriceCents(p)).toBe(12990);
      expect(strikePriceCents(p)).toBeNull();
    });

    it('"de" só quando maior que o preço exibido', () => {
      expect(strikePriceCents(product({ compareAtPriceCents: 32990 }))).toBe(32990);
      expect(strikePriceCents(product({ compareAtPriceCents: 28990 }))).toBeNull();
    });
  });

  describe('cardBadge', () => {
    it('esgotado manda sobre qualquer selo', () => {
      expect(cardBadge(product({ soldOut: true, badge: 'mais-vendida' }), NOW)).toEqual({ label: 'Esgotado', tone: 'dark' });
    });

    it('"Mais vendida" no web vira "Top" no app', () => {
      expect(cardBadge(product({ badge: 'mais-vendida' }), NOW)?.label).toBe('Mais vendida');
      expect(cardBadge(product({ badge: 'mais-vendida' }), NOW, 'app')?.label).toBe('Top');
    });

    it('"Nova" vencida some e cede ao desconto', () => {
      const p = product({
        badge: 'nova',
        badgeExpiresAt: new Date('2026-10-10T00:00:00Z'),
        priceCents: 8990,
        minPriceCents: 8990,
        maxPriceCents: 8990,
        compareAtPriceCents: 10990,
      });
      expect(cardBadge(p, NOW)).toEqual({ label: '-18%', tone: 'orange' });
      expect(cardBadge({ ...p, badgeExpiresAt: new Date('2026-10-31T00:00:00Z') }, NOW)).toEqual({ label: 'Nova', tone: 'dark' });
    });

    it('sem selo e sem "de", nada', () => {
      expect(cardBadge(product(), NOW)).toBeNull();
    });
  });

  it('nota só com 3 avaliações ou mais', () => {
    expect(showRating(product({ ratingAvg: 4.9, ratingCount: 2 }))).toBeFalse();
    expect(showRating(product({ ratingAvg: 4.9, ratingCount: 3 }))).toBeTrue();
    expect(showRating(product({ ratingAvg: null, ratingCount: 10 }))).toBeFalse();
  });

  describe('sortProducts', () => {
    const a = product({ id: 'a', name: 'A', soldLast30: 5, minPriceCents: 300, maxPriceCents: 300, publishedAt: new Date('2026-10-01') });
    const b = product({ id: 'b', name: 'B', soldLast30: 5, minPriceCents: 100, maxPriceCents: 100, publishedAt: new Date('2026-10-05') });
    const c = product({ id: 'c', name: 'C', soldLast30: 9, minPriceCents: 200, maxPriceCents: 200, publishedAt: new Date('2026-09-01'), ratingAvg: 4.5, ratingCount: 4 });

    it('mais vendidos desempata pelo mais recente', () => {
      expect(sortProducts([a, b, c], 'mais-vendidos').map((p) => p.id)).toEqual(['c', 'b', 'a']);
    });

    it('preço e novidades', () => {
      expect(sortProducts([a, b, c], 'menor-preco').map((p) => p.id)).toEqual(['b', 'c', 'a']);
      expect(sortProducts([a, b, c], 'maior-preco').map((p) => p.id)).toEqual(['a', 'c', 'b']);
      expect(sortProducts([a, b, c], 'novidades').map((p) => p.id)).toEqual(['b', 'a', 'c']);
    });

    it('melhor avaliados põe quem não tem nota no fim', () => {
      expect(sortProducts([a, b, c], 'melhor-avaliados')[0]!.id).toBe('c');
    });
  });

  describe('busca', () => {
    const config = EMPTY_SHOWCASE_CONFIG;
    it('ignora acento e caixa, exige todos os termos', () => {
      const oculos = product({ name: 'Óculos Polarizado Sunline', category: 'acessorios' });
      expect(matchesSearch(oculos, 'oculos', config)).toBeTrue();
      expect(matchesSearch(oculos, 'OCULOS acessorios', config)).toBeTrue();
      expect(matchesSearch(oculos, 'oculos bola', config)).toBeFalse();
    });

    it('casa pela coleção também', () => {
      expect(matchesSearch(product(), 'linha pro', config)).toBeTrue();
    });

    it('sugestões a partir de 2 caracteres, até 5 produtos e 3 categorias', () => {
      const list = Array.from({ length: 7 }, (_, i) => product({ id: `b${i}`, name: `Bola ${i}`, soldLast30: i }));
      expect(searchSuggestions(list, config, 'b').products.length).toBe(0);
      const s = searchSuggestions(list, config, 'bo');
      expect(s.products.length).toBe(5);
      expect(s.products[0]!.id).toBe('b6');
      expect(s.categories.map((c) => c.id)).toEqual(['bolas']);
    });
  });

  it('chips só de categoria com produto, na ordem da config', () => {
    const list = [product({ category: 'kits' }), product({ category: 'bolas' })];
    expect(visibleCategories(EMPTY_SHOWCASE_CONFIG, list).map((c) => c.id)).toEqual(['bolas', 'kits']);
  });

  describe('banners', () => {
    it('usa a data civil de São Paulo', () => {
      // 01:30 UTC do dia 17 ainda é dia 16 em São Paulo.
      expect(saoPauloDateKey(new Date('2026-10-17T01:30:00Z'))).toBe('2026-10-16');
    });

    it('filtra pela janela e corta em 3', () => {
      const base = { kicker: '', subtitle: '', imageUrl: null, primary: { label: 'Ver', collectionId: 'c' }, secondary: null };
      const config = {
        ...EMPTY_SHOWCASE_CONFIG,
        banners: [
          { ...base, id: 'passado', title: 'x', startDate: '2026-09-01', endDate: '2026-09-30' },
          { ...base, id: 'hoje', title: 'x', startDate: '2026-10-16', endDate: '2026-10-16' },
          { ...base, id: 'futuro', title: 'x', startDate: '2026-11-01', endDate: null },
          { ...base, id: 's1', title: 'x', startDate: null, endDate: null },
          { ...base, id: 's2', title: 'x', startDate: null, endDate: null },
          { ...base, id: 's3', title: 'x', startDate: null, endDate: null },
        ],
      };
      expect(liveBanners(config, NOW).map((b) => b.id)).toEqual(['hoje', 's1', 's2']);
    });
  });

  it('carrinho soma unidades e ignora item inválido', () => {
    const items = cartItemsFromDoc({
      items: [
        { productId: 'p1', skuId: 'unico', qty: 2 },
        { productId: 'p2', skuId: 'm', qty: 1 },
        { productId: '', skuId: 'x', qty: 9 },
      ],
    });
    expect(cartUnits(items)).toBe(3);
  });
});
