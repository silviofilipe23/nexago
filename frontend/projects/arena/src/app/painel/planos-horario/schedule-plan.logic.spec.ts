import {
  bandOccupancy,
  cellOccupants,
  compactWeekdays,
  csvField,
  cycleMonthlyPrice,
  durationLabel,
  gridFromWindows,
  groupWaitlist,
  holidayImpact,
  isInPrime,
  leavingSubsFor,
  matchesFilter,
  nextChargeSummary,
  nextDueDate,
  overdueDays,
  planEconomy,
  primeCommitment,
  primeHoursLeft,
  slotsLabel,
  subscriberState,
  subscribersCsv,
  upcomingHolidays,
  waitlistCountAt,
  windowCellKey,
  windowsFromGrid,
  windowsLabel,
  type GridBlock,
} from './schedule-plan.logic';
import {
  DEFAULT_PRIME_WINDOWS,
  subscriptionFromRaw,
  waitlistFromRaw,
  type ScheduleSubscription,
  type SubscriptionSlot,
} from './schedule-plan.model';

function slot(weekday: number, startTime: string, endTime: string, courtId = 'c1'): SubscriptionSlot {
  return { weekday, startTime, endTime, courtId, courtName: courtId.toUpperCase(), seriesId: `s_${weekday}_${startTime}` };
}

function sub(partial: Partial<ScheduleSubscription> & { id?: string }): ScheduleSubscription {
  return { ...subscriptionFromRaw(partial.id ?? 'sub1', {}), ...partial };
}

describe('schedule-plan.logic · rótulos', () => {
  it('compacta dias seguidos em intervalo e lista os soltos', () => {
    expect(compactWeekdays([1, 2, 3, 4, 5])).toBe('Seg–Sex');
    expect(compactWeekdays([6, 7])).toBe('Sáb e Dom');
    expect(compactWeekdays([1, 3, 5])).toBe('Seg, Qua e Sex');
    expect(compactWeekdays([4])).toBe('Qui');
  });

  it('rotula a janela do plano agrupando por horário', () => {
    const noite = [1, 2, 3, 4, 5].map((weekday) => ({ weekday, startTime: '18:00', endTime: '23:00' }));
    expect(windowsLabel(noite)).toBe('Seg–Sex · 18h–23h');
    expect(windowsLabel([...noite, { weekday: 6, startTime: '07:00', endTime: '12:30' }])).toBe('Seg–Sex · 18h–23h + Sáb · 7h–12h30');
    expect(windowsLabel([])).toBe('Sem janela definida');
  });

  it('rotula duração e horário fixo do assinante', () => {
    expect(durationLabel(60)).toBe('1h');
    expect(durationLabel(90)).toBe('1h30');
    expect(slotsLabel([slot(2, '19:00', '20:00'), slot(4, '19:00', '20:00')])).toBe('Ter e Qui · 19:00');
    expect(slotsLabel([slot(1, '20:00', '21:00'), slot(3, '19:00', '20:00')])).toBe('Seg 20:00 · Qua 19:00');
  });
});

describe('schedule-plan.logic · janela do editor', () => {
  it('liga as faixas que a janela toca e junta faixas vizinhas ao salvar', () => {
    const cells = new Set([windowCellKey(1, 'manha'), windowCellKey(1, 'tarde'), windowCellKey(3, 'noite')]);
    expect(windowsFromGrid(cells)).toEqual([
      { weekday: 1, startTime: '06:00', endTime: '18:00' },
      { weekday: 3, startTime: '18:00', endTime: '23:00' },
    ]);
    expect([...gridFromWindows([{ weekday: 2, startTime: '11:00', endTime: '14:00' }])].sort()).toEqual(['2:manha', '2:tarde']);
  });
});

