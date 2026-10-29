import {
  weatherSourceLabel,
  DEFAULT_WEATHER_POLICY,
  affectedIsUnpaid,
  affectedValueLabel,
  applyHourClick,
  bookingRefLabel,
  creditBalanceShown,
  creditOriginLabel,
  defaultRainModePeriod,
  filterWeatherCredits,
  hoursBetween,
  normalizeWeatherPolicy,
  pendingWithRecordedRain,
  policyCourtCount,
  rainModeActivationMessage,
  rainModeTotalsSentence,
  rainModeDefaultMessage,
  rainModeEventFromDoc,
  rainModeNotifiedAthletes,
  rainModePreviewFromData,
  relativeTimeLabel,
  shortCourtName,
  shortDateLabel,
  suggestRainWindow,
  toDateValue,
  togglePolicyCourt,
  weatherCreditFromDoc,
  weatherCreditKpis,
  weatherCreditPill,
  weatherCreditsCsv,
  weatherErrorMessage,
  weatherForecastFromData,
  weatherPolicyAthleteText,
  weatherPolicyFromArenaDoc,
  weatherPolicySummary,
  weatherRequestFromDoc,
  weatherRequestTabCounts,
  weatherRequestsForTab,
  weatherSnapshotErrorMessage,
  type RainModeAffected,
  type WeatherCredit,
  type WeatherHour,
} from './weather.model';

/** Quinta, 29/10/2026, 14:30 (horário local). */
const NOW = new Date(2026, 9, 29, 14, 30);

function affected(over: Partial<RainModeAffected> = {}): RainModeAffected {
  return {
    bookingId: 'b1',
    athleteId: 'u1',
    athleteName: 'Enzo Ribeiro',
    courtId: 'c1',
    courtName: 'Quadra 1',
    startTime: '17:00',
    endTime: '18:00',
    paidReais: 60,
    paymentLabel: 'Pix',
    treatment: 'release',
    manualReason: null,
    creditableReais: 60,
    fraction: 1,
    ...over,
  };
}

function credit(over: Partial<WeatherCredit> = {}): WeatherCredit {
  return {
    id: 'wx_b1',
    arenaId: 'a1',
    athleteId: 'u1',
    athleteName: 'Enzo Ribeiro',
    originBookingId: 'b1',
    originCourtName: 'Quadra 1',
    originDate: '2026-10-29',
    originStartTime: '17:00',
    amountReais: 60,
    balanceReais: 60,
    status: 'open',
    source: 'choice',
    expiresAt: new Date(2027, 0, 27),
    createdAt: new Date(2026, 9, 29, 18),
    uses: [],
    ...over,
  };
}

