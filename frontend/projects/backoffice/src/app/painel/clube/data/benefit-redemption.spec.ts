import {
  addResults,
  callableRow,
  chunk,
  detectSeparator,
  formatCents,
  importResultOf,
  parseMoneyCents,
  parseRedeemedAt,
  parseRedemptionCsv,
  previewTotals,
  redemptionFromDoc,
  sortRedemptions,
  splitCsvLine,
  EMPTY_IMPORT_RESULT,
} from './benefit-redemption';

const NOW = new Date(2026, 10, 16, 12);

describe('clube v2: resgates confirmados (CSV do parceiro)', () => {
  it('dinheiro: R$, vírgula decimal, ponto de milhar e ponto decimal', () => {
    expect(parseMoneyCents('R$ 12,50')).toBe(1250);
    expect(parseMoneyCents('1.234,56')).toBe(123456);
    expect(parseMoneyCents('12.5')).toBe(1250);
    expect(parseMoneyCents('1.234')).toBe(123400);
    expect(parseMoneyCents('8')).toBe(800);
    expect(parseMoneyCents('')).toBeNull();
    expect(parseMoneyCents('dez')).toBeNull();
    expect(parseMoneyCents('-5')).toBeNull();
  });

  it('data: dd/mm/aaaa (com hora), dd/mm/aa e ISO, no fuso local; data impossível = null', () => {
    expect(parseRedeemedAt('16/11/2026')).toBe(new Date(2026, 10, 16).getTime());
    expect(parseRedeemedAt('16/11/2026 14:30')).toBe(new Date(2026, 10, 16, 14, 30).getTime());
    expect(parseRedeemedAt('5/1/26')).toBe(new Date(2026, 0, 5).getTime());
    expect(parseRedeemedAt('2026-11-16T09:05:00')).toBe(new Date(2026, 10, 16, 9, 5).getTime());
    expect(parseRedeemedAt('31/02/2026')).toBeNull();
    expect(parseRedeemedAt('ontem')).toBeNull();
  });

  it('separador e aspas', () => {
    expect(detectSeparator('codigo;pedido;data;desconto')).toBe(';');
    expect(detectSeparator('a\tb\tc')).toBe('\t');
    expect(detectSeparator('a,b,"1,5"')).toBe(',');
    expect(splitCsvLine('NEXA-AB12;"pedido ""x"";1";16/11/2026', ';')).toEqual(['NEXA-AB12', 'pedido "x";1', '16/11/2026']);
  });

  it('pula o cabeçalho, normaliza o código e lê o valor do pedido opcional', () => {
    const csv = [
      'Código;ID do pedido;Data;Desconto;Valor do pedido',
      ' nexa-ab12 ;P-1;16/11/2026;8,29;82,90',
      'NEXA-CD34;P-2;15/11/2026 20:10;R$ 5,00;',
      '',
    ].join('\n');
    const parsed = parseRedemptionCsv(csv, NOW);
    expect(parsed.hadHeader).toBeTrue();
    expect(parsed.errors).toEqual([]);
    expect(parsed.rows).toEqual([
      { line: 2, code: 'NEXA-AB12', externalId: 'P-1', redeemedAt: new Date(2026, 10, 16).getTime(), discountCents: 829, orderCents: 8290 },
      { line: 3, code: 'NEXA-CD34', externalId: 'P-2', redeemedAt: new Date(2026, 10, 15, 20, 10).getTime(), discountCents: 500, orderCents: null },
    ]);
    expect(previewTotals(parsed.rows)).toEqual({ count: 2, discountCents: 1329 });
  });

  it('erros por linha, com o número da linha no arquivo', () => {
    const csv = [
      'NEXA-AB12;P-1;16/11/2026;8,29',
      ';P-2;16/11/2026;1',
      'NEXA AB;P-3;16/11/2026;1',
      'NEXA-AB12;;16/11/2026;1',
      'NEXA-AB12;P-4;32/11/2026;1',
      'NEXA-AB12;P-5;16/11/2027;1',
      'NEXA-AB12;P-6;16/11/2026;0',
      'NEXA-AB12;P-7;16/11/2026;10;5',
      'NEXA-AB12;P-1;16/11/2026;3',
      'NEXA-AB12;__x;16/11/2026;3',
      'NEXA-AB12;P-8;16/11/2020;3',
    ].join('\r\n');
    const parsed = parseRedemptionCsv(csv, NOW);
    expect(parsed.hadHeader).toBeFalse();
    expect(parsed.rows.map((r) => r.externalId)).toEqual(['P-1']);
    const byLine = new Map(parsed.errors.map((e) => [e.line, e.message]));
    expect(byLine.get(2)).toBe('Falta o código.');
    expect(byLine.get(3)).toContain('inválido');
    expect(byLine.get(4)).toBe('Falta o id do pedido.');
    expect(byLine.get(5)).toContain('Data');
    expect(byLine.get(6)).toBe('Data no futuro.');
    expect(byLine.get(7)).toContain('Desconto');
    expect(byLine.get(8)).toContain('maior que o valor');
    expect(byLine.get(9)).toContain('repetido (já está na linha 1)');
    expect(byLine.get(10)).toContain('__');
    expect(byLine.get(11)).toContain('2025');
  });

  it('linha para a callable, lotes e soma dos resultados', () => {
    const [row] = parseRedemptionCsv('NEXA-AB12;P-1;16/11/2026;8,29', NOW).rows;
    expect(callableRow(row!)).toEqual({
      code: 'NEXA-AB12',
      externalId: 'P-1',
      redeemedAt: new Date(2026, 10, 16).toISOString(),
      discountCents: 829,
    });
    // Formato que a callable aceita (ISO com fuso).
    expect(callableRow(row!).redeemedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    expect(Object.keys(callableRow({ ...row!, orderCents: 1000 }))).toContain('orderCents');
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    const total = addResults(importResultOf({ matched: 2, ambiguous: 1, unmatched: 0, duplicates: 3 }), importResultOf({ matched: 1, x: 'y' }));
    expect(total).toEqual({ matched: 3, ambiguous: 1, unmatched: 0, duplicates: 3 });
    expect(importResultOf(null)).toEqual(EMPTY_IMPORT_RESULT);
  });

  it('lê o doc gravado sem quebrar e ordena pelo pedido mais recente', () => {
    const a = redemptionFromDoc('fast_P-1', { partnerId: 'fast', externalId: 'P-1', code: 'NEXA-AB12', uid: 'u1', status: 'matched', discountCents: 829, redeemedAt: { toDate: () => new Date(2026, 10, 1) } });
    const b = redemptionFromDoc('fast_P-2', { status: 'estranho', redeemedAt: new Date(2026, 10, 10) });
    expect(a.status).toBe('matched');
    expect(a.orderCents).toBeNull();
    expect(b.status).toBe('unmatched');
    expect(b.uid).toBeNull();
    expect(sortRedemptions([a, b]).map((r) => r.id)).toEqual(['fast_P-2', 'fast_P-1']);
    expect(formatCents(829).replace(/\s/g, ' ')).toBe('R$ 8,29');
  });
});