describe('schedule-plan.logic · preço', () => {
  it('aplica o desconto do ciclo no mensal', () => {
    expect(cycleMonthlyPrice(240, 5)).toBe(228);
    expect(cycleMonthlyPrice(240, 10)).toBe(216);
    expect(cycleMonthlyPrice(199.9, 0)).toBe(199.9);
  });

  it('compara com o avulso (vezes por semana × 4 × horas)', () => {
    const e = planEconomy({ monthlyPriceReais: 240, referenceHourlyReais: 70, timesPerWeek: 1, durationMinutes: 60 })!;
    expect(e.bookingsPerMonth).toBe(4);
    expect(e.avulsoMonthlyReais).toBe(280);
    expect(e.savingsReais).toBe(40);
    expect(e.discountPercent).toBe(14);
    expect(planEconomy({ monthlyPriceReais: 240, referenceHourlyReais: null, timesPerWeek: 1, durationMinutes: 60 })).toBeNull();
  });
});

describe('schedule-plan.logic · horário nobre', () => {
  it('divide horas-quadra de plano no nobre pelas horas-quadra do nobre', () => {
    // Nobre padrão: Seg–Sex 18–23 = 25h × 4 quadras = 100h.
    const subs = [
      sub({ id: 'a', status: 'active', slots: [slot(1, '19:00', '20:00'), slot(3, '19:00', '20:00')] }),
      sub({ id: 'b', status: 'paused', slots: [slot(2, '22:30', '23:30')] }), // só 30 min no nobre
      sub({ id: 'c', status: 'canceled', slots: [slot(4, '19:00', '21:00')] }), // não segura horário
      sub({ id: 'd', status: 'active', slots: [slot(6, '19:00', '20:00')] }), // sábado: fora do nobre
    ];
    const c = primeCommitment(DEFAULT_PRIME_WINDOWS, 4, subs);
    expect(c.totalHours).toBe(100);
    expect(c.committedHours).toBe(2.5);
    expect(c.percent).toBe(3);
    expect(primeHoursLeft(c, 75)).toBe(72);
    expect(primeCommitment(DEFAULT_PRIME_WINDOWS, 0, subs).percent).toBe(0);
  });

  it('sabe se um pedido da fila cai no nobre', () => {
    expect(isInPrime([4], '19:00', 60, DEFAULT_PRIME_WINDOWS)).toBeTrue();
    expect(isInPrime([4], '17:00', 60, DEFAULT_PRIME_WINDOWS)).toBeFalse();
    expect(isInPrime([4], '17:30', 60, DEFAULT_PRIME_WINDOWS)).toBeTrue();
    expect(isInPrime([6], '19:00', 60, DEFAULT_PRIME_WINDOWS)).toBeFalse();
  });
});

describe('schedule-plan.logic · ocupação por faixa', () => {
  it('ordena da faixa mais vazia para a mais cheia', () => {
    // 1 quadra; noite Seg–Sex = 25h; 5h ocupadas = 20%.
    const subs = [sub({ status: 'active', slots: [1, 2, 3, 4, 5].map((d) => slot(d, '19:00', '20:00')) })];
    const occ = bandOccupancy(subs, 1);
    expect(occ.length).toBe(6);
    const noite = occ.find((o) => o.group === 'weekdays' && o.band.id === 'noite')!;
    expect(noite.percent).toBe(20);
    expect(noite.label).toBe('Seg–Sex · 18–23h');
    expect(occ[occ.length - 1]).toBe(noite);
    expect(occ[0]!.percent).toBe(0);
  });
});

