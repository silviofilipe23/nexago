import {
  athleteCancelChoice,
  athleteCancelPolicyAthleteText,
  athleteCancelPolicyFromArenaDoc,
  normalizeAthleteCancelPolicy,
  policyForChoice,
} from './cancel-policy.model';

describe('política de cancelamento pelo atleta', () => {
  it('arena sem política: estorno integral', () => {
    expect(athleteCancelPolicyFromArenaDoc({})).toEqual({ mode: 'refund', refundPercent: 100 });
    expect(athleteCancelPolicyFromArenaDoc(null)).toEqual({ mode: 'refund', refundPercent: 100 });
  });

  it('lê parcial e crédito; percentual fora das opções vira integral', () => {
    expect(normalizeAthleteCancelPolicy({ mode: 'refund', refundPercent: 25 })).toEqual({ mode: 'refund', refundPercent: 25 });
    expect(normalizeAthleteCancelPolicy({ mode: 'credit', refundPercent: 50 })).toEqual({ mode: 'credit', refundPercent: 0 });
    expect(normalizeAthleteCancelPolicy({ mode: 'refund', refundPercent: 10 })).toEqual({ mode: 'refund', refundPercent: 100 });
  });

  it('escolha da tela ↔ política', () => {
    expect(athleteCancelChoice({ mode: 'refund', refundPercent: 100 })).toBe('full');
    expect(athleteCancelChoice({ mode: 'refund', refundPercent: 75 })).toBe('partial');
    expect(athleteCancelChoice({ mode: 'credit', refundPercent: 0 })).toBe('credit');
    expect(policyForChoice('partial', { mode: 'refund', refundPercent: 100 })).toEqual({ mode: 'refund', refundPercent: 50 });
    expect(policyForChoice('partial', { mode: 'refund', refundPercent: 25 })).toEqual({ mode: 'refund', refundPercent: 25 });
    expect(policyForChoice('credit', { mode: 'refund', refundPercent: 25 })).toEqual({ mode: 'credit', refundPercent: 0 });
  });

  it('texto do atleta conforme a política', () => {
    expect(athleteCancelPolicyAthleteText({ mode: 'refund', refundPercent: 100 }, 'Arena Sol')).toContain('volta inteiro');
    expect(athleteCancelPolicyAthleteText({ mode: 'refund', refundPercent: 50 }, 'Arena Sol')).toContain('50% do valor pago volta');
    expect(athleteCancelPolicyAthleteText({ mode: 'credit', refundPercent: 0 }, 'Arena Sol')).toContain('crédito para usar em outra reserva na Arena Sol');
  });
});
