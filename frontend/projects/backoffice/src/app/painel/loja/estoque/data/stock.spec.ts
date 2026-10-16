import {
  filterRows,
  kpisOf,
  movementFromDoc,
  qtyTone,
  relativeStamp,
  rowAction,
  rowsFromProduct,
  type StockRow,
} from './stock';

const row = (over: Partial<StockRow> = {}): StockRow => ({
  productId: 'p', productName: 'Camiseta Dry', skuId: 's', skuCode: 'NX-CAM-BRANCO-M', barcode: '789',
  variantLabel: 'Branco areia · M', category: 'vestuario', imageUrl: null, byLocation: { cd: 5 }, total: 5,
  reservedByLocation: {}, reserved: 0, threshold: 3, costCents: 1000, lastCostCents: null, ...over,
});

describe('estoque · regras', () => {
  it('cores: 0 vermelho, abaixo do alerta amarelo', () => {
    expect(qtyTone(0, 3)).toBe('zero');
    expect(qtyTone(2, 3)).toBe('low');
    expect(qtyTone(3, 3)).toBe('ok');
  });

  it('Repor abaixo do alerta (ou zerado), senão Transferir', () => {
    expect(rowAction(row({ total: 2 }))).toBe('repor');
    expect(rowAction(row({ total: 0, threshold: 0 }))).toBe('repor');
    expect(rowAction(row({ total: 9 }))).toBe('transferir');
  });

  it('busca por nome, variação, SKU e código de barras', () => {
    const rows = [row(), row({ skuId: 'x', productName: 'Bola Pro', skuCode: 'NX-BOLA', barcode: '111', variantLabel: 'único' })];
    expect(filterRows(rows, { q: 'branco m', category: null, lowFirst: false }).length).toBe(1);
    expect(filterRows(rows, { q: 'nx-bola', category: null, lowFirst: false })[0]!.skuId).toBe('x');
    expect(filterRows(rows, { q: '111', category: null, lowFirst: false }).length).toBe(1);
    expect(filterRows(rows, { q: '', category: 'bolas', lowFirst: false }).length).toBe(0);
  });

  it('estoque baixo primeiro mantém a ordem dentro de cada grupo', () => {
    const rows = [row({ skuId: 'a', total: 9 }), row({ skuId: 'b', total: 1 }), row({ skuId: 'c', total: 0 })];
    expect(filterRows(rows, { q: '', category: null, lowFirst: true }).map((r) => r.skuId)).toEqual(['b', 'c', 'a']);
  });

  it('KPIs: unidades, SKUs, valor em custo e baixos', () => {
    const k = kpisOf([row({ total: 5, costCents: 1000 }), row({ total: 2, costCents: null }), row({ total: 0 })]);
    expect(k).toEqual({ units: 7, skuCount: 3, costValueCents: 5000, lowCount: 2 });
    expect(kpisOf([row({ costCents: null })]).costValueCents).toBeNull();
  });

  it('monta as linhas a partir do produto e dos SKUs', () => {
    const product = {
      name: 'Camiseta', category: 'vestuario', lowStockThreshold: 3, photos: [{ url: 'https://x/c.jpg' }],
      axes: [{ id: 'cor', values: [{ id: 'branco', label: 'Branco areia' }] }, { id: 'tam', values: [{ id: 'm', label: 'M' }] }],
    };
    const [r] = rowsFromProduct('p1', product, [
      { id: 'branco_m', data: { code: 'NX-C-BRANCO-M', axisValues: { cor: 'branco', tam: 'm' }, stockByLocation: { cd: 1, 'arena-cfc': 2 } } },
    ], { costCents: 500, skuCosts: { branco_m: 450 }, lastPurchaseCents: { branco_m: 480 } });
    expect(r!.variantLabel).toBe('Branco areia · M');
    expect(r!.total).toBe(3);
    expect(r!.imageUrl).toBe('https://x/c.jpg');
    expect(r!.costCents).toBe(450);
    expect(r!.lastCostCents).toBe(480);
    const [single] = rowsFromProduct('p2', { name: 'Bola' }, [{ id: 'unico', data: {} }], null);
    expect(single!.variantLabel).toBe('único');
    expect(single!.total).toBe(0);
  });

  it('descreve a movimentação de ajuste da tela do produto', () => {
    const m = movementFromDoc('m1', {
      type: 'ajuste', reason: 'Ajuste manual na tela do produto',
      items: [{ productName: 'Camiseta', variantLabel: 'Laranja · G', delta: -2, locationId: 'cd' }],
      createdAt: new Date(2026, 9, 16, 18, 0),
    }, (id) => (id === 'cd' ? 'CD Goiânia' : id));
    expect(m.title).toBe('Ajuste manual na tela do produto');
    expect(m.itemsLabel).toBe('−2 Camiseta Laranja · G');
    expect(m.placeLabel).toBe('CD Goiânia');
  });

  it('carimbo relativo de data', () => {
    const now = new Date(2026, 9, 16, 12, 0);
    expect(relativeStamp(new Date(2026, 9, 16, 10, 12), now)).toBe('Hoje 10:12');
    expect(relativeStamp(new Date(2026, 9, 15, 19, 44), now)).toBe('Ontem 19:44');
    expect(relativeStamp(new Date(2026, 9, 10, 8, 5), now)).toBe('10/10 08:05');
  });
});
