import {
  centsToInput,
  chargeState,
  collectionMessage,
  currentMonth,
  formatBRL,
  formatDate,
  formatShortDate,
  fromCents,
  generateCharges,
  monthRange,
  monthTotals,
  msUntilNextMidnight,
  nextSeriesStart,
  monthlyEquivalentCents,
  nextPeriodStart,
  overdueSummary,
  replacementStart,
  shiftMonth,
  toCents,
  type GenerateChargesInput,
} from './finance-rules';

describe('toCents', () => {
  it('converte formatos comuns de reais', () => {
    expect(toCents('180')).toBe(18000);
    expect(toCents('180,50')).toBe(18050);
    expect(toCents('R$ 1.234,56')).toBe(123456);
    expect(toCents('19.90')).toBe(1990);
    expect(toCents('1.234')).toBe(123400);
    expect(toCents('0,1')).toBe(10);
  });

  it('recusa o que não é valor', () => {
    expect(toCents('')).toBeNull();
    expect(toCents('abc')).toBeNull();
    expect(toCents('12,345')).toBeNull();
    expect(toCents('-5')).toBeNull();
  });

  it('não acumula erro de ponto flutuante', () => {
    expect(toCents('0,10')! + toCents('0,20')!).toBe(30);
    expect(toCents('19,90')).toBe(1990);
  });
});

describe('fromCents / formatBRL / centsToInput', () => {
  it('formata centavos em reais', () => {
    expect(fromCents(18050)).toBe('180,50');
    expect(fromCents(123456)).toBe('1.234,56');
    expect(fromCents(5)).toBe('0,05');
    expect(formatBRL(1990)).toBe('R$ 19,90');
  });

  it('centsToInput não usa separador de milhar', () => {
    expect(centsToInput(123456)).toBe('1234,56');
  });
});

describe('datas', () => {
  it('formatDate e formatShortDate', () => {
    expect(formatDate('2026-11-05')).toBe('05/11/2026');
    expect(formatShortDate('2026-11-05')).toBe('05/11');
  });

  it('currentMonth usa o dia local', () => {
    expect(currentMonth(new Date(2026, 9, 14, 23, 30))).toBe('2026-10');
  });

  it('shiftMonth atravessa o ano', () => {
    expect(shiftMonth('2026-12', 1)).toBe('2027-01');
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
  });

  it('monthRange vale até fevereiro (comparação é de texto)', () => {
    expect(monthRange('2026-02')).toEqual({ start: '2026-02-01', end: '2026-02-31' });
  });
});

describe('generateCharges', () => {
  const gen = (over: Partial<GenerateChargesInput> = {}) =>
    generateCharges({ cycle: 'mensal', amountCents: 18000, startDate: '2026-10-14', dueDay: 5, count: 3, existingPeriods: [], ...over });

  it('primeiro vencimento já passado vai para o mês seguinte', () => {
    expect(gen().map((c) => c.dueDate)).toEqual(['2026-11-05', '2026-12-05', '2027-01-05']);
    expect(gen().map((c) => c.periodKey)).toEqual(['2026-11', '2026-12', '2027-01']);
  });

  it('vencimento no mês do início quando ainda não passou (inclusive no próprio dia)', () => {
    expect(gen({ startDate: '2026-10-01' }).map((c) => c.dueDate)).toEqual(['2026-10-05', '2026-11-05', '2026-12-05']);
    expect(gen({ startDate: '2026-10-05' })[0]!.dueDate).toBe('2026-10-05');
  });

  it('limita o dia ao fim do mês e respeita ano bissexto', () => {
    expect(gen({ startDate: '2026-01-31', dueDay: 31 }).map((c) => c.dueDate)).toEqual(['2026-01-31', '2026-02-28', '2026-03-31']);
    expect(gen({ startDate: '2028-02-01', dueDay: 29, count: 1 })[0]!.dueDate).toBe('2028-02-29');
    expect(gen({ startDate: '2027-02-01', dueDay: 29, count: 1 })[0]!.dueDate).toBe('2027-02-28');
  });

  it('trimestral soma 3 meses e anual 12', () => {
    expect(gen({ cycle: 'trimestral', startDate: '2026-10-01', dueDay: 10, count: 4 }).map((c) => c.dueDate)).toEqual([
      '2026-10-10', '2027-01-10', '2027-04-10', '2027-07-10',
    ]);
    expect(gen({ cycle: 'anual', count: 1 })).toHaveSize(1);
  });

  it('pula períodos que já existem', () => {
    expect(gen({ startDate: '2026-11-01', existingPeriods: ['2026-12'] }).map((c) => c.periodKey)).toEqual(['2026-11', '2027-01']);
  });

  it('copia o valor do plano em cada parcela', () => {
    expect(gen({ amountCents: 9990 }).every((c) => c.amountCents === 9990)).toBeTrue();
  });
});

describe('nextPeriodStart', () => {
  it('pula o passo do ciclo a partir do último período', () => {
    expect(nextPeriodStart('2026-12', 'mensal')).toBe('2027-01-01');
    expect(nextPeriodStart('2026-11', 'trimestral')).toBe('2027-02-01');
    expect(nextPeriodStart('2026-05', 'anual')).toBe('2027-05-01');
  });
});

