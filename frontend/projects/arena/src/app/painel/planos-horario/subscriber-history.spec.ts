import { chargeFromRaw, creditFromRaw, type PlanOccurrence, type ScheduleCharge, type ScheduleCredit } from './schedule-plan.model';
import { buildSubscriberHistory, monthPayment, occurrenceOutcome } from './subscriber-history';

const today = '2026-11-11';

function occ(dateKey: string, extra: Partial<PlanOccurrence> = {}): PlanOccurrence {
  return {
    id: `${dateKey}-${extra.startTime ?? '19:00'}`,
    dateKey,
    startTime: '19:00',
    endTime: '20:00',
    courtName: 'Quadra 2',
    status: 'confirmed',
    makeup: false,
    attendanceStatus: null,
    cancelReason: null,
    canceledByRole: null,
    ...extra,
  };
}

function charge(id: string, raw: Record<string, unknown>): ScheduleCharge {
  return chargeFromRaw(id, { amountReais: 400, payerIndex: 0, ...raw });
}

function credit(id: string, raw: Record<string, unknown>): ScheduleCredit {
  return creditFromRaw(id, { subscriptionId: 's1', expiresOn: '2026-12-31', ...raw });
}

const baseSub = { startDate: '2026-09-02', source: 'athlete' as const, endsOn: null, status: 'active' as const, pauseDaysUsed: null };

describe('occurrenceOutcome', () => {
  it('separa jogou, falta, aviso, cancelado pela arena, reposição e a jogar', () => {
    expect(occurrenceOutcome(occ('2026-11-04'), today)).toBe('played');
    expect(occurrenceOutcome(occ('2026-11-04', { attendanceStatus: 'no_show' }), today)).toBe('noshow');
    expect(occurrenceOutcome(occ('2026-11-04', { status: 'cancelled', cancelReason: 'schedule_skip' }), today)).toBe('skip');
    expect(occurrenceOutcome(occ('2026-11-04', { status: 'canceled', cancelReason: 'schedule_holiday' }), today)).toBe('arena');
    expect(occurrenceOutcome(occ('2026-11-04', { makeup: true }), today)).toBe('makeup');
    expect(occurrenceOutcome(occ('2026-11-13'), today)).toBe('next');
    expect(occurrenceOutcome(occ(today, { attendanceStatus: 'checked_in' }), today)).toBe('played');
  });

  it('liberação do sistema (pausa, troca, saída) não entra no histórico', () => {
    expect(occurrenceOutcome(occ('2026-11-04', { status: 'canceled', cancelReason: 'schedule_subscription_paused' }), today)).toBeNull();
    expect(occurrenceOutcome(occ('2026-11-04', { status: 'canceled', cancelReason: 'schedule_slots_changed' }), today)).toBeNull();
    expect(occurrenceOutcome(occ('2026-11-04', { status: 'canceled', cancelReason: 'recurring_series_updated' }), today)).toBeNull();
  });
});

describe('monthPayment', () => {
  it('paga em dia mostra a data e a forma; com atraso mostra os dias', () => {
    const paid = charge('c1', { period: '2026-10', dueDate: '2026-10-05', status: 'paid', paidOn: '2026-10-04', paymentMethod: 'pix' });
    expect(monthPayment('2026-10', [paid], today)).toEqual({ label: 'Paga · 04/10 · PIX', tone: 'green' });
    const late = charge('c2', { period: '2026-09', dueDate: '2026-09-05', status: 'paid', paidOn: '2026-09-08', paidVia: 'asaas', onlineBillingType: 'PIX' });
    expect(monthPayment('2026-09', [late], today)).toEqual({ label: 'Paga com 3d de atraso', tone: 'yellow' });
  });

  it('rateio: vale o pior pagador; vencida em aberto é atraso', () => {
    const a = charge('a', { period: '2026-11', dueDate: '2026-11-05', status: 'paid', paidOn: '2026-11-05' });
    const b = charge('b', { period: '2026-11', dueDate: '2026-11-05', status: 'open', payerIndex: 1 });
    expect(monthPayment('2026-11', [a, b], today)).toEqual({ label: 'Atrasada 6d', tone: 'red' });
    const c = charge('c', { period: '2026-12', dueDate: '2026-12-05', status: 'open' });
    expect(monthPayment('2026-12', [c], today)).toEqual({ label: 'Aberta · vence 05/12', tone: 'dim' });
  });

  it('anual à vista cobre os meses seguintes; mês sem cobrança fica sem selo', () => {
    const annual = charge('y', { period: '2026-09', coversThrough: '2027-08', dueDate: '2026-09-05', status: 'paid', paidOn: '2026-09-01' });
    expect(monthPayment('2026-09', [annual], today)?.label).toBe('Anual pago · 01/09');
    expect(monthPayment('2026-11', [annual], today)).toEqual({ label: 'Coberto pelo anual', tone: 'green' });
    expect(monthPayment('2026-11', [], today)).toBeNull();
    const canceled = charge('x', { period: '2026-11', dueDate: '2026-11-05', status: 'canceled' });
    expect(monthPayment('2026-11', [canceled], today)).toEqual({ label: 'Cancelada', tone: 'dim' });
  });
});

