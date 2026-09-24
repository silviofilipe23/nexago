import type { ArenaProduct } from './product.model';
import { costCentsFromDoc, mergeProductCosts } from './products-repository';

function product(overrides: Partial<ArenaProduct> = {}): ArenaProduct {
  return {
    id: 'p1',
    name: 'Água mineral 500ml',
    category: 'bebidas',
    active: true,
    priceCents: 1000,
    stockQuantity: 10,
    minStockQuantity: 2,
    ...overrides,
  };
}

describe('costCentsFromDoc', () => {
  it('lê o custo gravado', () => {
    expect(costCentsFromDoc({ costCents: 400 })).toBe(400);
  });

  it('aceita custo zero — é custo informado, não ausência de custo', () => {
    expect(costCentsFromDoc({ costCents: 0 })).toBe(0);
  });

  it('devolve undefined quando o doc de custo não existe', () => {
    expect(costCentsFromDoc(undefined)).toBeUndefined();
  });

  it('descarta valor de tipo errado em vez de vazar para a tela', () => {
    expect(costCentsFromDoc({ costCents: '400' })).toBeUndefined();
    expect(costCentsFromDoc({ costCents: null })).toBeUndefined();
    expect(costCentsFromDoc({})).toBeUndefined();
  });

  it('descarta custo negativo', () => {
    expect(costCentsFromDoc({ costCents: -100 })).toBeUndefined();
  });
});

describe('mergeProductCosts', () => {
  it('casa o custo com o produto pelo id', () => {
    const merged = mergeProductCosts(
      [product({ id: 'a' }), product({ id: 'b' })],
      new Map([
        ['a', 400],
        ['b', 250],
      ]),
    );

    expect(merged[0].costCents).toBe(400);
    expect(merged[1].costCents).toBe(250);
  });

  it('deixa sem custo o produto que ainda não tem doc de custo', () => {
    const merged = mergeProductCosts([product({ id: 'a' }), product({ id: 'b' })], new Map([['a', 400]]));

    expect(merged[0].costCents).toBe(400);
    expect(merged[1].costCents).toBeUndefined();
  });

  it('não inventa produto a partir de custo órfão', () => {
    const merged = mergeProductCosts([product({ id: 'a' })], new Map([['fantasma', 999]]));

    expect(merged.length).toBe(1);
    expect(merged[0].id).toBe('a');
    expect(merged[0].costCents).toBeUndefined();
  });

  it('preserva a ordem e os demais campos do produto', () => {
    const merged = mergeProductCosts([product({ id: 'a', name: 'Coco' })], new Map([['a', 400]]));

    expect(merged[0].name).toBe('Coco');
    expect(merged[0].priceCents).toBe(1000);
  });
});
