import { billingSummary, buildBillingRows, centersFromRaw, paymentsFromRaw, shortDate } from './training-billing';

const centers = centersFromRaw({
  centers: [
    {
      centerId: 'ct1',
      name: 'CT Areia Alta',
      enrollments: [{ className: 'Performance', planName: 'Mensal', priceCents: 48000, billing: { billingDay: 5, method: 'pix_manual' } }],
      invoices: [
        { invoiceId: 'i1', reference: 'Novembro', amountCents: 48000, dueDate: '2026-11-05', status: 'pending', payUrl: 'https://asaas/i/1' },
        { invoiceId: 'i0', reference: 'Outubro', amountCents: 48000, dueDate: '2026-10-05', status: 'approved', paidOn: '2026-10-03', method: 'pix' },
        { invoiceId: 'ix', reference: 'Setembro', amountCents: 48000, dueDate: '2026-09-05', status: 'refunded' },
      ],
    },
  ],
});
const payments = paymentsFromRaw({
  payments: [
    { source: 'professor', chargeId: 'p1', payee: 'Prof. Thiago', description: 'Pacote 8 aulas', amountReais: 640, paidOn: '2026-10-01', method: 'Pix' },
    { source: 'arena', chargeId: 'a1', payee: 'Arena CFC', description: 'Trimestral', amountReais: 1140, paidOn: '2026-10-15', method: 'Cartão' },
  ],
});
const charges = [
  {
    chargeId: 'c1', arenaId: 'a1', arenaName: 'Arena CFC', description: 'Mensal 2x · Novembro', amountReais: 180, dueDate: '2026-10-20',
    overdue: true, payment: 'manual' as const, invoiceUrl: null,
  },
];

describe('Mensalidades (web)', () => {
  it('junta as três origens: em aberto (vence antes) e depois as pagas (recentes)', () => {
    const rows = buildBillingRows(centers, charges, payments, '2026-10-22');
    expect(rows.map((r) => r.key)).toEqual(['ar:c1', 'ct:ct1:i1', 'arena:a1', 'ct:ct1:i0', 'professor:p1']);
    expect(rows[0]!.status).toBe('late');
    expect(rows[0]!.action).toBeNull();
    expect(rows[0]!.info).toBe('Pague direto à arena');
    expect(rows[1]!.action).toEqual({ kind: 'center', centerId: 'ct1', invoiceId: 'i1' });
    expect(rows.find((r) => r.key === 'professor:p1')!.origin).toBe('private');
  });

  it('resumo: em aberto, pago no ano e a recorrência do centro', () => {
    const rows = buildBillingRows(centers, charges, payments, '2026-10-22');
    const s = billingSummary(rows, centers, '2026-10-22');
    expect(s.openCents).toBe(48000 + 18000);
    expect(s.openCount).toBe(2);
    expect(s.nextDue).toBe('2026-10-20');
    expect(s.paidYearCents).toBe(48000 + 64000 + 114000);
    expect(s.recurring).toEqual({ name: 'CT Areia Alta', line: 'Pix · todo dia 05' });
  });

  it('datas curtas', () => {
    expect(shortDate('2026-11-05')).toBe('05 nov');
    expect(shortDate(null)).toBe('—');
  });
});
