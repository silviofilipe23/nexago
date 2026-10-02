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
});