describe('weather.model — política', () => {
  it('doc sem política cai nos defaults do contrato', () => {
    expect(weatherPolicyFromArenaDoc(null)).toEqual({ ...DEFAULT_WEATHER_POLICY });
    expect(weatherPolicyFromArenaDoc({ name: 'Arena' })).toEqual({ ...DEFAULT_WEATHER_POLICY });
    expect(DEFAULT_WEATHER_POLICY).toEqual({
      enabled: false,
      allowReschedule: true,
      rescheduleDays: 30,
      creditValidityDays: 90,
      trigger: 'arena',
      requestDeadline: 'start',
      midGame: 'proportional',
      courtIds: null,
    });
  });

  it('lê os valores válidos e troca os inválidos pelo padrão', () => {
    const p = normalizeWeatherPolicy({
      enabled: true,
      allowReschedule: false,
      rescheduleDays: 60,
      creditValidityDays: 180,
      trigger: 'auto',
      requestDeadline: 'after_30m',
      midGame: 'none',
      courtIds: ['c1', 'c2', 'c1', 3, ''],
    });
    expect(p).toEqual({
      enabled: true,
      allowReschedule: false,
      rescheduleDays: 60,
      creditValidityDays: 180,
      trigger: 'auto',
      requestDeadline: 'after_30m',
      midGame: 'none',
      courtIds: ['c1', 'c2'],
    });

    const bad = normalizeWeatherPolicy({ rescheduleDays: 45, creditValidityDays: 30, trigger: 'x', midGame: 1, enabled: 'sim' });
    expect(bad.rescheduleDays).toBe(30);
    expect(bad.creditValidityDays).toBe(90);
    expect(bad.trigger).toBe('arena');
    expect(bad.midGame).toBe('proportional');
    expect(bad.enabled).toBeFalse();
  });

  it('creditValidityDays null explícito = sem validade; ausente = 90', () => {
    expect(normalizeWeatherPolicy({ creditValidityDays: null }).creditValidityDays).toBeNull();
    expect(normalizeWeatherPolicy({}).creditValidityDays).toBe(90);
  });

  it('togglePolicyCourt: desmarcar parte de "todas"; marcar tudo volta a null', () => {
    const all = ['c1', 'c2', 'c3'];
    const without2 = togglePolicyCourt(null, 'c2', all);
    expect(without2).toEqual(['c1', 'c3']);
    expect(togglePolicyCourt(without2, 'c2', all)).toBeNull();
    // Id de quadra apagada sai na primeira mexida.
    expect(togglePolicyCourt(['c1', 'velha'], 'c3', all)).toEqual(['c1', 'c3']);
    expect(policyCourtCount(['c1', 'velha'], all)).toBe(1);
    expect(policyCourtCount(null, all)).toBe(3);
  });

  it('resumo bate com a política', () => {
    const lines = weatherPolicySummary({ ...DEFAULT_WEATHER_POLICY, enabled: true, courtIds: ['c1', 'c2', 'c3'] }, ['c1', 'c2', 'c3', 'c4']);
    const byLabel = Object.fromEntries(lines.map((l) => [l.label, l.value]));
    expect(byLabel).toEqual({
      Situação: 'Ligada',
      Aciona: 'Arena · Modo chuva',
      Remarcar: '30 dias',
      Crédito: '90 dias',
      Reembolso: 'Desligado',
      Prazo: 'Até o início',
      'Meio do jogo': 'Proporcional',
      Quadras: '3 de 4',
    });

    const off = Object.fromEntries(
      weatherPolicySummary({ ...DEFAULT_WEATHER_POLICY, allowReschedule: false, creditValidityDays: null }, []).map((l) => [l.label, l.value]),
    );
    expect(off['Remarcar']).toBe('Desligado');
    expect(off['Crédito']).toBe('Sem validade');
    expect(off['Quadras']).toBe('Todas');
  });

  it('texto do atleta acompanha gatilho, remarcação e validade', () => {
    expect(weatherPolicyAthleteText(DEFAULT_WEATHER_POLICY, 'Arena CFC')).toBe(
      'Se a Arena CFC ativar o Modo chuva, você remarca em até 30 dias ou guarda o valor como crédito por 90 dias.',
    );
    const req = weatherPolicyAthleteText(
      { ...DEFAULT_WEATHER_POLICY, trigger: 'request', allowReschedule: false, creditValidityDays: null, requestDeadline: 'before_2h' },
      'Arena CFC',
    );
    expect(req).toContain('até 2h antes do início');
    expect(req).toContain('aprovado pela Arena CFC');
    expect(req).toContain('guarda o valor como crédito sem prazo para usar');
    expect(req).not.toContain('remarca');
  });
});

