import { pixBookingCreateOptions } from './pix-booking-create-options';

describe('pixBookingCreateOptions', () => {
  it('leva o cupom aplicado — a divisão esquecia e a soma das fatias não batia', () => {
    const opts = pixBookingCreateOptions({ totalPriceReais: 90, pixFraction: 1, couponCode: 'AREIA10' });
    expect(opts).toEqual({
      clientAmountReais: 90,
      paymentMode: 'pix',
      paymentFraction: 1,
      couponCode: 'AREIA10',
    });
  });

  it('não manda couponCode quando não há cupom aplicado', () => {
    const opts = pixBookingCreateOptions({ totalPriceReais: 100, pixFraction: 0.5, couponCode: null });
    expect('couponCode' in opts).toBeFalse();
    expect(opts.paymentFraction).toBe(0.5);
  });

  it('leva o esporte escolhido pros dois caminhos (Pix e dividir)', () => {
    const opts = pixBookingCreateOptions({
      totalPriceReais: 100,
      pixFraction: 1,
      couponCode: null,
      sport: 'beachTennis',
    });
    expect(opts.sport).toBe('beachTennis');
    expect('sport' in pixBookingCreateOptions({ totalPriceReais: 100, pixFraction: 1, couponCode: null })).toBeFalse();
  });

  it('reserva como professor vale pros dois caminhos; desligada não manda a chave', () => {
    expect(
      pixBookingCreateOptions({ totalPriceReais: 100, pixFraction: 1, couponCode: null, asProfessor: true }).asProfessor,
    ).toBeTrue();
    expect(
      'asProfessor' in pixBookingCreateOptions({ totalPriceReais: 100, pixFraction: 1, couponCode: null, asProfessor: false }),
    ).toBeFalse();
  });
});
