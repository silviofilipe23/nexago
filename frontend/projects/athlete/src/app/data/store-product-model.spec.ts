import {
  axisValueAvailable,
  chooseAxisMessage,
  deliveryPriceCents,
  galleryPhotos,
  initialSelection,
  lowStockCaption,
  maxQuantity,
  mergeCartItem,
  pickupReadyLabel,
  relatedProducts,
  selectAxisValue,
  selectedVariant,
  selectionPrice,
  soldOutMessage,
  variantLabel,
} from './store-product-model';
import { storeProductFromDoc, type StoreProduct } from './store-showcase-model';

const COR = {
  id: 'cor',
  label: 'Cor',
  values: [
    { id: 'branco', label: 'Branco areia', hex: '#f1ece2' },
    { id: 'laranja', label: 'Laranja', hex: '#ff6a1a' },
    { id: 'preto', label: 'Preto', hex: '#111111' },
  ],
};
const TAM = {
  id: 'tam',
  label: 'Tamanho',
  values: ['p', 'm', 'g'].map((id) => ({ id, label: id.toUpperCase(), hex: null })),
};

function sku(cor: string, tam: string, stock: number, over: Record<string, unknown> = {}) {
  return {
    id: `${cor}_${tam}`,
    values: { cor, tam },
    priceCents: 12990,
    inStock: stock > 0,
    maxQty: Math.min(stock, 10),
    lowStock: stock > 0 && stock <= 3,
    ...over,
  };
}

/** Camiseta: branco P/M/G (G com 2), laranja só M, preto esgotado. */
function camiseta(over: Record<string, unknown> = {}): StoreProduct {
  return storeProductFromDoc('cam', {
    name: 'Camiseta Dry UV50 Areia',
    category: 'vestuario',
    priceCents: 12990,
    minPriceCents: 12990,
    maxPriceCents: 12990,
    axes: [COR, TAM],
    variants: [
      sku('branco', 'p', 8),
      sku('branco', 'm', 12),
      sku('branco', 'g', 2),
      sku('laranja', 'p', 0),
      sku('laranja', 'm', 5),
      sku('preto', 'm', 0),
    ],
    ...over,
  })!;
}

