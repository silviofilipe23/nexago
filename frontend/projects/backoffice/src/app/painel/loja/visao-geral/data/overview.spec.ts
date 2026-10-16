import { orderFromDoc } from '../../pedidos/data/order';
import { alertsOf, channelSplit, dailyBars, deltaPct, kpisOf, previousRange, rangeLabel, rangeOf, salesIn, topProducts, transferLate } from './overview';

const NOW = new Date('2026-10-16T18:00:00Z'); // 15h em SP

const sale = (id: string, paidAt: string, over: Record<string, unknown> = {}) =>
  orderFromDoc(id, {
    number: id, status: 'rtd', channel: 'web', totalCents: 10000, paidAt: new Date(paidAt), createdAt: new Date(paidAt),
    delivery: { type: 'arena' }, items: [{ productId: 'bola', productName: 'Bola', qty: 1, totalCents: 10000 }], ...over,
  });

describe('visão geral · cálculos', () => {
  it('30 dias terminam hoje; o anterior tem a mesma duração', () => {
    const r = rangeOf('30d', NOW);
    expect(r.days.length).toBe(30);
    expect(r.days[0]).toBe('2026-09-17');
    expect(r.days.at(-1)).toBe('2026-10-16');
    expect(rangeLabel(r)).toBe('17 set – 16 out');
    expect(r.start.toISOString()).toBe('2026-09-17T03:00:00.000Z');
    const p = previousRange(r);
    expect(p.end).toEqual(r.start);
    expect(p.end.getTime() - p.start.getTime()).toBe(r.end.getTime() - r.start.getTime());
    expect(rangeOf('mes', NOW).days[0]).toBe('2026-10-01');
    expect(rangeOf('hoje', NOW).days).toEqual(['2026-10-16']);
    expect(rangeOf('custom', NOW, { from: '2026-10-10', to: '2026-10-05' }).days.length).toBe(6);
  });

  it('vendas excluem pendentes e cancelados; receita desconta reembolso', () => {
    const r = rangeOf('7d', NOW);
    const list = [
      sale('a', '2026-10-15T15:00:00Z'),
      sale('b', '2026-10-16T12:00:00Z', { channel: 'app_ios', refundedCents: 2000, delivery: { type: 'casa' } }),
      sale('c', '2026-10-16T12:00:00Z', { status: 'can' }),
      sale('d', '2026-10-16T12:00:00Z', { status: 'pag', paidAt: null }),
      sale('e', '2026-09-01T12:00:00Z'),
    ];
    const s = salesIn(list, r);
    expect(s.map((o) => o.id)).toEqual(['a', 'b']);
    const k = kpisOf(s);
    expect(k).toEqual({ revenueCents: 18000, orders: 2, ticketCents: 9000, pickupPct: 50 });
    expect(channelSplit(s)).toEqual({ web: 56, app: 44 });
    const bars = dailyBars(s, r);
    expect(bars.length).toBe(7);
    expect(bars.at(-1)).toEqual({ day: '2026-10-16', revenueCents: 8000, orders: 1 });
    expect(topProducts(s)[0]).toEqual(jasmine.objectContaining({ productId: 'bola', units: 2 }));
  });

  it('variação só com base', () => {
    expect(deltaPct(118, 100)).toBe(18);
    expect(deltaPct(5, 0)).toBeNull();
    expect(deltaPct(null, 3)).toBeNull();
  });

  it('alertas: só os que têm N > 0, na ordem do desenho', () => {
    const late = sale('x', '2026-10-15T12:00:00Z', { status: 'sep' });
    const fresh = sale('y', '2026-10-16T17:00:00Z', { status: 'sep' });
    const alerts = alertsOf({
      lowStock: [{ productName: 'Camiseta', variantLabel: 'Branco · M' }, { productName: 'Camiseta', variantLabel: 'Branco · G' }, { productName: 'Bola Pro', variantLabel: 'único' }],
      toPick: [late, fresh], handlingHours: 24,
      returnsToReview: [{ reasonLabel: 'Tamanho errado' }, { reasonLabel: 'Defeito' }],
      lateTransfers: [{ id: 't', code: 'TR-118', arenaName: 'Arena CFC', orders: 6 }],
      now: NOW,
    });
    expect(alerts.map((a) => a.id)).toEqual(['estoque', 'separacao', 'trocas', 'remessa']);
    expect(alerts[0]!.title).toBe('3 SKUs com estoque baixo');
    expect(alerts[0]!.detail).toBe('Camiseta M e G · Bola Pro');
    expect(alerts[1]!.title).toBe('1 pedido pago há mais de 24 h');
    expect(alerts[3]!.detail).toBe('Remessa TR-118 · 6 pedidos');
    expect(alertsOf({ lowStock: [], toPick: [], handlingHours: 24, returnsToReview: [], lateTransfers: [], now: NOW })).toEqual([]);
  });

  it('remessa atrasada pela chegada prevista (parede de SP)', () => {
    expect(transferLate('2026-10-16T14:00', NOW)).toBeTrue();
    expect(transferLate('2026-10-16T16:00', NOW)).toBeFalse();
    expect(transferLate('2026-10-16', NOW)).toBeFalse();
    expect(transferLate('', NOW)).toBeFalse();
  });
});
