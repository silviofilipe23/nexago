import {
  companyFinanceFrom,
  costsTotal,
  currentMonthKey,
  holderName,
  margin,
  monthLabel,
  monthOptions,
  monthResult,
  monthShort,
  outMoney,
  resultCsv,
  revenueTotal,
  sourcesOf,
  statementTypeLabel,
  sumMonths,
  type MonthResult,
} from './company-finance';

function month(key: string, over: Partial<MonthResult> = {}): MonthResult {
  const base = companyFinanceFrom({ months: [{ key }] }).months[0];
  return { ...base, ...over };
}

describe('financeiro da empresa: leitura do callable', () => {
  it('retorno vazio vira zeros, nunca undefined; saldo ausente fica null', () => {
    const f = companyFinanceFrom(undefined);
    expect(f.balance.asaasCents).toBeNull();
    expect(f.balance.freeCents).toBeNull();
    expect(f.thirdParty.tournaments.availableCents).toBe(0);
    expect(f.months).toEqual([]);
    expect(f.warnings).toEqual([]);
  });

  it('lê saldo, terceiros, provisões e o saque parado', () => {
    const f = companyFinanceFrom({
      month: '2026-11',
      balance: { asaasCents: 984217, thirdPartyCents: 340206, provisionsCents: 20276, companyCents: 644011, freeCents: 623735 },
      thirdParty: { tournaments: { availableCents: 281703, pendingCents: 0, awaitingCents: 46108, count: 8 } },
      provisions: { cashbackAvailableCents: 1444, storeRefundsCents: 12340, storeRefundsCount: 1 },
      holders: [{ kind: 'torneio', id: 't1', name: '  ', availableCents: 100, pendingCents: 0 }, { kind: 'xxx', id: 'y' }],
      stuckWithdrawals: [{ kind: 'organizador', id: 'w1', amountCents: 57103, payoutStatus: 'pending', approvedAt: '2026-09-19T18:17:29.735Z' }],
      statement: { available: true, entries: [{ id: 'e1', date: '2026-11-05', type: 'PAYMENT_FEE', valueCents: -199 }] },
    });
    expect(f.balance.freeCents).toBe(623735);
    expect(f.thirdParty.tournaments.awaitingCents).toBe(46108);
    expect(f.provisions.storeRefundsCount).toBe(1);
    expect(f.holders.length).toBe(1);
    expect(f.holders[0].name).toBeNull();
    expect(f.stuckWithdrawals[0].approvedAt?.toISOString()).toBe('2026-09-19T18:17:29.735Z');
    expect(f.statement.entries[0].balanceCents).toBeNull();
  });
});

describe('financeiro da empresa: resultado', () => {
  it('resultado = receita − deduções − (Asaas líquido + estoque + operação); margem sobre a receita', () => {
    const m = month('2026-11', {
      revenue: { ...month('x').revenue, torneios: 10000, loja: 30000 },
      deductions: { cashback: 1000, squadDiscount: 500, squadCommission: 500 },
      asaasFees: 800,
      feesRecovered: 300,
      stockPurchases: 5000,
      operatingCosts: 10000,
    });
    expect(revenueTotal(m)).toBe(40000);
    expect(costsTotal(m)).toBe(500 + 5000 + 10000);
    expect(monthResult(m)).toBe(40000 - 2000 - 15500);
    expect(margin(m)).toBeCloseTo(22500 / 40000, 10);
    expect(margin(month('2026-10'))).toBeNull();
  });

  it('sem extrato a tarifa não entra e a soma do período fica sem tarifa', () => {
    const a = month('2026-10', { asaasFees: null, operatingCosts: 100 });
    const b = month('2026-11', { asaasFees: 50, operatingCosts: 100 });
    expect(costsTotal(a)).toBe(100);
    const total = sumMonths([a, b], 'total');
    expect(total.asaasFees).toBeNull();
    expect(total.operatingCosts).toBe(200);
  });

  it('fontes do mês: só as com receita, da maior para a menor, com a fatia', () => {
    const m = month('2026-11', { revenue: { ...month('x').revenue, loja: 3000, torneios: 1000 } });
    const s = sourcesOf(m);
    expect(s.map((x) => x.source)).toEqual(['loja', 'torneios']);
    expect(s[0].share).toBe(0.75);
  });

  it('CSV: uma linha por fonte, dedução e custo negativos, tarifa vazia sem extrato', () => {
    const csv = resultCsv([month('2026-11', { revenue: { ...month('x').revenue, torneios: 12345 }, asaasFees: null, operatingCosts: 45199 })]);
    const lines = csv.split('\n');
    expect(lines[0]).toBe('Linha;nov/26');
    expect(lines).toContain('Torneios;123,45');
    expect(lines).toContain('Tarifas Asaas (extrato);');
    expect(lines).toContain('Custos operacionais;-451,99');
    expect(lines[lines.length - 1]).toBe('Resultado;-328,54');
  });
});

describe('financeiro da empresa: rótulos', () => {
  it('meses em português e seletor dos últimos 12', () => {
    expect(monthLabel('2026-03')).toBe('março/2026');
    expect(monthShort('2026-11')).toBe('nov/26');
    expect(monthOptions('2026-02', 3)).toEqual(['2026-02', '2026-01', '2025-12']);
    expect(currentMonthKey(new Date('2026-12-01T01:00:00Z'))).toBe('2026-11');
  });

  it('saída de dinheiro com sinal; zero vira —', () => {
    expect(outMoney(12340)).toBe('− R$ 123,40');
    expect(outMoney(0)).toBe('—');
    expect(outMoney(-300)).toBe('+ R$ 3,00');
  });

  it('nome ausente vira id encurtado; tipo de extrato desconhecido aparece cru', () => {
    expect(holderName({ kind: 'arena', id: 'xwPKRATejd2QB55QgVbL', name: null })).toBe('Arena sem nome (…5QgVbL)');
    expect(statementTypeLabel('PAYMENT_FEE')).toBe('Tarifa de cobrança');
    expect(statementTypeLabel('NEW_THING_FEE')).toBe('Tarifa (NEW_THING_FEE)');
    expect(statementTypeLabel('NEW_THING')).toBe('NEW_THING');
  });
});
