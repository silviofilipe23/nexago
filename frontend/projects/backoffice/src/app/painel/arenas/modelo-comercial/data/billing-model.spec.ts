import {
  DEFAULT_BILLING_MODEL,
  EMPTY_ACTIVITY,
  appendTier,
  cloneModel,
  computeMonthBilling,
  modelFrom,
  modelIssues,
  monthLabel,
  tierRangeLabel,
  type BillingModel,
} from './billing-model';

// Mesmos casos de `functions/src/arena-billing-model.test.ts`: o espelho tem de bater com o servidor.
const MODEL: BillingModel = {
  effectiveFrom: '2027-01',
  newArenaFreeMonths: 3,
  tiers: [
    { minBookings: 0, monthlyFeeCents: 19900, commissionPercent: 10 },
    { minBookings: 40, monthlyFeeCents: 0, commissionPercent: 8 },
    { minBookings: 120, monthlyFeeCents: 0, commissionPercent: 5.5 },
  ],
};

function edit(fn: (m: BillingModel) => void): BillingModel {
  const m = cloneModel(MODEL);
  fn(m);
  return m;
}

describe('billing-model (espelho do servidor)', () => {
  it('abaixo do mínimo: mensalidade + comissão da 1ª faixa', () => {
    const r = computeMonthBilling(MODEL, '2027-03', { ...EMPTY_ACTIVITY, paidBookings: 12, bookingVolumeCents: 120000 });
    expect(r.tierIndex).toBe(0);
    expect(r.totalCents).toBe(31900);
    expect(r.dueCents).toBe(31900);
    expect(r.next?.bookingsMissing).toBe(28);
  });

  it('no mínimo: sem mensalidade e comissão menor', () => {
    const r = computeMonthBilling(MODEL, '2027-03', { ...EMPTY_ACTIVITY, paidBookings: 40, bookingVolumeCents: 400000 });
    expect(r.tierIndex).toBe(1);
    expect(r.totalCents).toBe(32000);
  });

  it('antes da vigência é implantação; arena nova ganha meses grátis', () => {
    const before = computeMonthBilling(MODEL, '2026-11', { ...EMPTY_ACTIVITY, paidBookings: 12, bookingVolumeCents: 120000 });
    expect(before.billable).toBeFalse();
    expect(before.freeReason).toBe('implantation');
    expect(before.dueCents).toBe(0);
    const fresh = computeMonthBilling(MODEL, '2027-07', EMPTY_ACTIVITY, '2027-05');
    expect(fresh.freeReason).toBe('new_arena');
    expect(computeMonthBilling(MODEL, '2027-08', EMPTY_ACTIVITY, '2027-05').billable).toBeTrue();
  });

  it('valida como o servidor', () => {
    expect(modelIssues(MODEL)).toEqual({});
    expect(modelIssues(DEFAULT_BILLING_MODEL)).toEqual({});
    expect(Object.keys(modelIssues(edit((m) => (m.tiers[0].minBookings = 5))))).toEqual(['tiers.0.minBookings']);
    expect(Object.keys(modelIssues(edit((m) => (m.tiers[2].minBookings = 40))))).toEqual(['tiers.2.minBookings']);
    expect(Object.keys(modelIssues(edit((m) => (m.tiers[2].commissionPercent = 9))))).toEqual(['tiers.2.commissionPercent']);
    expect(Object.keys(modelIssues(edit((m) => (m.tiers[1].monthlyFeeCents = 25000))))).toEqual(['tiers.1.monthlyFeeCents']);
    expect(Object.keys(modelIssues(edit((m) => (m.tiers[0].commissionPercent = NaN))))).toContain('tiers.0.commissionPercent');
  });

  it('rótulos de faixa e mês', () => {
    expect(tierRangeLabel(MODEL, 0)).toBe('0 a 39');
    expect(tierRangeLabel(MODEL, 2)).toBe('120 ou mais');
    expect(monthLabel('2027-01')).toBe('jan/2027');
  });

  it('nova faixa fica acima da última e válida', () => {
    const m = appendTier(MODEL);
    expect(m.tiers.length).toBe(4);
    expect(m.tiers[3].minBookings).toBe(200);
    expect(modelIssues(m)).toEqual({});
  });

  it('modelo inválido lido vira o exemplo', () => {
    expect(modelFrom({ tiers: 'x' })).toEqual(DEFAULT_BILLING_MODEL);
    expect(modelFrom(MODEL)).toEqual(MODEL);
  });
});
