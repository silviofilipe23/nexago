import {
  addLine,
  costAlert,
  entryErrors,
  entryTotals,
  matchNfeItems,
  newEntryForm,
  parseNfeXml,
  toEntryInput,
} from './entry-form';
import type { StockRow } from './stock';
import {
  addTransferLine,
  fillSuggested,
  formatStamp,
  lowAfter,
  newTransferForm,
  suggestedQty,
  transferErrors,
  transferTotals,
} from './transfer-form';

const row = (over: Partial<StockRow> = {}): StockRow => ({
  productId: 'p', productName: 'Óculos', skuId: 'unico', skuCode: 'NX-OCU-FUM', barcode: '7891234567890',
  variantLabel: 'Fumê · único', category: 'acessorios', imageUrl: null, byLocation: { cd: 22, 'arena-cfc': 3 },
  total: 25, reservedByLocation: {}, reserved: 0, threshold: 3, costCents: 5780, lastCostCents: 5790, ...over,
});

describe('06a · entrada', () => {
  it('adicionar o mesmo SKU soma; custo padrão é a última compra', () => {
    let lines = addLine([], row(), 1);
    lines = addLine(lines, row(), 1);
    expect(lines.length).toBe(1);
    expect(lines[0]!.qty).toBe(2);
    expect(lines[0]!.unitCostCents).toBe(5790);
  });

  it('totais com frete só na compra', () => {
    const f = { ...newEntryForm('e1', 'cd'), freightCents: 8500, lines: [{ key: 'p/unico', productId: 'p', skuId: 'unico', qty: 40, unitCostCents: 6250 }] };
    expect(entryTotals(f)).toEqual({ skus: 1, units: 40, itemsCents: 250000, totalCents: 258500 });
    expect(entryTotals({ ...f, subtype: 'producao' }).totalCents).toBe(250000);
    expect(toEntryInput({ ...f, subtype: 'ajuste' }).freightCents).toBe(0);
  });

  it('alerta acima de 5% da última compra', () => {
    const line = { key: 'k', productId: 'p', skuId: 's', qty: 1, unitCostCents: 6250 };
    expect(Math.round(costAlert(line, row())!)).toBe(8);
    expect(costAlert({ ...line, unitCostCents: 5900 }, row())).toBeNull();
    expect(costAlert(line, row({ lastCostCents: null }))).toBeNull();
  });

  it('obrigatórios mudam com a origem da entrada', () => {
    const f = newEntryForm('e1', 'cd');
    expect(Object.keys(entryErrors(f)).sort()).toEqual(['lines', 'nfNumber', 'supplier']);
    expect(Object.keys(entryErrors({ ...f, subtype: 'ajuste' })).sort()).toEqual(['lines', 'reason']);
    expect(Object.keys(entryErrors({ ...f, subtype: 'producao' }))).toEqual(['lines']);
    const neg = { ...f, subtype: 'ajuste' as const, reason: 'Inventário', lines: [{ key: 'k', productId: 'p', skuId: 's', qty: -2, unitCostCents: 0 }] };
    expect(entryErrors(neg)).toEqual({});
    expect(entryErrors({ ...neg, subtype: 'producao' }).lines).toBe('Quantidade mínima é 1.');
  });

  it('lê o XML da NF-e e casa por EAN ou código', () => {
    const xml = `<?xml version="1.0"?><nfeProc xmlns="http://www.portalfiscal.inf.br/nfe"><NFe><infNFe>
      <ide><nNF>8812</nNF><dhEmi>2026-10-15T09:00:00-03:00</dhEmi></ide>
      <emit><xNome>Sunline Oculos Esportivos Ltda</xNome></emit>
      <det nItem="1"><prod><cProd>OCU-01</cProd><cEAN>7891234567890</cEAN><xProd>Oculos fume</xProd><qCom>40.0000</qCom><vUnCom>62.5000000000</vUnCom></prod></det>
      <det nItem="2"><prod><cProd>XYZ</cProd><cEAN>SEM GTIN</cEAN><xProd>Estojo</xProd><qCom>5</qCom><vUnCom>3.10</vUnCom></prod></det>
      <total><ICMSTot><vFrete>85.00</vFrete></ICMSTot></total>
    </infNFe></NFe></nfeProc>`;
    const nfe = parseNfeXml(xml)!;
    expect(nfe.supplier).toBe('Sunline Oculos Esportivos Ltda');
    expect(nfe.nfNumber).toBe('8812');
    expect(nfe.issuedAt).toBe('2026-10-15');
    expect(nfe.freightCents).toBe(8500);
    expect(nfe.items[0]).toEqual({ code: 'OCU-01', ean: '7891234567890', name: 'Oculos fume', qty: 40, unitCostCents: 6250 });
    expect(nfe.items[1]!.ean).toBe('');
    const { matched, unmatched } = matchNfeItems(nfe.items, [row()]);
    expect(matched.length).toBe(1);
    expect(unmatched.map((i) => i.name)).toEqual(['Estojo']);
    expect(parseNfeXml('<nada/>')).toBeNull();
    expect(parseNfeXml('não é xml')).toBeNull();
  });
});

describe('06b · transferência', () => {
  const form = { ...newTransferForm('cd', 'arena-cfc') };

  it('sugerido sem giro repõe até o alerta e respeita o disponível', () => {
    expect(suggestedQty(row({ byLocation: { cd: 22, 'arena-cfc': 1 } }), form)).toBe(2);
    expect(suggestedQty(row({ byLocation: { cd: 22, 'arena-cfc': 9 } }), form)).toBe(0);
    expect(suggestedQty(row({ byLocation: { cd: 1, 'arena-cfc': 0 } }), form)).toBe(1);
    expect(suggestedQty(row({ byLocation: { cd: 22, 'arena-cfc': 0 } }), form, 1)).toBe(14);
    expect(suggestedQty(row({ byLocation: { cd: 10, 'arena-cfc': 0 }, reservedByLocation: { cd: 8 } }), form)).toBe(2);
  });

  it('preencher com sugerido, totais e alerta de origem baixa', () => {
    const r = row({ byLocation: { cd: 4, 'arena-cfc': 0 }, costCents: 1000 });
    const rowOf = () => r;
    const f = { ...form, lines: addTransferLine([], r) };
    const filled = { ...f, lines: fillSuggested(f, rowOf) };
    expect(filled.lines[0]!.qty).toBe(3);
    expect(transferTotals(filled, rowOf)).toEqual({ skus: 1, units: 3, costCents: 3000 });
    expect(lowAfter(filled, rowOf).map((x) => x.after)).toEqual([1]);
  });

  it('valida origem ≠ destino e o máximo disponível ao criar', () => {
    const r = row({ byLocation: { cd: 2 } });
    const f = { ...form, lines: [{ key: 'p/unico', productId: 'p', skuId: 'unico', qty: 5 }] };
    expect(transferErrors(f, () => r, true).lines).toContain('acima do disponível');
    expect(transferErrors(f, () => r, false).lines).toBeUndefined();
    expect(transferErrors({ ...f, toLocationId: 'cd' }, () => r, false).toLocationId).toBe('Destino igual à origem.');
    expect(transferErrors({ ...form }, () => r, true).lines).toContain('Adicione SKUs');
  });

  it('data e hora curtas', () => {
    expect(formatStamp('2026-10-17T08:00')).toBe('17/10 · 08:00');
    expect(formatStamp('')).toBe('');
  });
});
