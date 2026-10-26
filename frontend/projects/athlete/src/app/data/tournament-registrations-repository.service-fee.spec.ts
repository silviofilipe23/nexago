import { registrationChargeFromResponse } from './tournament-registrations-repository';

describe('registrationChargeFromResponse — taxa de serviço', () => {
  const base = {
    paymentId: 'pay_1',
    qrCode: '00020126BR.GOV.BCB.PIX',
    qrCodeBase64: '',
    expiresAt: '2026-10-26T22:00:00.000Z',
    amountReais: 50,
  };

  it('atleta paga a taxa: o preço segue em amountReais e a taxa vem à parte, já dentro do cobrado', () => {
    const pix = registrationChargeFromResponse({ ...base, serviceFeeReais: 4, chargedReais: 54 });
    expect(pix.amountReais).toBe(50);
    expect(pix.serviceFeeReais).toBe(4);
    expect(pix.chargedReais).toBe(54);
  });

  it('taxa, desconto do embaixador e cashback juntos', () => {
    const pix = registrationChargeFromResponse({
      ...base,
      serviceFeeReais: 2,
      squadDiscountReais: 4,
      cashbackAppliedReais: 10,
      chargedReais: 38,
    });
    expect(pix.serviceFeeReais).toBe(2);
    expect(pix.squadDiscountReais).toBe(4);
    expect(pix.cashbackAppliedReais).toBe(10);
    expect(pix.chargedReais).toBe(38);
  });

  it('sem o campo (organizador paga ou backend antigo): taxa zero e o cobrado é o preço', () => {
    const pix = registrationChargeFromResponse(base);
    expect(pix.serviceFeeReais).toBe(0);
    expect(pix.squadDiscountReais).toBe(0);
    expect(pix.cashbackAppliedReais).toBe(0);
    expect(pix.chargedReais).toBe(50);
  });
});