describe('weather.model — previsão e período', () => {
  const hours: WeatherHour[] = [
    { time: '15:00', probability: 20, precipitationMm: 0.2 },
    { time: '16:00', probability: 40, precipitationMm: 0.8 },
    { time: '17:00', probability: 85, precipitationMm: 4.2 },
    { time: '18:00', probability: 92, precipitationMm: 6.1 },
    { time: '19:00', probability: 88, precipitationMm: 5 },
    { time: '20:00', probability: 70, precipitationMm: 2.4 },
    { time: '21:00', probability: 35, precipitationMm: 0.6 },
  ];

  it('forecast null (sem coordenadas) continua null; horas vêm ordenadas e válidas', () => {
    expect(weatherForecastFromData(null)).toBeNull();
    const f = weatherForecastFromData({
      hours: [{ time: '18:00', probability: 92, precipitationMm: 6.1 }, { time: 'x' }, { time: '05:00', probability: null, precipitationMm: null }],
      fetchedAt: '2026-10-29T17:52:00.000Z',
    });
    expect(f?.hours.map((h) => h.time)).toEqual(['05:00', '18:00']);
    expect(f?.fetchedAt?.toISOString()).toBe('2026-10-29T17:52:00.000Z');
    expect(hoursBetween(f!.hours, 6, 23).map((h) => h.time)).toEqual(['18:00']);
  });

  it('sugere o primeiro bloco contínuo de chuva (≥ 2 mm) a partir da hora mínima', () => {
    expect(suggestRainWindow(hours, 6)).toEqual({ startHour: 17, endHour: 21 });
    expect(suggestRainWindow(hours, 19)).toEqual({ startHour: 19, endHour: 21 });
    expect(suggestRainWindow(hours.slice(0, 2), 6)).toBeNull();
  });

  it('período padrão: hoje da hora atual até +3h; outro dia 17–20', () => {
    expect(defaultRainModePeriod('2026-10-29', '2026-10-29', NOW)).toEqual({ startHour: 14, endHour: 17 });
    expect(defaultRainModePeriod('2026-10-29', '2026-10-29', new Date(2026, 9, 29, 23, 10))).toEqual({ startHour: 23, endHour: 24 });
    expect(defaultRainModePeriod('2026-10-29', '2026-10-29', new Date(2026, 9, 29, 3))).toEqual({ startHour: 6, endHour: 9 });
    expect(defaultRainModePeriod('2026-10-30', '2026-10-29', NOW)).toEqual({ startHour: 17, endHour: 20 });
  });

  it('clique nas barras: 1º abre, 2º fecha, antes da âncora recomeça', () => {
    const first = applyHourClick(null, 17);
    expect(first).toEqual({ startHour: 17, endHour: 18, anchor: 17 });
    expect(applyHourClick(first.anchor, 19)).toEqual({ startHour: 17, endHour: 20, anchor: null });
    expect(applyHourClick(17, 15)).toEqual({ startHour: 15, endHour: 16, anchor: 15 });
    expect(applyHourClick(null, 23)).toEqual({ startHour: 23, endHour: 24, anchor: 23 });
  });
});

describe('weather.model — reservas afetadas', () => {
  it('valor por tratamento', () => {
    expect(affectedValueLabel(affected())).toMatch(/^R\$\s60,00$/);
    expect(affectedValueLabel(affected({ treatment: 'partial', creditableReais: 22.5 }))).toMatch(/^R\$\s22,50 \(proporcional\)$/);
    expect(affectedValueLabel(affected({ treatment: 'cancel', paidReais: 0, creditableReais: 0 }))).toBe('Só cancela');
    expect(affectedValueLabel(affected({ treatment: 'manual', manualReason: 'club' }))).toBe('Tratar à parte');
  });

  it('"Não pago" só fora do tratar à parte', () => {
    expect(affectedIsUnpaid(affected({ treatment: 'cancel', paidReais: 0 }))).toBeTrue();
    expect(affectedIsUnpaid(affected({ treatment: 'manual', paidReais: 0 }))).toBeFalse();
    expect(affectedIsUnpaid(affected())).toBeFalse();
  });

  it('prévia: lê a lista, descarta lixo e recalcula totals ausentes', () => {
    const preview = rainModePreviewFromData({
      bookings: [
        { bookingId: 'b2', athleteId: 'u2', athleteName: 'Marina', courtId: 'c2', courtName: 'Quadra 2', startTime: '18:00', endTime: '19:00', paidReais: 90, paymentLabel: 'Cartão', treatment: 'partial', creditableReais: 45, fraction: 0.5 },
        { bookingId: 'b1', athleteId: null, athleteName: null, courtId: 'c1', courtName: 'Quadra 1', startTime: '17:00', endTime: '18:00', paidReais: 0, paymentLabel: 'Na arena', treatment: 'cancel', creditableReais: 0, fraction: 1 },
        { bookingId: 'b3', courtName: 'Quadra 3', startTime: '17:30', treatment: 'manual', manualReason: 'class' },
        { bookingId: 'b4', treatment: 'outra-coisa' },
        { treatment: 'release' },
      ],
    });
    expect(preview.bookings.map((b) => b.bookingId)).toEqual(['b1', 'b3', 'b2']);
    expect(preview.bookings[1]!.manualReason).toBe('class');
    expect(preview.totals).toEqual({ release: 0, partial: 1, cancel: 1, manual: 1, creditableReais: 45 });
  });

  it('prévia: totals do servidor prevalecem quando vêm', () => {
    const preview = rainModePreviewFromData({ bookings: [], totals: { release: 5, partial: 1, cancel: 1, manual: 2, creditableReais: 410 } });
    expect(preview.totals).toEqual({ release: 5, partial: 1, cancel: 1, manual: 2, creditableReais: 410 });
  });

  it('atletas avisados: distintos, com conta, fora do tratar à parte', () => {
    expect(
      rainModeNotifiedAthletes([
        affected({ bookingId: 'a', athleteId: 'u1' }),
        affected({ bookingId: 'b', athleteId: 'u1' }),
        affected({ bookingId: 'c', athleteId: 'u2', treatment: 'cancel' }),
        affected({ bookingId: 'd', athleteId: 'u3', treatment: 'manual' }),
        affected({ bookingId: 'e', athleteId: null }),
      ]),
    ).toBe(2);
  });

  it('mensagem padrão acompanha a data e a remarcação', () => {
    expect(rainModeDefaultMessage('Arena CFC', '2026-10-29', '2026-10-29', true)).toBe(
      'Chuva na Arena CFC hoje — seu horário pode ser remarcado sem custo ou virar crédito. Toque para escolher.',
    );
    expect(rainModeDefaultMessage('Arena CFC', '2026-10-30', '2026-10-29', false)).toBe(
      'Chuva na Arena CFC amanhã — seu horário pode virar crédito. Toque para escolher.',
    );
    expect(rainModeDefaultMessage('Arena CFC', '2026-11-02', '2026-10-29', true)).toContain('em 02 Nov');
  });

  it('resultado da ativação vira frase', () => {
    expect(rainModeActivationMessage({ eventId: 'e1', released: 5, partial: 1, canceled: 1, manual: 0, notified: 6 })).toBe(
      'Modo chuva ativado: 5 reservas liberadas, 1 com crédito proporcional e 1 não paga cancelada. 6 atletas avisados.',
    );
    expect(rainModeTotalsSentence({ release: 1, partial: 0, cancel: 2, manual: 3, creditableReais: 60 })).toBe(
      '1 reserva liberada, 0 com crédito proporcional, 2 não pagas canceladas e 3 para tratar à parte',
    );
  });

  it('evento: lê contagens e status', () => {
    const ev = rainModeEventFromDoc('e1', {
      arenaId: 'a1',
      date: '2026-10-29',
      startTime: '17:00',
      endTime: '20:00',
      courtIds: ['c1'],
      blockNewBookings: true,
      status: 'active',
      counts: { release: 3, partial: 1, cancel: 1, manual: 2 },
      createdAt: { seconds: 1_800_000_000 },
    });
    expect(ev.status).toBe('active');
    expect(ev.blockNewBookings).toBeTrue();
    expect(ev.counts).toEqual({ release: 3, partial: 1, cancel: 1, manual: 2 });
    expect(ev.createdAt?.getTime()).toBe(1_800_000_000_000);
    expect(rainModeEventFromDoc('e2', { status: 'ended' }).status).toBe('ended');
  });
});

