import { STORE_PRODUCTS } from './products.mock';
import { ProductsRepository } from './products.repository';

describe('dados de exemplo da loja', () => {
  it('tem os 8 produtos do desenho, com SKU único', () => {
    expect(STORE_PRODUCTS.length).toBe(8);
    expect(new Set(STORE_PRODUCTS.map((p) => p.sku)).size).toBe(8);
    expect(new Set(STORE_PRODUCTS.map((p) => p.id)).size).toBe(8);
  });

  it('soma 31 SKUs, 7 ativos e 1 esgotado', () => {
    expect(STORE_PRODUCTS.reduce((t, p) => t + p.variations, 0)).toBe(31);
    expect(STORE_PRODUCTS.filter((p) => p.active).length).toBe(7);
    expect(STORE_PRODUCTS.filter((p) => p.stock === 0).length).toBe(1);
    expect(STORE_PRODUCTS.filter((p) => p.status === 'rascunho').length).toBe(0);
  });

  it('entrega cópias, para a tela não escrever no módulo', async () => {
    const repo = new ProductsRepository();
    const first = await repo.list();
    first[0]!.active = !first[0]!.active;
    const second = await repo.list();
    expect(second[0]!.active).toBe(STORE_PRODUCTS[0]!.active);
  });
});
