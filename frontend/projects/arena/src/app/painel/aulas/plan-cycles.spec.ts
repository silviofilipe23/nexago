import { DEFAULT_PLAN_BILLING, DEFAULT_PLAN_CYCLES, parsePlanBilling, parsePlanCycles, planCycles, type PlanCycles } from './billing.model';

const CYCLES: PlanCycles = {
  monthly: { enabled: true, discountPercent: 0 },
  quarterly: { enabled: true, discountPercent: 8 },
  semiannual: { enabled: false, discountPercent: 10 },
  annual: { enabled: true, discountPercent: 15 },
};

describe('ciclos do plano de aulas', () => {
  it('só os ligados; desconto sobre o mensal; anual à vista (12 meses)', () => {
    const out = planCycles({ kind: 'monthly', priceReais: 260, cycles: CYCLES });
    expect(out.map((c) => [c.cycle, c.months, c.prepaidMonths, c.discountPercent, c.monthlyPriceReais, c.totalReais])).toEqual([
      ['monthly', 1, 1, 0, 260, 260],
      ['quarterly', 3, 1, 8, 239.2, 239.2],
      ['annual', 12, 12, 15, 221, 2652],
    ]);
  });

  it('semestral: fidelidade de 6 meses, pago mês a mês', () => {
    const out = planCycles({ kind: 'monthly', priceReais: 199.9, cycles: { ...CYCLES, semiannual: { enabled: true, discountPercent: 10 } } });
    expect(out.find((c) => c.cycle === 'semiannual')).toEqual({
      cycle: 'semiannual', months: 6, prepaidMonths: 1, discountPercent: 10, monthlyPriceReais: 179.91, totalReais: 179.91,
    });
  });

  it('sem `cycles` = só o mensal', () => {
    expect(planCycles({ kind: 'monthly', priceReais: 200 }).map((c) => c.cycle)).toEqual(['monthly']);
  });

  it('pacote e avulsa não têm ciclo', () => {
    expect(planCycles({ kind: 'package', priceReais: 450, cycles: CYCLES })).toEqual([]);
  });

  it('parse do doc: ausente = só mensal; desconto limitado a 0–50', () => {
    expect(parsePlanCycles(undefined)).toEqual(DEFAULT_PLAN_CYCLES);
    const c = parsePlanCycles({ monthly: { enabled: false }, annual: { enabled: true, discountPercent: 80 }, quarterly: { discountPercent: -5 } });
    expect(c.monthly.enabled).toBeFalse();
    expect(c.annual).toEqual({ enabled: true, discountPercent: 50 });
    expect(c.quarterly).toEqual({ enabled: false, discountPercent: 0 });
  });

  it('parse da cobrança: formas válidas, vencimento fixo ou à escolha (2 a 4 dias)', () => {
    expect(parsePlanBilling(undefined)).toEqual(DEFAULT_PLAN_BILLING);
    expect(parsePlanBilling({ methods: ['pix', 'boleto', 'onsite'], dueDay: 10, dueDayOptions: [25, 5, 15] })).toEqual({
      methods: ['pix', 'onsite'], dueDay: 10, dueDayOptions: [5, 15, 25],
    });
    expect(parsePlanBilling({ methods: [], dueDay: null, dueDayOptions: [5] })).toEqual({
      methods: ['pix', 'card', 'onsite'], dueDay: null, dueDayOptions: [],
    });
  });
});