describe('weather.model — pedidos', () => {
  const list = [
    weatherRequestFromDoc('b1', { status: 'pending', athleteName: 'Rafael', weather: { probability: 90, precipitationMm: 5.4 } }),
    weatherRequestFromDoc('b2', { status: 'pending', athleteName: 'Pedro', weather: { probability: 20, precipitationMm: 0.3 } }),
    weatherRequestFromDoc('b3', { status: 'pending', athleteName: 'Sem dado', weather: null }),
    weatherRequestFromDoc('b4', { status: 'approved', autoApproved: true, weather: { probability: 85, precipitationMm: 4.8 } }),
    weatherRequestFromDoc('b5', { status: 'rejected', rejectReason: 'Quadra coberta' }),
    weatherRequestFromDoc('b6', { status: 'withdrawn' }),
  ];

  it('abas e contagens ignoram os retirados', () => {
    expect(weatherRequestTabCounts(list)).toEqual({ pending: 3, approved: 1, rejected: 1 });
    expect(weatherRequestsForTab(list, 'pending').map((r) => r.id)).toEqual(['b1', 'b2', 'b3']);
    expect(list[3]!.autoApproved).toBeTrue();
    expect(list[4]!.rejectReason).toBe('Quadra coberta');
    expect(list[0]!.bookingId).toBe('b1');
  });

  it('"aprovar todas com chuva registrada" pega só pendentes com ≥ 2 mm', () => {
    expect(pendingWithRecordedRain(list).map((r) => r.id)).toEqual(['b1']);
  });

  it('rótulos de tempo e de reserva', () => {
    expect(relativeTimeLabel(new Date(NOW.getTime() - 12 * 60_000), NOW)).toBe('há 12 min');
    expect(relativeTimeLabel(new Date(NOW.getTime() - 3 * 3_600_000), NOW)).toBe('há 3h');
    expect(relativeTimeLabel(new Date(NOW.getTime() - 50 * 3_600_000), NOW)).toBe('há 2 dias');
    expect(relativeTimeLabel(new Date(NOW.getTime() - 10_000), NOW)).toBe('agora');
    expect(relativeTimeLabel(null, NOW)).toBe('—');
    expect(shortDateLabel('2026-10-28')).toBe('Qua 28 Out');
    expect(bookingRefLabel('Quadra 2', '2026-10-28', '18:00')).toBe('Q2 · Qua 28 Out · 18:00');
    expect(shortCourtName('Central')).toBe('Central');
  });
});