describe('schedule-plan.logic · situação do assinante', () => {
  const today = '2026-11-03';

  it('conta os dias do maior atraso entre as abertas vencidas', () => {
    expect(overdueDays([{ status: 'open', dueDate: '2026-11-01' }, { status: 'open', dueDate: '2026-10-30' }], today)).toBe(4);
    expect(overdueDays([{ status: 'paid', dueDate: '2026-10-01' }, { status: 'open', dueDate: today }], today)).toBe(0);
  });

  it('prioriza pausado > suspenso > atrasado > saindo > em dia', () => {
    const late = [{ status: 'open' as const, dueDate: '2026-11-01' }];
    expect(subscriberState({ status: 'paused', endsOn: null, pausedUntil: '2026-11-20' }, late, today).label).toBe('Pausado até 20/11');
    expect(subscriberState({ status: 'suspended', endsOn: null, pausedUntil: null }, late, today).kind).toBe('suspended');
    const atrasado = subscriberState({ status: 'active', endsOn: '2026-11-30', pausedUntil: null }, late, today);
    expect(atrasado.kind).toBe('late');
    expect(atrasado.label).toBe('Atrasado 2 dias');
    expect(subscriberState({ status: 'active', endsOn: '2026-11-30', pausedUntil: null }, [], today).label).toBe('Sai em 30/11');
    expect(subscriberState({ status: 'active', endsOn: null, pausedUntil: null }, [{ status: 'open', dueDate: '2026-11-05' }], today).kind).toBe('ok');
  });

  it('o filtro Atrasados inclui os suspensos', () => {
    expect(matchesFilter('suspended', 'late')).toBeTrue();
    expect(matchesFilter('late', 'late')).toBeTrue();
    expect(matchesFilter('paused', 'late')).toBeFalse();
    expect(matchesFilter('leaving', 'all')).toBeTrue();
  });

  it('próximo vencimento é o menor entre as abertas', () => {
    expect(nextDueDate([{ status: 'open', dueDate: '2026-12-05' }, { status: 'paid', dueDate: '2026-10-05' }, { status: 'open', dueDate: '2026-11-05' }])).toBe('2026-11-05');
    expect(nextDueDate([])).toBeNull();
  });
});

describe('schedule-plan.logic · CSV', () => {
  it('escapa campo com ponto e vírgula ou aspas', () => {
    expect(csvField('Ana')).toBe('Ana');
    expect(csvField('Grupo; Quinta')).toBe('"Grupo; Quinta"');
    expect(csvField('Rafa "Nunes"')).toBe('"Rafa ""Nunes"""');
  });

  it('gera cabeçalho e uma linha por assinante no padrão brasileiro', () => {
    const s = sub({
      holderName: 'Marina Lopes', holderPhone: '62999990000', planName: 'Fixo Noite 2x', cycle: 'quarterly',
      monthlyPriceReais: 427.5, paymentMethod: 'pix_auto', makeupBalance: 1,
      members: [{ athleteId: 'a', name: 'Marina', photoUrl: null, shareReais: 213.75, role: 'holder' }, { athleteId: 'b', name: 'Thaís', photoUrl: null, shareReais: 213.75, role: 'member' }],
      slots: [slot(2, '19:00', '20:00', 'q2'), slot(4, '19:00', '20:00', 'q2')],
    });
    const lines = subscribersCsv([{ sub: s, state: { label: 'Em dia' }, nextDue: '2026-11-05' }]).split('\r\n');
    expect(lines.length).toBe(2);
    expect(lines[0]!.startsWith('Titular;Telefone;Jogadores;Plano')).toBeTrue();
    expect(lines[1]).toBe('Marina Lopes;62999990000;2;Fixo Noite 2x;Ter e Qui · 19:00;Q2;Trimestral;427,50;Pix automático;05/11/2026;1;Em dia');
  });
});

describe('schedule-plan.logic · cobrança e feriados', () => {
  it('resume o próximo vencimento em aberto por forma e rateio', () => {
    const subs = new Map([
      ['a', { paymentMethod: 'pix_auto' as const, members: [{}, {}] as ScheduleSubscription['members'] }],
      ['b', { paymentMethod: 'onsite' as const, members: [{}] as ScheduleSubscription['members'] }],
    ]);
    const charges = [
      { status: 'open' as const, dueDate: '2026-11-05', amountReais: 112.5, subscriptionId: 'a' },
      { status: 'open' as const, dueDate: '2026-11-05', amountReais: 112.5, subscriptionId: 'a' },
      { status: 'open' as const, dueDate: '2026-11-05', amountReais: 240, subscriptionId: 'b' },
      { status: 'open' as const, dueDate: '2026-12-05', amountReais: 240, subscriptionId: 'b' },
      { status: 'open' as const, dueDate: '2026-11-01', amountReais: 99, subscriptionId: 'b' }, // vencida: fica de fora
    ];
    const n = nextChargeSummary(charges, subs, '2026-11-03')!;
    expect(n.dueDate).toBe('2026-11-05');
    expect(n.totalReais).toBe(465);
    expect(n.count).toBe(3);
    expect(n.byForm).toEqual({ pix_auto: 2, card: 0, onsite: 1 });
    expect(n.splitGroups).toBe(1);
  });

  it('lista feriados dos próximos 30 dias ainda não revisados', () => {
    expect(upcomingHolidays('2026-11-03', 30, []).map((h) => h.date)).toEqual(['2026-11-15', '2026-11-20']);
    expect(upcomingHolidays('2026-11-03', 30, ['2026-11-20']).map((h) => h.date)).toEqual(['2026-11-15']);
  });

  it('conta os horários de plano no dia do feriado e quantos viram reposição', () => {
    const subs = [
      { status: 'active' as const, planId: 'p1', slots: [slot(5, '19:00', '20:00')] },
      { status: 'active' as const, planId: 'p2', slots: [slot(5, '20:00', '21:00'), slot(2, '20:00', '21:00')] },
      { status: 'paused' as const, planId: 'p1', slots: [slot(5, '18:00', '19:00')] },
    ];
    // 2026-11-20 é sexta.
    expect(holidayImpact('2026-11-20', subs, (id) => (id === 'p1' ? 'makeup' : 'play'))).toEqual({ total: 2, makeup: 1 });
  });
});

