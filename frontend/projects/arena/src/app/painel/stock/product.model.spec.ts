import {
  buildProductSummary,
  formatMarginPercent,
  parseOptionalBRLInputToCents,
  productMarginRatio,
  productUnitProfitCents,
  type ArenaProduct,
} from './product.model';

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

describe('productMarginRatio', () => {
  it('calcula a margem sobre a venda', () => {
    expect(productMarginRatio(400, 1000)).toBe(0.6);
  });

  it('devolve null quando o custo não foi informado', () => {
    expect(productMarginRatio(undefined, 1000)).toBeNull();
  });

  it('devolve null quando não há preço de venda', () => {
    expect(productMarginRatio(400, 0)).toBeNull();
  });

  it('trata custo zero como custo informado, não como ausente', () => {
    expect(productMarginRatio(0, 1000)).toBe(1);
  });

  it('devolve margem negativa quando o custo passa do preço de venda', () => {
    expect(productMarginRatio(1200, 1000)).toBeCloseTo(-0.2, 10);
  });
});

describe('productUnitProfitCents', () => {
  it('devolve o lucro por unidade vendida', () => {
    expect(productUnitProfitCents(400, 1000)).toBe(600);
  });

  it('devolve null quando o custo não foi informado', () => {
    expect(productUnitProfitCents(undefined, 1000)).toBeNull();
  });

  it('devolve prejuízo por unidade quando o custo passa da venda', () => {
    expect(productUnitProfitCents(1200, 1000)).toBe(-200);
  });
});

describe('formatMarginPercent', () => {
  it('formata a razão como percentual inteiro', () => {
    expect(formatMarginPercent(0.6)).toBe('60%');
  });

  it('mostra travessão quando não há margem calculável', () => {
    expect(formatMarginPercent(null)).toBe('—');
  });

  it('formata margem negativa com sinal', () => {
    expect(formatMarginPercent(-0.2)).toBe('-20%');
  });
});

describe('buildProductSummary com custo', () => {
  it('soma custo imobilizado e lucro potencial do estoque', () => {
    const summary = buildProductSummary([
      product({ id: 'a', priceCents: 1000, costCents: 400, stockQuantity: 10 }),
      product({ id: 'b', priceCents: 500, costCents: 200, stockQuantity: 4 }),
    ]);

    expect(summary.inventoryCostCents).toBe(400 * 10 + 200 * 4);
    expect(summary.potentialProfitCents).toBe(600 * 10 + 300 * 4);
  });

  it('ignora produtos sem custo informado nos dois totais', () => {
    const summary = buildProductSummary([
      product({ id: 'a', priceCents: 1000, costCents: 400, stockQuantity: 10 }),
      product({ id: 'b', priceCents: 500, costCents: undefined, stockQuantity: 4 }),
    ]);

    expect(summary.inventoryCostCents).toBe(4000);
    expect(summary.potentialProfitCents).toBe(6000);
  });

  it('ignora produtos inativos, como já faz com o valor de venda', () => {
    const summary = buildProductSummary([
      product({ id: 'a', active: false, priceCents: 1000, costCents: 400, stockQuantity: 10 }),
    ]);

    expect(summary.inventoryCostCents).toBe(0);
    expect(summary.potentialProfitCents).toBe(0);
  });

  it('mantém o valor de venda do estoque inalterado', () => {
    const summary = buildProductSummary([product({ priceCents: 1000, costCents: 400, stockQuantity: 10 })]);

    expect(summary.inventoryValueCents).toBe(10000);
  });
});

describe('parseOptionalBRLInputToCents', () => {
  it('campo vazio é custo não informado, não zero', () => {
    expect(parseOptionalBRLInputToCents('')).toBeNull();
    expect(parseOptionalBRLInputToCents('   ')).toBeNull();
  });

  it('zero digitado é custo informado', () => {
    expect(parseOptionalBRLInputToCents('0,00')).toBe(0);
  });

  it('lê valor no formato brasileiro', () => {
    expect(parseOptionalBRLInputToCents('1.234,56')).toBe(123456);
  });
});
