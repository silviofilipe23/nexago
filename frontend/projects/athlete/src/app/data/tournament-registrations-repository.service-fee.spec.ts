import { cardChargeFromResponse, registrationChargeFromResponse } from './tournament-registrations-repository';

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

describe('cardChargeFromResponse — taxa de antecipação do cartão', () => {
  const base = {
    paymentId: 'pay_2',
    invoiceUrl: 'https://sandbox.asaas.com/i/pay_2',
    expiresAt: '2026-10-26T22:00:00.000Z',
    amountReais: 50,
  };

  it('a taxa do cartão vem à parte e já dentro do cobrado', () => {
    const card = cardChargeFromResponse({ ...base, chargedReais: 50.67, cardFeeReais: 0.67, cardFeePercent: 1.33 });
    expect(card.amountReais).toBe(50);
    expect(card.cardFeeReais).toBe(0.67);
    expect(card.cardFeePercent).toBe(1.33);
    expect(card.chargedReais).toBe(50.67);
  });

  it('backend antigo (sem os campos): cartão sem taxa e o cobrado é o preço', () => {
    const card = cardChargeFromResponse(base);
    expect(card.cardFeeReais).toBe(0);
    expect(card.cardFeePercent).toBe(0);
    expect(card.chargedReais).toBe(50);
  });
});