describe('buildSubscriberHistory', () => {
  const charges = [
    charge('c9', { period: '2026-09', dueDate: '2026-09-05', status: 'paid', paidOn: '2026-09-05', paymentMethod: 'cash' }),
    charge('c10', { period: '2026-10', dueDate: '2026-10-05', status: 'paid', paidOn: '2026-10-08', paymentMethod: 'pix' }),
    charge('c11', { period: '2026-11', dueDate: '2026-11-05', status: 'open' }),
    charge('cx', { period: '2026-08', dueDate: '2026-08-05', status: 'canceled' }),
  ];
  const occurrences = [
    occ('2026-09-08'),
    occ('2026-09-15', { attendanceStatus: 'no_show' }),
    occ('2026-10-06', { status: 'cancelled', cancelReason: 'schedule_skip' }),
    occ('2026-10-13'),
    occ('2026-10-20', { status: 'canceled', cancelReason: 'schedule_holiday' }),
    occ('2026-10-22', { makeup: true, startTime: '20:00' }),
    occ('2026-11-03', { status: 'canceled', cancelReason: 'schedule_subscription_paused' }),
    occ('2026-11-10'),
    occ('2026-11-17'),
  ];
  const credits = [
    credit('k1', { reason: 'skip', status: 'used', usedDate: '2026-10-22' }),
    credit('k2', { reason: 'holiday', status: 'available', expiresOn: '2026-11-19' }),
    credit('k3', { reason: 'manual', status: 'available', expiresOn: '2026-11-01' }),
  ];
  const h = buildSubscriberHistory({
    sub: { ...baseSub, pauseDaysUsed: { year: '2026', days: 12 } },
    charges,
    occurrences,
    credits,
    todayKey: today,
  });

  it('dinheiro: total pago, em aberto e pontualidade (vencida em aberto conta como atraso)', () => {
    expect(h.paidTotal).toBe(800);
    expect(h.paidCount).toBe(2);
    expect(h.openTotal).toBe(400);
    expect(h.openCount).toBe(1);
    expect(h.onTimeCount).toBe(1);
    expect(h.paidLateCount).toBe(1);
    expect(h.overdueOpenCount).toBe(1);
    expect(h.punctualityPercent).toBe(33);
    expect(h.maxLateDays).toBe(6);
  });

  it('jogos: presença só sobre horários do plano; reposição e arena à parte', () => {
    expect(h.played).toBe(3);
    expect(h.noShows).toBe(1);
    expect(h.skips).toBe(1);
    expect(h.attendancePercent).toBe(60);
    expect(h.arenaCanceled).toBe(1);
    expect(h.holidays).toBe(1);
    expect(h.makeupsPlayed).toBe(1);
    expect(h.lastPlayed).toEqual({ dateKey: '2026-11-10', startTime: '19:00' });
  });

  it('reposições, pausa, origem e tempo de plano', () => {
    expect(h.credits).toEqual({ total: 3, used: 1, available: 1, expired: 1 });
    expect(h.pauseDaysThisYear).toBe(12);
    expect(h.sourceLabel).toBe('Assinou pelo app');
    expect(h.monthsInPlan).toBe(3);
  });

  it('mês a mês do mais recente para o mais antigo, com jogos e mensalidade', () => {
    expect(h.months.map((m) => m.period)).toEqual(['2026-11', '2026-10', '2026-09']);
    const [nov, oct, sep] = h.months;
    expect(nov!.outcomes).toEqual(['played', 'next']);
    expect(nov!.summary).toBe('jogou 1 de 1 · 1 a jogar');
    expect(nov!.payment).toEqual({ label: 'Atrasada 6d', tone: 'red' });
    expect(oct!.outcomes).toEqual(['skip', 'played', 'arena', 'makeup']);
    expect(oct!.summary).toBe('jogou 1 de 2 · 1 avisou falta · 1 reposição · 1 cancelado pela arena');
    expect(oct!.payment?.tone).toBe('yellow');
    expect(sep!.summary).toBe('jogou 1 de 2 · 1 falta');
    expect(sep!.payment).toEqual({ label: 'Paga · 05/09 · Dinheiro', tone: 'green' });
  });

  it('pausa de outro ano não conta; assinatura que ainda não começou tem 0 meses', () => {
    const fresh = buildSubscriberHistory({
      sub: { ...baseSub, startDate: '2026-11-20', pauseDaysUsed: { year: '2025', days: 20 } },
      charges: [],
      occurrences: [],
      credits: [],
      todayKey: today,
    });
    expect(fresh.pauseDaysThisYear).toBe(0);
    expect(fresh.monthsInPlan).toBe(0);
    expect(fresh.punctualityPercent).toBeNull();
    expect(fresh.attendancePercent).toBeNull();
    expect(fresh.lastPlayed).toBeNull();
    expect(fresh.months.map((m) => m.period)).toEqual(['2026-11']);
    expect(fresh.months[0]!.summary).toBe('Sem jogos');
  });
});