describe('schedule-plan.logic · lista de espera e grade', () => {
  const at = (iso: string) => new Date(iso);
  const entries = [
    { ...waitlistFromRaw('w1', { weekdays: [4], startTime: '19:00', status: 'waiting' }), createdAt: at('2026-10-03T10:00:00Z') },
    { ...waitlistFromRaw('w2', { weekdays: [4], startTime: '19:00', status: 'offered' }), createdAt: at('2026-09-12T10:00:00Z') },
    { ...waitlistFromRaw('w3', { weekdays: [2], startTime: '21:00', status: 'waiting' }), createdAt: at('2026-10-10T10:00:00Z') },
    { ...waitlistFromRaw('w4', { weekdays: [2], startTime: '21:00', status: 'removed' }), createdAt: at('2026-09-01T10:00:00Z') },
  ];

  it('agrupa a fila ativa por dia e horário, na ordem de chegada', () => {
    const groups = groupWaitlist(entries);
    expect(groups.map((g) => g.key)).toEqual(['4|19:00', '2|21:00']);
    expect(groups[0]!.entries.map((e) => e.id)).toEqual(['w2', 'w1']);
    expect(groups[1]!.entries.length).toBe(1);
  });

  it('conta a fila de uma hora da grade', () => {
    expect(waitlistCountAt(entries, 4, 19)).toBe(2);
    expect(waitlistCountAt(entries, 2, 21)).toBe(1);
    expect(waitlistCountAt(entries, 4, 20)).toBe(0);
  });

  it('acha quem sai num dos horários do grupo', () => {
    const leaving = sub({ id: 'x', endsOn: '2026-11-30', slots: [slot(2, '21:00', '22:00', 'q3')] });
    const staying = sub({ id: 'y', endsOn: null, slots: [slot(2, '21:00', '22:00', 'q1')] });
    const found = leavingSubsFor({ weekdays: [2], startTime: '21:00' }, [leaving, staying]);
    expect(found.map((f) => f.sub.id)).toEqual(['x']);
    expect(found[0]!.slot.courtName).toBe('Q3');
  });

  it('põe uma barra por quadra, com o horário fixo ganhando da aula', () => {
    const courts = [{ id: 'c1', name: 'Q1' }, { id: 'c2', name: 'Q2' }, { id: 'c3', name: 'Q3' }];
    const blocks: GridBlock[] = [
      { kind: 'class', weekday: 4, startTime: '18:30', endTime: '19:30', courtIds: ['c1', 'c2'], title: 'Clubinho', detail: '' },
      { kind: 'fixed', weekday: 4, startTime: '19:00', endTime: '20:00', courtIds: ['c1'], title: 'Rafa', detail: '' },
      { kind: 'fixed', weekday: 3, startTime: '19:00', endTime: '20:00', courtIds: ['c3'], title: 'Outro dia', detail: '' },
    ];
    const cell = cellOccupants(blocks, courts, 4, 19);
    expect(cell.map((c) => c.block?.title ?? null)).toEqual(['Rafa', 'Clubinho', null]);
    expect(cellOccupants(blocks, courts, 4, 20).every((c) => c.block === null)).toBeTrue();
  });
});