describe('chargeState', () => {
  it('vence hoje ainda é pendente; vencida é atrasada', () => {
    expect(chargeState({ status: 'pendente', dueDate: '2026-10-14' }, '2026-10-14')).toBe('pendente');
    expect(chargeState({ status: 'pendente', dueDate: '2026-10-13' }, '2026-10-14')).toBe('atrasado');
  });

  it('pago e cancelado ganham de qualquer data', () => {
    expect(chargeState({ status: 'pago', dueDate: '2026-01-01' }, '2026-10-14')).toBe('pago');
    expect(chargeState({ status: 'cancelado', dueDate: '2026-01-01' }, '2026-10-14')).toBe('cancelado');
  });
});

describe('totais', () => {
  const charges = [
    { status: 'pago', dueDate: '2026-10-05', amountCents: 18000 },
    { status: 'pendente', dueDate: '2026-10-20', amountCents: 18000 },
    { status: 'pendente', dueDate: '2026-10-01', amountCents: 5000 },
    { status: 'cancelado', dueDate: '2026-10-25', amountCents: 999 },
  ] as const;

  it('recebido e a receber (cancelado e atrasado ficam fora do a receber)', () => {
    expect(monthTotals([...charges], '2026-10-14')).toEqual({ receivedCents: 18000, toReceiveCents: 18000 });
  });

  it('em atraso conta só pendentes vencidas', () => {
    expect(overdueSummary([...charges], '2026-10-14')).toEqual({ count: 1, cents: 5000 });
  });
});

describe('monthlyEquivalentCents', () => {
  it('divide trimestral por 3 e anual por 12, só matrículas ativas com plano existente', () => {
    const plans = [
      { id: 'a', amountCents: 18000, cycle: 'mensal' as const },
      { id: 'b', amountCents: 48000, cycle: 'trimestral' as const },
      { id: 'c', amountCents: 160000, cycle: 'anual' as const },
    ];
    const enrollments = [
      { planId: 'a', status: 'ativa' as const },
      { planId: 'b', status: 'ativa' as const },
      { planId: 'c', status: 'ativa' as const },
      { planId: 'a', status: 'encerrada' as const },
      { planId: 'sumiu', status: 'ativa' as const },
    ];
    expect(monthlyEquivalentCents(enrollments, plans)).toBe(18000 + 16000 + 13333);
  });
});

describe('collectionMessage', () => {
  it('monta o texto pronto para colar', () => {
    expect(collectionMessage(18000, '2026-11-05')).toBe('Olá! Lembrando da mensalidade de R$ 180,00, com vencimento em 05/11.');
  });
});

describe('replacementStart', () => {
  it('recomeça no mesmo período da primeira parcela cancelada', () => {
    expect(replacementStart(['2026-12', '2026-11', '2027-01'], '2026-10-14')).toBe('2026-11-01');
  });

  it('sem parcelas canceladas, recomeça hoje', () => {
    expect(replacementStart([], '2026-10-14')).toBe('2026-10-14');
  });
});

describe('nextSeriesStart', () => {
  it('ignora parcelas canceladas ao achar o último período (sem abrir buraco depois de trocar de plano)', () => {
    // mensal 2026-11..2027-10 cancelada na troca; trimestral gerada até 2027-08.
    const cancelled = Array.from({ length: 12 }, (_, i) => ({ periodKey: shiftMonth('2026-11', i), status: 'cancelado' }));
    const active = ['2026-11', '2027-02', '2027-05', '2027-08'].map((periodKey) => ({ periodKey, status: 'pendente' }));
    expect(nextSeriesStart([...cancelled, ...active], 'trimestral', '2026-10-01')).toBe('2027-11-01');
  });

  it('sem parcelas ativas, usa o início de segurança', () => {
    expect(nextSeriesStart([], 'mensal', '2026-10-14')).toBe('2026-10-14');
    expect(nextSeriesStart([{ periodKey: '2026-11', status: 'cancelado' }], 'mensal', '2026-10-14')).toBe('2026-10-14');
  });

  it('continua do maior período ativo, pago ou pendente', () => {
    expect(
      nextSeriesStart([{ periodKey: '2026-12', status: 'pago' }, { periodKey: '2026-11', status: 'pendente' }], 'mensal', '2026-10-01'),
    ).toBe('2027-01-01');
  });
});

describe('msUntilNextMidnight', () => {
  it('conta os milissegundos até a próxima meia-noite local', () => {
    expect(msUntilNextMidnight(new Date(2026, 9, 14, 23, 59, 30))).toBe(30_000);
    expect(msUntilNextMidnight(new Date(2026, 9, 14, 12, 0, 0))).toBe(12 * 3_600_000);
  });

  it('à meia-noite em ponto, falta um dia inteiro', () => {
    expect(msUntilNextMidnight(new Date(2026, 9, 14, 0, 0, 0))).toBe(24 * 3_600_000);
  });
});
