import type { StockRow } from '../../estoque/data/stock';
import {
  DEFAULT_RETURNS_CONFIG,
  approveLabel,
  daysSinceDelivery,
  itemVariantLabel,
  newVariantStock,
  returnFromDoc,
  rowsForTab,
  tabCounts,
  windowCheck,
  type ReturnRequest,
} from './returns';

const base = (over: Record<string, unknown> = {}) =>
  returnFromDoc('r1', {
    code: 'TC-031', status: 'analisar', version: 1, customer: { name: 'Juliana Prado' },
    item: { productId: 'p', skuId: 'laranja_p', skuCode: 'NX-CAM-LARANJA-P', productName: 'Camiseta', variantLabel: 'Laranja · P' },
    newItem: { productId: 'p', skuId: 'laranja_m', skuCode: 'NX-CAM-LARANJA-M', productName: 'Camiseta', variantLabel: 'Laranja · M' },
    reason: 'tamanho', resolution: 'troca', deliveredAt: '2026-10-05',
    returnMethod: { type: 'arena', locationId: 'arena-errejota', costCents: 0, paidBy: 'cliente' },
    createdAt: new Date(2026, 9, 14), ...over,
  });

describe('trocas · regras da tela', () => {
  it('abas: contagem e ordem (fila na análise, recentes nas demais)', () => {
    const list: ReturnRequest[] = [
      base({ code: 'A', createdAt: new Date(2026, 9, 10) }),
      base({ code: 'B', createdAt: new Date(2026, 9, 12) }),
      base({ code: 'C', status: 'em_transito' }),
      base({ code: 'D', status: 'aprovada' }),
      base({ code: 'E', status: 'concluida', createdAt: new Date(2026, 9, 1) }),
      base({ code: 'F', status: 'concluida', createdAt: new Date(2026, 9, 9) }),
    ];
    expect(tabCounts(list)).toEqual({ analisar: 2, aguardando: 2, concluidas: 2, recusadas: 0 });
    expect(rowsForTab(list, 'analisar').map((r) => r.code)).toEqual(['A', 'B']);
    expect(rowsForTab(list, 'concluidas').map((r) => r.code)).toEqual(['F', 'E']);
  });

  it('variação da troca: "Laranja · P → M"', () => {
    expect(itemVariantLabel(base())).toBe('Laranja · P → M');
    expect(itemVariantLabel(base({ resolution: 'reembolso', newItem: null }))).toBe('Laranja · P');
  });

  it('prazo: dentro/fora pelo dia desde a entrega', () => {
    const now = new Date(2026, 9, 16);
    expect(daysSinceDelivery('2026-10-05', now)).toBe(12);
    expect(windowCheck(base(), now, DEFAULT_RETURNS_CONFIG)).toEqual({ ok: true, label: 'Dentro (dia 12)' });
    expect(windowCheck(base({ deliveredAt: '2026-09-01' }), now, DEFAULT_RETURNS_CONFIG).ok).toBeFalse();
  });

  it('rótulo do aprovar segue a resolução e o local', () => {
    const r = base();
    expect(approveLabel('troca', r.returnMethod)).toBe('Aprovar troca na arena');
    expect(approveLabel('troca', { ...r.returnMethod, type: 'correios' })).toBe('Aprovar troca');
    expect(approveLabel('reenvio', r.returnMethod)).toBe('Aprovar reenvio');
  });

  it('estoque da variação nova no local da devolução', () => {
    const row = { productId: 'p', skuId: 'laranja_m', total: 7, byLocation: { cd: 5, 'arena-errejota': 2 }, reservedByLocation: { 'arena-errejota': 1 } } as unknown as StockRow;
    expect(newVariantStock(base(), [row])).toEqual({ total: 7, atReturn: 2, available: 1 });
    expect(newVariantStock(base({ resolution: 'saldo' }), [row])).toBeNull();
  });
});
