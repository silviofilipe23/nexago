import {
  applyFilters,
  applyTab,
  commissionFromDoc,
  commissionsCsv,
  dayMonth,
  kpisOf,
  openPayoutDate,
  payoutCutoff,
  periodLabel,
  periodRange,
  planPayout,
  statusLabel,
  tabCounts,
  whenLabel,
  type Commission,
} from './commission';

const NOW = new Date('2026-10-17T17:12:00Z'); // 14:12 em SP
const RELEASED = new Date('2026-10-15T15:00:00Z');

function c(id: string, over: Partial<Commission> = {}): Commission {
  return {
    ...commissionFromDoc(id, {
      ambassadorId: 'jv',
      ambassadorName: 'João Victor',
      convertedLabel: 'Lucas M.',
      origin: 'code',
      netCents: 120_00,
      pct: 10,
      amountCents: 12_00,
      status: 'released',
      registeredAt: RELEASED,
      releasedAt: RELEASED,
    }),
    ...over,
  };
}

describe('commission', () => {
  it('lê o doc com padrões seguros', () => {
    const doc = commissionFromDoc('x', { status: 'weird', origin: 'fax', convertedAthleteIds: ['a', 'b', 'c', 'd'] });
    expect(doc.status).toBe('pending');
    expect(doc.origin).toBe('code');
    expect(doc.convertedCount).toBe(4);
    expect(doc.hold).toBeNull();
  });

  it('coluna Data: "Hoje 14:12", "Ontem" e "13 out"', () => {
    expect(whenLabel(NOW, NOW)).toBe('Hoje 14:12');
    expect(whenLabel(new Date('2026-10-16T22:00:00Z'), NOW)).toBe('Ontem');
    expect(whenLabel(new Date('2026-10-13T15:00:00Z'), NOW)).toBe('13 out');
    expect(dayMonth(new Date('2026-10-06T15:00:00Z'))).toBe('06 out');
  });

  it('status com o motivo do cancelamento', () => {
    expect(statusLabel({ status: 'canceled', cancelReason: 'refund' })).toBe('Cancelada · reembolso');
    expect(statusLabel({ status: 'pending', cancelReason: null })).toBe('Aguardando pgto');
  });

  it('período do mês em instantes de SP; piloto sem limite', () => {
    const { start, end } = periodRange({ kind: 'month', key: '2026-10' });
    expect(start!.toISOString()).toBe('2026-10-01T03:00:00.000Z');
    expect(end!.toISOString()).toBe('2026-11-01T03:00:00.000Z');
    expect(periodRange({ kind: 'pilot' })).toEqual({ start: null, end: null });
    const custom = periodRange({ kind: 'custom', from: '2026-10-01', to: '2026-10-15' });
    expect(custom.end!.toISOString()).toBe('2026-10-16T03:00:00.000Z');
    expect(periodLabel({ kind: 'month', key: '2026-10' })).toBe('Outubro');
  });

  it('abas contam o que os chips deixam passar', () => {
    const list = [c('a'), c('b', { status: 'pending' }), c('c', { origin: 'qr', status: 'paid' })];
    const filtered = applyFilters(list, { ambassadorIds: [], origins: ['code'] });
    expect(tabCounts(filtered)).toEqual({ all: 2, pending: 1, released: 1, paid: 0, canceled: 0 });
    expect(applyTab(list, 'paid').map((x) => x.id)).toEqual(['c']);
  });

  it('KPIs somam por status e contam embaixadores e reembolsos', () => {
    const k = kpisOf([
      c('a'),
      c('b', { ambassadorId: 'rb', amountCents: 21_00 }),
      c('c', { status: 'canceled', cancelReason: 'refund', amountCents: 10_00 }),
      c('d', { status: 'canceled', cancelReason: 'manual', amountCents: 5_00 }),
    ]);
    expect(k.releasedCents).toBe(33_00);
    expect(k.releasedAmbassadors).toBe(2);
    expect(k.canceledCents).toBe(15_00);
    expect(k.refundCount).toBe(1);
  });

  describe('repasse (espelho de functions/src/squad-commissions.ts)', () => {
    it('repasse em aberto e fechamento', () => {
      expect(openPayoutDate('2026-10-17', '2026-10-06', [6, 20])).toBe('2026-10-20');
      expect(openPayoutDate('2026-10-25', '2026-10-06', [6, 20])).toBe('2026-10-20');
      expect(openPayoutDate('2026-10-21', '2026-10-20', [6, 20])).toBe('2026-11-06');
      expect(payoutCutoff('2026-10-20').toISOString()).toBe('2026-10-20T03:00:00.000Z');
    });

    it('agrupa, acumula abaixo do mínimo, desconta ajuste e respeita retenção do ciclo', () => {
      const rows = planPayout({
        payoutDate: '2026-10-20',
        cutoff: payoutCutoff('2026-10-20'),
        minNetCents: 20_00,
        commissions: [
          c('a', { amountCents: 14_00 }),
          c('b', { amountCents: 12_00 }),
          c('c', { ambassadorId: 'ac', ambassadorName: 'Ana Clara', amountCents: 6_00 }),
          c('d', { ambassadorId: 'rb', ambassadorName: 'Rayssa', amountCents: 30_00, hold: { payoutDate: '2026-10-20', reason: 'Pausado', by: null } }),
          c('e', { ambassadorId: 'mr', ambassadorName: 'Marcos', amountCents: 60_00 }),
          c('f', { status: 'pending', releasedAt: null }),
          c('g', { releasedAt: new Date('2026-10-20T03:00:00Z') }),
        ],
        adjustments: [{ id: 'adj', ambassadorId: 'mr', ambassadorName: 'Marcos', amountCents: -10_00 }],
      });
      expect(rows.map((r) => [r.ambassadorId, r.netCents, r.status])).toEqual([
        ['ac', 6_00, 'accumulating'],
        ['jv', 26_00, 'included'],
        ['mr', 50_00, 'included'],
        ['rb', 0, 'held'],
      ]);
      expect(rows.find((r) => r.ambassadorId === 'rb')!.holdReason).toBe('Pausado');
    });
  });

  it('CSV nas colunas do spec, com ; e aspas quando precisa', () => {
    const csv = commissionsCsv([
      c('a', { tournamentName: 'Copa; Outubro', paymentId: 'pay_1', grossCents: 126_32, feeCents: 6_32, payoutId: '2026-10-06', status: 'paid' }),
    ]);
    const [head, line] = csv.split('\n');
    expect(head!.split(';').length).toBe(18);
    expect(head).toContain('payment_id');
    expect(line).toContain('"Copa; Outubro"');
    expect(line).toContain('126,32;6,32;120,00;10;12,00;Paga;;2026-10-06;06/10/2026');
  });
});