describe('store-product-model', () => {
  describe('seleção', () => {
    it('pré-seleciona a primeira cor com saldo e nunca o tamanho', () => {
      expect(initialSelection(camiseta())).toEqual({ cor: 'branco' });
      const semBranco = camiseta({ variants: [sku('branco', 'm', 0), sku('laranja', 'm', 3)] });
      expect(initialSelection(semBranco)).toEqual({ cor: 'laranja' });
    });

    it('tudo esgotado: ainda escolhe a primeira cor (para mostrar as fotos)', () => {
      const p = camiseta({ variants: [sku('branco', 'm', 0), sku('preto', 'm', 0)] });
      expect(initialSelection(p)).toEqual({ cor: 'branco' });
    });

    it('eixo de um valor só já vem escolhido', () => {
      const p = storeProductFromDoc('v', {
        name: 'Viseira',
        priceCents: 6990,
        axes: [{ id: 'tam', label: 'Tamanho', values: [{ id: 'u', label: 'Único' }] }],
        variants: [{ id: 'u', values: { tam: 'u' }, priceCents: 6990, inStock: true }],
      })!;
      expect(initialSelection(p)).toEqual({ tam: 'u' });
      expect(selectedVariant(p, initialSelection(p))?.id).toBe('u');
    });

    it('disponibilidade em cascata: cor só riscada sem saldo nenhum; tamanho depende da cor', () => {
      const p = camiseta();
      expect(axisValueAvailable(p, 0, 'laranja', { tam: 'g' })).toBeTrue();
      expect(axisValueAvailable(p, 0, 'preto', {})).toBeFalse();
      expect(axisValueAvailable(p, 1, 'p', { cor: 'laranja' })).toBeFalse();
      expect(axisValueAvailable(p, 1, 'p', { cor: 'branco' })).toBeTrue();
      expect(axisValueAvailable(p, 1, 'm', { cor: 'preto' })).toBeFalse();
    });

    it('trocar a cor solta o tamanho que ficou sem saldo e mantém o que tem', () => {
      const p = camiseta();
      expect(selectAxisValue(p, { cor: 'branco', tam: 'p' }, 'cor', 'laranja')).toEqual({ cor: 'laranja' });
      expect(selectAxisValue(p, { cor: 'branco', tam: 'm' }, 'cor', 'laranja')).toEqual({ cor: 'laranja', tam: 'm' });
    });

    it('SKU só com todos os eixos; produto sem eixo é o SKU único', () => {
      const p = camiseta();
      expect(selectedVariant(p, { cor: 'branco' })).toBeNull();
      expect(selectedVariant(p, { cor: 'branco', tam: 'g' })?.id).toBe('branco_g');
      const bola = storeProductFromDoc('b', {
        name: 'Bola',
        priceCents: 28990,
        variants: [{ id: 'unico', values: {}, priceCents: 28990, inStock: true }],
      })!;
      expect(selectedVariant(bola, {})?.id).toBe('unico');
    });

    it('mensagem do eixo que falta', () => {
      expect(chooseAxisMessage(TAM)).toBe('Escolha um tamanho');
      expect(chooseAxisMessage(COR)).toBe('Escolha uma cor');
      expect(chooseAxisMessage({ id: 'm', label: 'Modelo', values: [] })).toBe('Escolha modelo');
    });

    it('rótulo da variação e aviso de estoque que acabou', () => {
      const p = camiseta();
      const v = selectedVariant(p, { cor: 'branco', tam: 'm' })!;
      expect(variantLabel(p, v)).toBe('Branco areia · M');
      expect(soldOutMessage(p, v)).toBe('Acabou o estoque do M · escolha outro tamanho');
    });
  });

  describe('preço e quantidade', () => {
    it('SKU escolhido manda; antes disso, "a partir de" quando a faixa varia', () => {
      const p = camiseta({
        variants: [sku('branco', 'p', 3), sku('branco', 'm', 3), sku('branco', 'g', 3, { priceCents: 14990 })],
        maxPriceCents: 14990,
      });
      expect(selectionPrice(p, { cor: 'branco' })).toEqual({ cents: 12990, from: true, strikeCents: null });
      expect(selectionPrice(p, { cor: 'branco', tam: 'g' })).toEqual({ cents: 14990, from: false, strikeCents: null });
    });

    it('faixa ignora o SKU sem saldo enquanto houver algum com saldo', () => {
      const p = camiseta({
        variants: [sku('branco', 'p', 0, { priceCents: 9990 }), sku('branco', 'm', 3)],
      });
      expect(selectionPrice(p, { cor: 'branco' }).cents).toBe(12990);
      expect(selectionPrice(p, { cor: 'branco' }).from).toBeFalse();
    });

    it('preço "de" riscado só quando maior e sem "a partir de"', () => {
      const p = camiseta({ compareAtPriceCents: 15990 });
      expect(selectionPrice(p, { cor: 'branco' }).strikeCents).toBe(15990);
    });

    it('quantidade vai até o saldo do SKU (teto 10); sem SKU, 10', () => {
      const p = camiseta();
      expect(maxQuantity(p, { cor: 'branco' })).toBe(10);
      expect(maxQuantity(p, { cor: 'branco', tam: 'g' })).toBe(2);
      expect(maxQuantity(p, { cor: 'branco', tam: 'm' })).toBe(10);
    });

    it('estoque baixo: "Só N no tamanho M"; acima do teto, "Últimas unidades"', () => {
      const p = camiseta();
      expect(lowStockCaption(p, { cor: 'branco', tam: 'g' })).toBe('Só 2 no tamanho G');
      expect(lowStockCaption(p, { cor: 'branco', tam: 'm' })).toBeNull();
      const alto = camiseta({ variants: [sku('branco', 'm', 12, { lowStock: true })] });
      expect(lowStockCaption(alto, { cor: 'branco', tam: 'm' })).toBe('Últimas unidades no tamanho M');
    });
  });

  describe('carrinho', () => {
    const base = [{ productId: 'cam', skuId: 'branco_m', qty: 8 }];

    it('soma no mesmo SKU sem passar do saldo', () => {
      const out = mergeCartItem(base, { productId: 'cam', skuId: 'branco_m', qty: 5, maxQty: 10 })!;
      expect(out.items).toEqual([{ productId: 'cam', skuId: 'branco_m', qty: 10 }]);
      expect(out.added).toBe(2);
      expect(mergeCartItem(out.items, { productId: 'cam', skuId: 'branco_m', qty: 1, maxQty: 10 })!.added).toBe(0);
    });

    it('linha nova; carrinho com 30 linhas recusa', () => {
      const out = mergeCartItem(base, { productId: 'cam', skuId: 'branco_g', qty: 3, maxQty: 2 })!;
      expect(out.items[1]).toEqual({ productId: 'cam', skuId: 'branco_g', qty: 2 });
      const cheio = Array.from({ length: 30 }, (_, i) => ({ productId: `p${i}`, skuId: 'u', qty: 1 }));
      expect(mergeCartItem(cheio, { productId: 'novo', skuId: 'u', qty: 1, maxQty: 10 })).toBeNull();
    });
  });

  describe('galeria', () => {
    const fotos = [
      { url: 'branco-1', colorValueId: 'branco' },
      { url: 'laranja-1', colorValueId: 'laranja' },
      { url: 'geral', colorValueId: null },
      { url: 'branco-2', colorValueId: 'branco' },
    ];

    it('fotos da cor seguidas das sem cor; cor sem foto → as sem cor', () => {
      const p = camiseta({ photos: fotos });
      expect(galleryPhotos(p, { cor: 'branco' }).map((f) => f.url)).toEqual(['branco-1', 'branco-2', 'geral']);
      expect(galleryPhotos(p, { cor: 'preto' }).map((f) => f.url)).toEqual(['geral']);
    });

    it('sem nenhuma sem cor, mostra todas; sem galeria, a capa', () => {
      const p = camiseta({ photos: fotos.filter((f) => f.colorValueId !== null) });
      expect(galleryPhotos(p, { cor: 'preto' }).length).toBe(3);
      const capa = camiseta({ coverUrl: 'https://cdn/capa.jpg' });
      expect(galleryPhotos(capa, { cor: 'branco' })).toEqual([{ url: 'https://cdn/capa.jpg', colorValueId: null }]);
    });
  });

  describe('relacionados', () => {
    it('mais vendidos da mesma categoria primeiro, sem o próprio e sem esgotados', () => {
      const mk = (id: string, category: string, sold: number, soldOut = false) =>
        storeProductFromDoc(id, { name: id, category, priceCents: 100, soldLast30: sold, soldOut })!;
      const self = mk('self', 'vestuario', 99);
      const catalog = [
        self,
        mk('bola', 'bolas', 80),
        mk('bone', 'vestuario', 5),
        mk('regata', 'vestuario', 20),
        mk('short', 'vestuario', 50, true),
        mk('oculos', 'acessorios', 40),
      ];
      expect(relatedProducts(self, catalog, 3).map((p) => p.id)).toEqual(['regata', 'bone', 'bola']);
    });
  });

  describe('como receber', () => {
    // 2026-10-16 é sexta-feira.
    it('arredonda pra hora cheia e diz o dia', () => {
      expect(pickupReadyLabel(24, new Date('2026-10-16T18:20:00Z'))).toBe('Pronto amanhã a partir das 16h');
      expect(pickupReadyLabel(2, new Date('2026-10-16T13:00:00Z'))).toBe('Pronto hoje a partir das 12h');
    });

    it('antes das 8h vira 8h; depois das 20h, 8h do dia seguinte', () => {
      expect(pickupReadyLabel(4, new Date('2026-10-16T05:00:00Z'))).toBe('Pronto hoje a partir das 8h');
      expect(pickupReadyLabel(2, new Date('2026-10-16T22:30:00Z'))).toBe('Pronto amanhã a partir das 8h');
    });

    it('dia da semana até 6 dias; depois a data', () => {
      expect(pickupReadyLabel(48, new Date('2026-10-16T15:00:00Z'))).toBe('Pronto domingo a partir das 12h');
      expect(pickupReadyLabel(24 * 9, new Date('2026-10-16T15:00:00Z'))).toBe('Pronto 25/10 a partir das 12h');
    });

    it('entrega grátis a partir do frete grátis; sem preço = no checkout', () => {
      const expressa = { id: 'expressa', name: 'Expressa', description: '', priceCents: 3490 };
      expect(deliveryPriceCents(expressa, 12990, 39900)).toBe(3490);
      expect(deliveryPriceCents(expressa, 39900, 39900)).toBe(0);
      expect(deliveryPriceCents({ ...expressa, priceCents: null }, 100, null)).toBeNull();
    });
  });
});