describe('weather.model — créditos', () => {
  it('pill do extrato', () => {
    expect(weatherCreditPill(credit(), NOW)).toEqual({ tone: 'green', label: 'Em aberto' });
    expect(weatherCreditPill(credit({ balanceReais: 40 }), NOW)).toEqual({ tone: 'orange', label: 'Parcial' });
    expect(weatherCreditPill(credit({ expiresAt: new Date(2026, 10, 3, 10, 0) }), NOW)).toEqual({ tone: 'yellow', label: 'Vence em 5 dias' });
    expect(weatherCreditPill(credit({ balanceReais: 20, expiresAt: new Date(2026, 9, 30, 10, 0) }), NOW)).toEqual({ tone: 'yellow', label: 'Vence em 1 dia' });
    expect(weatherCreditPill(credit({ status: 'used', balanceReais: 0 }), NOW)).toEqual({ tone: 'dim', label: 'Usado' });
    expect(weatherCreditPill(credit({ status: 'expired' }), NOW)).toEqual({ tone: 'red', label: 'Expirou' });
    expect(weatherCreditPill(credit({ expiresAt: null }), NOW).label).toBe('Em aberto');
  });

  it('expirado mostra saldo zero e origem curta', () => {
    expect(creditBalanceShown(credit({ status: 'expired', balanceReais: 60 }))).toBe(0);
    expect(creditOriginLabel(credit())).toBe('Q1 · 29 Out · 17:00');
  });

  it('KPIs a partir da lista', () => {
    const credits = [
      credit({ id: '1', athleteId: 'u1', balanceReais: 60 }),
      credit({ id: '2', athleteId: 'u1', amountReais: 70, balanceReais: 40, uses: [{ bookingId: 'n1', amountReais: 30, at: new Date(2026, 9, 20), kind: 'booking' }] }),
      credit({ id: '3', athleteId: 'u2', balanceReais: 60, expiresAt: new Date(2026, 10, 3) }),
      credit({ id: '4', athleteId: 'u3', status: 'used', balanceReais: 0, uses: [{ bookingId: 'n2', amountReais: 70, at: new Date(2026, 9, 28), kind: 'reschedule' }] }),
      credit({ id: '5', athleteId: 'u4', status: 'expired', balanceReais: 70, expiresAt: new Date(2026, 9, 20) }),
      credit({ id: '6', athleteId: 'u5', source: 'reschedule', status: 'used', balanceReais: 0, createdAt: new Date(2026, 9, 2), uses: [{ bookingId: 'n3', amountReais: 10, at: new Date(2026, 8, 30), kind: 'booking' }] }),
      credit({ id: '7', athleteId: 'u6', source: 'reschedule', createdAt: new Date(2026, 8, 15), expiresAt: new Date(2026, 10, 20) }),
    ];
    expect(weatherCreditKpis(credits, NOW)).toEqual({
      openBalanceReais: 220,
      openAthletes: 3,
      usedThisMonthReais: 100,
      usedThisMonthBookings: 2,
      reschedulesThisMonth: 1,
      expiringIn30Reais: 120,
      expiringIn30Athletes: 2,
    });
  });

  it('filtros Todos / Em aberto / Vencendo (30 dias)', () => {
    const credits = [
      credit({ id: 'open' }),
      credit({ id: 'soon', expiresAt: new Date(2026, 10, 10) }),
      credit({ id: 'used', status: 'used', balanceReais: 0 }),
      credit({ id: 'gone', status: 'expired' }),
    ];
    expect(filterWeatherCredits(credits, 'all', NOW).length).toBe(4);
    expect(filterWeatherCredits(credits, 'open', NOW).map((c) => c.id)).toEqual(['open', 'soon']);
    expect(filterWeatherCredits(credits, 'expiring', NOW).map((c) => c.id)).toEqual(['soon']);
  });

  it('lê o doc tolerante (Timestamp com toDate, saldo ausente = valor)', () => {
    const c = weatherCreditFromDoc('wx_b9', {
      arenaId: 'a1',
      athleteId: 'u9',
      athleteName: 'Laura',
      amountReais: 60,
      status: 'open',
      source: 'auto',
      expiresAt: { toDate: () => new Date(2027, 0, 1) },
      uses: [{ bookingId: 'n', amountReais: 10, at: { seconds: 1_800_000_000 }, kind: 'reschedule' }, 'lixo'],
    });
    expect(c.balanceReais).toBe(60);
    expect(c.source).toBe('auto');
    expect(c.expiresAt?.getFullYear()).toBe(2027);
    expect(c.uses[0]).toEqual({ bookingId: 'n', amountReais: 10, at: new Date(1_800_000_000_000), kind: 'reschedule' });
    expect(c.uses[1]!.kind).toBe('booking');
  });

  it('CSV com BOM, ";" e as colunas do extrato', () => {
    const csv = weatherCreditsCsv([credit({ athleteName: 'Silva; Jr', balanceReais: 30.5 })], NOW);
    expect(csv.startsWith('﻿')).toBeTrue();
    const lines = csv.slice(1).split('\r\n');
    expect(lines[0]).toBe('Atleta;Reserva de origem;Crédito (R$);Saldo (R$);Validade;Status');
    expect(lines[1]).toBe('"Silva; Jr";Q1 · 29 Out · 17:00;60,00;30,50;27 Jan 2027;Parcial');
  });
});

