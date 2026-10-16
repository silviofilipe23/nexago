import {
  baseSkuFromName,
  draftErrors,
  emptyForm,
  headerStatus,
  marginOf,
  parseMoney,
  publishErrors,
  reconcileSkus,
  skusLostWithStock,
  toSaveInput,
  withTotalStock,
  type AxisForm,
  type ProductForm,
} from './product-form';

const axes: AxisForm[] = [
  { id: 'cor', label: 'Cor', values: [{ id: 'azul', label: 'Azul', hex: '' }, { id: 'preto', label: 'Preto', hex: '' }] },
  { id: 'tam', label: 'Tamanho', values: [{ id: 'p', label: 'P', hex: '' }, { id: 'm', label: 'M', hex: '' }] },
];

function valid(): ProductForm {
  return { ...emptyForm(), name: 'Camiseta Dry', baseSku: 'NX-CAMISETA-DRY', category: 'vestuario', price: '89,90' };
}

describe('product-form', () => {
  it('converte preço digitado em centavos', () => {
    expect(parseMoney('289,90')).toBe(28990);
    expect(parseMoney('1.289,90')).toBe(128990);
    expect(parseMoney('R$ 10')).toBe(1000);
    expect(parseMoney('')).toBeNull();
    expect(parseMoney('abc')).toBeNull();
  });

  it('gera a raiz do SKU a partir do nome', () => {
    expect(baseSkuFromName('Camiseta Dry Fit')).toBe('NX-CAMISETA-DRY-FIT');
    expect(baseSkuFromName('  ')).toBe('');
  });

  it('margem usa as faixas 40/20', () => {
    expect(marginOf(10000, 5000)?.tone).toBe('green');
    expect(marginOf(10000, 7000)?.tone).toBe('yellow');
    expect(marginOf(10000, 9000)?.tone).toBe('red');
    expect(marginOf(10000, null)).toBeNull();
  });

  it('rascunho só exige nome e raiz; publicar exige o resto', () => {
    expect(Object.keys(draftErrors(valid()))).toEqual([]);
    const f = { ...emptyForm(), name: 'Camiseta', baseSku: 'NX-C' };
    expect(Object.keys(publishErrors(f)).sort()).toEqual(['category', 'price']);
  });

  it('entrega exige peso e dimensões; "de" deve superar o preço', () => {
    const f = { ...valid(), fulfillment: { pickup: false, delivery: true }, compareAtPrice: '50' };
    const errors = publishErrors(f);
    expect(errors.shipping).toBeDefined();
    expect(errors.compareAtPrice).toBeDefined();
  });

  it('esgotado é calculado pelo estoque total', () => {
    expect(headerStatus({ ...valid(), status: 'ativo' })).toBe('esgotado');
    const withStock = { ...valid(), status: 'ativo' as const, skus: [withTotalStock(emptyForm().skus[0]!, 4)] };
    expect(headerStatus(withStock)).toBe('ativo');
    expect(headerStatus({ ...valid(), status: 'rascunho' })).toBe('rascunho');
  });

  it('ajuste manual mexe só no CD', () => {
    const sku = { ...emptyForm().skus[0]!, stockByLocation: { cd: 2, arena1: 3 } };
    expect(withTotalStock(sku, 10).stockByLocation).toEqual({ cd: 7, arena1: 3 });
    expect(withTotalStock(sku, 1).stockByLocation['cd']).toBe(0);
  });

  it('reconcilia SKUs ao mudar eixos e acusa perda com estoque', () => {
    const skus = reconcileSkus(axes, []);
    expect(skus.length).toBe(4);
    skus[0] = { ...skus[0]!, stockByLocation: { cd: 5 } };
    const fewer: AxisForm[] = [axes[0]!, { ...axes[1]!, values: [axes[1]!.values[1]!] }];
    expect(skusLostWithStock(fewer, skus).length).toBe(1);
    expect(reconcileSkus(fewer, skus).length).toBe(2);
  });

  it('payload converte kg em gramas e omite custo quando pedido', () => {
    const f = { ...valid(), weightKg: '0,5', lengthCm: '30', widthCm: '20', heightCm: '5', cost: '30' };
    const input = toSaveInput(f, { productId: null, version: null }, 'rascunho', { includeCost: false });
    expect(input['shipping']).toEqual({ weightGrams: 500, lengthCm: 30, widthCm: 20, heightCm: 5 });
    expect('costCents' in input).toBeFalse();
    expect(input['priceCents']).toBe(8990);
    expect('productId' in input).toBeFalse();
  });
});
