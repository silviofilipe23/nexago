import { STORE_PRODUCTS } from './products.mock';

describe('dados de exemplo da loja', () => {
  it('tem os 8 produtos do desenho, com SKU único', () => {
    expect(STORE_PRODUCTS.length).toBe(8);
    expect(new Set(STORE_PRODUCTS.map((p) => p.sku)).size).toBe(8);
    expect(new Set(STORE_PRODUCTS.map((p) => p.id)).size).toBe(8);
  });

  it('soma 22 SKUs, 7 ativos e 1 esgotado', () => {
    expect(STORE_PRODUCTS.reduce((t, p) => t + p.skuCount, 0)).toBe(22);
    expect(STORE_PRODUCTS.filter((p) => p.active).length).toBe(7);
    expect(STORE_PRODUCTS.filter((p) => p.stock === 0).length).toBe(1);
    expect(STORE_PRODUCTS.filter((p) => p.status === 'rascunho').length).toBe(0);
  });

});