describe('weather.model — erros e datas', () => {
  it('not-found cru é callable não publicada; copy do servidor passa direto', () => {
    expect(weatherErrorMessage({ code: 'functions/not-found', message: 'not-found' }, 'x')).toBe('Recurso ainda não publicado no servidor.');
    expect(weatherErrorMessage({ code: 'functions/not-found', message: 'NOT_FOUND' }, 'x')).toBe('Recurso ainda não publicado no servidor.');
    expect(weatherErrorMessage({ code: 'functions/not-found', message: 'Reserva não encontrada.' }, 'x')).toBe('Reserva não encontrada.');
    expect(weatherErrorMessage({ code: 'functions/permission-denied', message: 'permission-denied' }, 'x')).toContain('permissão');
    expect(weatherErrorMessage({ code: 'functions/invalid-argument', message: 'INVALID_ARGUMENT' }, 'Fallback.')).toBe('Fallback.');
    expect(weatherErrorMessage(new Error(''), 'Fallback.')).toBe('Fallback.');
    expect(weatherSnapshotErrorMessage({ code: 'failed-precondition' })).toContain('índice');
  });

  it('toDateValue aceita Timestamp, serializado, ISO e ms', () => {
    expect(toDateValue({ toDate: () => new Date(5) })?.getTime()).toBe(5);
    expect(toDateValue({ _seconds: 2 })?.getTime()).toBe(2000);
    expect(toDateValue('2026-10-29T00:00:00.000Z')?.toISOString()).toBe('2026-10-29T00:00:00.000Z');
    expect(toDateValue(10)?.getTime()).toBe(10);
    expect(toDateValue('lixo')).toBeNull();
    expect(toDateValue(undefined)).toBeNull();
  });
});

describe('fonte da previsão', () => {
  it('lê fonte e condição da WeatherAPI e rotula', () => {
    const f = weatherForecastFromData({
      source: 'weatherapi',
      fetchedAt: '2026-10-29T12:00:00Z',
      hours: [{ time: '18:00', probability: 92, precipitationMm: 6.1, condition: 'Chuva forte' }],
    });
    expect(f?.source).toBe('weatherapi');
    expect(f?.hours[0].condition).toBe('Chuva forte');
    expect(weatherSourceLabel(f!.source)).toBe('WeatherAPI');
    expect(weatherSourceLabel('open-meteo')).toBe('Open-Meteo');
  });

  it('fonte desconhecida ou ausente vira null; o clima do pedido também guarda a fonte', () => {
    expect(weatherForecastFromData({ source: 'outra', hours: [] })?.source).toBeNull();
    expect(weatherSourceLabel(null)).toBe('previsão');
    const req = weatherRequestFromDoc('b1', { weather: { precipitationMm: 5.4, source: 'weatherapi' } });
    expect(req.weather?.source).toBe('weatherapi');
  });
});
