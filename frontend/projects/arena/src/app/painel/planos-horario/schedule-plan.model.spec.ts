import { Timestamp } from 'firebase/firestore';
import { friendlyCallableError } from './schedule-plan-repository';
import { chargeFromRaw, planFromRaw, settingsFromRaw, subscriptionFromRaw, waitlistFromRaw } from './schedule-plan.model';

describe('schedule-plan.model · parse', () => {
  it('plano sem campos cai nos padrões do contrato', () => {
    const p = planFromRaw('p1', { name: 'Fixo Noite' });
    expect(p.status).toBe('draft');
    expect(p.timesPerWeek).toBe(1);
    expect(p.durationMinutes).toBe(60);
    expect(p.cycles.quarterly).toEqual({ enabled: true, discountPercent: 5 });
    expect(p.cycles.annual.discountPercent).toBe(10);
    expect(p.billing).toEqual({ methods: ['pix_auto', 'card', 'onsite'], dueDay: 5, overdueReleaseDays: 3 });
    expect(p.rules.makeup).toEqual({ enabled: true, perMonth: 2, validityDays: 30, noticeHours: 24 });
    expect(p.rules.holiday).toBe('makeup');
    expect(p.rules.split.maxPlayers).toBe(4);
  });

  it('plano lido descarta janela inválida e forma desconhecida', () => {
    const p = planFromRaw('p1', {
      status: 'active',
      windows: [{ weekday: 1, startTime: '18:00:00', endTime: '23:00' }, { weekday: 9, startTime: '06:00', endTime: '12:00' }],
      billing: { methods: ['card', 'boleto'], dueDay: 0, overdueReleaseDays: 7 },
      rules: { holiday: 'play', weather: false },
    });
    expect(p.windows).toEqual([{ weekday: 1, startTime: '18:00', endTime: '23:00' }]);
    expect(p.billing).toEqual({ methods: ['card'], dueDay: 0, overdueReleaseDays: 7 });
    expect(p.rules.holiday).toBe('play');
    expect(p.rules.weather).toBeFalse();
  });

  it('regras gerais ausentes = Seg–Sex 18–23, 75%, oferta automática em 24h', () => {
    const s = settingsFromRaw(undefined);
    expect(s.primeWindows.length).toBe(5);
    expect(s.primeWindows[0]).toEqual({ weekday: 1, startTime: '18:00', endTime: '23:00' });
    expect(s.primeCapPercent).toBe(75);
    expect(s.waitlistAutoOffer).toBeTrue();
    expect(s.waitlistOfferHours).toBe(24);
    expect(settingsFromRaw({ waitlistOfferHours: 36, primeWindows: [] }).waitlistOfferHours).toBe(24);
    expect(settingsFromRaw({ primeWindows: [] }).primeWindows).toEqual([]);
  });

  it('assinatura, mensalidade e fila mapeiam os campos do contrato', () => {
    const s = subscriptionFromRaw('s1', {
      holderName: 'Marina', status: 'suspended', cycle: 'annual', paymentMethod: 'card', planSnapshot: { durationMinutes: 90 },
      slots: [{ weekday: 2, startTime: '19:00', endTime: '20:30', courtId: 'q2', courtName: 'Quadra 2', seriesId: 'r1' }],
      members: [{ athleteId: 'a1', name: 'Marina', shareReais: 120, role: 'holder' }, { athleteId: null, name: 'Bia', shareReais: 120, role: 'member' }],
    });
    expect(s.status).toBe('suspended');
    expect(s.durationMinutes).toBe(90);
    expect(s.slots[0]!.courtName).toBe('Quadra 2');
    expect(s.members.map((m) => m.role)).toEqual(['holder', 'member']);

    const c = chargeFromRaw('s1_2026-11_1', { subscriptionId: 's1', period: '2026-11', payerIndex: 1, status: 'paid', paymentMethod: 'cash' });
    expect(c.payerIndex).toBe(1);
    expect(c.paymentMethod).toBe('cash');
    expect(chargeFromRaw('x', { paymentMethod: 'pix_auto' }).paymentMethod).toBeNull();

    const expires = Timestamp.fromDate(new Date('2026-11-04T22:00:00Z'));
    const w = waitlistFromRaw('w1', { weekdays: [4, 2, 9], startTime: '19:00', status: 'offered', offer: { courtId: 'q3', courtName: 'Quadra 3', expiresAt: expires } });
    expect(w.weekdays).toEqual([2, 4]);
    expect(w.offer?.courtName).toBe('Quadra 3');
    expect(w.offer?.expiresAt?.toISOString()).toBe('2026-11-04T22:00:00.000Z');
    expect(waitlistFromRaw('w2', { offer: null }).offer).toBeNull();
  });

  it('cobrança online: regra da arena e campos da mensalidade', () => {
    expect(settingsFromRaw(undefined).onlineBillingEnabled).toBeFalse();
    expect(settingsFromRaw({ onlineBillingEnabled: true }).onlineBillingEnabled).toBeTrue();
    expect(settingsFromRaw({ onlineBillingEnabled: 'sim' }).onlineBillingEnabled).toBeFalse();

    const legacy = chargeFromRaw('old', { status: 'open' });
    expect(legacy.billingMode).toBeNull();
    expect(legacy.asaas).toBeNull();
    expect(legacy.paidVia).toBeNull();

    const online = chargeFromRaw('c1', {
      status: 'paid', billingMode: 'asaas', paidVia: 'asaas', onlineBillingType: 'CREDIT_CARD', platformFeeReais: 7.2, paymentMethod: null,
      asaas: { groupId: 'g1', state: 'paid', invoiceUrl: 'https://asaas.com/i/1', status: 'RECEIVED' },
    });
    expect(online.billingMode).toBe('asaas');
    expect(online.asaas).toEqual({ groupId: 'g1', state: 'paid', invoiceUrl: 'https://asaas.com/i/1', status: 'RECEIVED' });
    expect(online.paidVia).toBe('asaas');
    expect(online.onlineBillingType).toBe('CREDIT_CARD');
    expect(online.platformFeeReais).toBe(7.2);
    expect(online.paymentMethod).toBeNull();
    expect(chargeFromRaw('c2', { asaas: { state: 'open' } }).asaas).toBeNull();
    expect(chargeFromRaw('c3', { asaas: { groupId: 'g', state: 'estranho' } }).asaas?.state).toBe('pending');
  });

  it('marca a saída pedida pelo atleta (cancelou pelo app)', () => {
    expect(subscriptionFromRaw('s1', { endsOn: '2026-12-01', endRequestedBy: 'athlete' }).endRequestedBy).toBe('athlete');
    expect(subscriptionFromRaw('s1', { endsOn: '2026-12-01' }).endRequestedBy).toBeNull();
    expect(subscriptionFromRaw('s1', { endRequestedBy: 'x' }).endRequestedBy).toBeNull();
  });
});

describe('schedule-plan-repository · erro amigável', () => {
  it('mostra a mensagem do servidor e esconde código cru', () => {
    expect(friendlyCallableError(Object.assign(new Error('O horário nobre já está no limite de planos'), { code: 'functions/resource-exhausted' })))
      .toBe('O horário nobre já está no limite de planos');
    expect(friendlyCallableError(Object.assign(new Error('NOT FOUND'), { code: 'functions/not-found' }))).toBe('Não foi possível concluir a operação. Tente novamente.');
    expect(friendlyCallableError(Object.assign(new Error('internal'), { code: 'functions/internal' }))).toBe('Não foi possível concluir a operação. Tente novamente.');
    expect(friendlyCallableError(Object.assign(new Error('Plano não encontrado.'), { code: 'functions/not-found' }))).toBe('Plano não encontrado.');
    expect(friendlyCallableError('boom')).toBe('Não foi possível concluir a operação. Tente novamente.');
  });
});
