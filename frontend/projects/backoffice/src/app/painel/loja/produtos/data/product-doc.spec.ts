import { storeProductFromDoc, type StoreProductDoc } from './product-doc';

function doc(over: Partial<StoreProductDoc> = {}): StoreProductDoc {
  return {
    name: 'Camiseta Dry UV50 Areia',
    baseSku: 'NX-CAM',
    barcodes: ['7891000200017'],
    category: 'vestuario',
    collection: 'verao-2026',
    skuCount: 15,
    priceCents: 12990,
    compareAtPriceCents: null,
    stockTotal: 45,
    lowStockThreshold: 10,
    soldLast30: 51,
    channels: { app: true, web: true },
    status: 'ativo',
    active: true,
    photos: [],
    ...over,
  };
}

describe('storeProductFromDoc', () => {
  it('leva o documento para a forma que a tela consome', () => {
    const p = storeProductFromDoc('p-camiseta', doc());
    expect(p.id).toBe('p-camiseta');
    expect(p.name).toBe('Camiseta Dry UV50 Areia');
    expect(p.sku).toBe('NX-CAM');
    expect(p.category).toBe('vestuario');
    expect(p.priceCents).toBe(12990);
    expect(p.active).toBeTrue();
  });

  it('skuCount e stockTotal vão para variações e estoque', () => {
    const p = storeProductFromDoc('p1', doc({ skuCount: 15, stockTotal: 45 }));
    expect(p.skuCount).toBe(15);
    expect(p.stock).toBe(45);
  });

  it('o canal vira lista, na ordem que a tela desenha', () => {
    expect(storeProductFromDoc('p1', doc()).channels).toEqual(['web', 'app']);
    expect(storeProductFromDoc('p1', doc({ channels: { app: true, web: false } })).channels).toEqual([
      'app',
    ]);
    expect(storeProductFromDoc('p1', doc({ channels: { app: false, web: false } })).channels).toEqual(
      [],
    );
  });

  it('coleção singular do documento vira a lista que o filtro usa', () => {
    expect(storeProductFromDoc('p1', doc()).collections).toEqual(['verao-2026']);
    expect(storeProductFromDoc('p1', doc({ collection: null })).collections).toEqual([]);
  });

  it('a capa é a primeira foto, e sem foto é nulo', () => {
    expect(storeProductFromDoc('p1', doc()).imageUrl).toBeNull();
    const comFoto = doc({ photos: [{ id: 'f1', url: 'https://x/1.jpg' }] });
    expect(storeProductFromDoc('p1', comFoto).imageUrl).toBe('https://x/1.jpg');
  });

  it('documento sem os campos opcionais não quebra a tela', () => {
    const magro = { name: 'Bola', baseSku: 'NX-BOL' } as unknown as StoreProductDoc;
    const p = storeProductFromDoc('p1', magro);
    expect(p.skuCount).toBe(0);
    expect(p.stock).toBe(0);
    expect(p.barcodes).toEqual([]);
    expect(p.collections).toEqual([]);
    expect(p.channels).toEqual([]);
    expect(p.status).toBe('rascunho');
    expect(p.active).toBeFalse();
    expect(p.compareAtPriceCents).toBeNull();
  });

  it('leva os códigos de barras, que é o que a busca da tela casa', () => {
    expect(storeProductFromDoc('p1', doc()).barcodes).toEqual(['7891000200017']);
  });
});
