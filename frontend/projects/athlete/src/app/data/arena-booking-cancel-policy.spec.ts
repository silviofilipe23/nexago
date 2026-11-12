import { athleteCancelPolicyFrom, canceledBookingNotice, cancelPolicyOutcomeText } from './arena-bookings-repository';

describe('cancelamento da reserva pelo atleta: política e aviso', () => {
  it('lê a política copiada na reserva; ausente ou estranha = integral', () => {
    expect(athleteCancelPolicyFrom(undefined)).toEqual({ mode: 'refund', refundPercent: 100 });
    expect(athleteCancelPolicyFrom({ mode: 'refund', refundPercent: 50 })).toEqual({ mode: 'refund', refundPercent: 50 });
    expect(athleteCancelPolicyFrom({ mode: 'refund', refundPercent: 33 })).toEqual({ mode: 'refund', refundPercent: 100 });
    expect(athleteCancelPolicyFrom({ mode: 'credit' })).toEqual({ mode: 'credit', refundPercent: 0 });
  });

  it('confirmação diz o que volta conforme a política', () => {
    expect(cancelPolicyOutcomeText(undefined, 'Arena Sol')).toContain('volta inteiro');
    expect(cancelPolicyOutcomeText({ mode: 'refund', refundPercent: 75 }, 'Arena Sol')).toContain('75% do valor pago volta');
    expect(cancelPolicyOutcomeText({ mode: 'credit', refundPercent: 0 }, 'Arena Sol')).toContain('crédito para usar em outra reserva na Arena Sol');
  });

  it('aviso depois de cancelar: crédito, estorno ou nada', () => {
    expect(canceledBookingNotice({ refundedReais: 0, creditedReais: 0 })).toBe('Reserva cancelada.');
    expect(canceledBookingNotice({ refundedReais: 70, creditedReais: 0 })).toContain('Estorno de R$');
    expect(canceledBookingNotice({ refundedReais: 0, creditedReais: 70 })).toContain('viraram crédito');
  });
});
