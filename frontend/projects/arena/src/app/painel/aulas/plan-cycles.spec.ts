import { planCycles } from './billing.model';

describe('ciclos do plano de aulas', () => {
  it('mensal sempre; os longos com valor; desconto sobre o mensal', () => {
    const out = planCycles({ kind: 'monthly', priceReais: 260, cyclePrices: { quarterly: 240, annual: 221 } });
    expect(out.map((c) => [c.cycle, c.months, c.totalReais, c.discountPercent])).toEqual([
      ['monthly', 1, 260, 0],
      ['quarterly', 3, 720, 8],
      ['annual', 12, 2652, 15],
    ]);
  });

  it('pacote e avulsa não têm ciclo', () => {
    expect(planCycles({ kind: 'package', priceReais: 450, cyclePrices: { annual: 200 } })).toEqual([]);
  });
});
