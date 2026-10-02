import { DEFAULT_CASHBACK_CONFIG, type CashbackConfig } from './cashback-model';
import {
  appliedPreviewCents,
  checkoutCashbackState,
  readCashbackCharge,
  redeemablePreviewCents,
  withCashbackCharge,
} from './cashback-preview';

const ON: CashbackConfig = { ...DEFAULT_CASHBACK_CONFIG, enabled: true };

describe('redeemablePreviewCents', () => {
  it('usa todo o saldo quando cabe e ainda sobra o mínimo', () => {
    expect(redeemablePreviewCents({ priceCents: 12000, availableCents: 1240, minCashCents: 500 })).toBe(1240);
  });

  it('trava em preço − mínimo', () => {
    expect(redeemablePreviewCents({ priceCents: 2000, availableCents: 5000, minCashCents: 500 })).toBe(1500);
  });

  it('preço no mínimo ou abaixo dele não usa nada', () => {
    expect(redeemablePreviewCents({ priceCents: 500, availableCents: 5000, minCashCents: 500 })).toBe(0);
    expect(redeemablePreviewCents({ priceCents: 400, availableCents: 5000, minCashCents: 500 })).toBe(0);
  });

  it('sem saldo é zero', () => {
    expect(redeemablePreviewCents({ priceCents: 12000, availableCents: 0, minCashCents: 500 })).toBe(0);
  });
});

describe('checkoutCashbackState', () => {
  it('recurso desligado: nada', () => {
    expect(
      checkoutCashbackState({ priceReais: 120, availableCents: 1240, config: DEFAULT_CASHBACK_CONFIG }),
    ).toEqual({ kind: 'hidden' });
  });

  it('sem saldo usável: só a linha de ganho', () => {
    expect(checkoutCashbackState({ priceReais: 120, availableCents: 0, config: ON })).toEqual({
      kind: 'earn',
      ratePercent: 2,
    });
    expect(checkoutCashbackState({ priceReais: 5, availableCents: 1240, config: ON })).toEqual({
      kind: 'earn',
      ratePercent: 2,
    });
  });

  it('com saldo usável: switch, marcando quando o mínimo travou', () => {
    expect(checkoutCashbackState({ priceReais: 120, availableCents: 1240, config: ON })).toEqual({
      kind: 'redeem',
      availableCents: 1240,
      redeemableCents: 1240,
      minCashCents: 500,
      capped: false,
    });
    expect(checkoutCashbackState({ priceReais: 20, availableCents: 5000, config: ON })).toEqual({
      kind: 'redeem',
      availableCents: 5000,
      redeemableCents: 1500,
      minCashCents: 500,
      capped: true,
    });
  });

  it('preço com centavos que o float erra (R$ 19,99) não perde centavo', () => {
    expect(checkoutCashbackState({ priceReais: 19.99, availableCents: 5000, config: ON })).toEqual({
      kind: 'redeem',
      availableCents: 5000,
      redeemableCents: 1499,
      minCashCents: 500,
      capped: true,
    });
  });
});

describe('appliedPreviewCents', () => {
  it('switch desligado não pede saldo', () => {
    expect(appliedPreviewCents({ use: false, priceReais: 120, availableCents: 1240, config: ON })).toBe(0);
  });

  it('switch ligado pede o usável', () => {
    expect(appliedPreviewCents({ use: true, priceReais: 120, availableCents: 1240, config: ON })).toBe(1240);
  });

  it('switch ligado mas o preço caiu abaixo do mínimo (troca de parcela/cupom): zero', () => {
    expect(appliedPreviewCents({ use: true, priceReais: 4, availableCents: 1240, config: ON })).toBe(0);
  });

  it('recurso desligado com o switch ligado de antes: zero', () => {
    expect(
      appliedPreviewCents({ use: true, priceReais: 120, availableCents: 1240, config: DEFAULT_CASHBACK_CONFIG }),
    ).toBe(0);
  });
});

describe('readCashbackCharge', () => {
  it('lê o aplicado e o cobrado da resposta', () => {
    expect(readCashbackCharge({ cashbackAppliedReais: 15, chargedReais: 5 }, 20)).toEqual({
      cashbackAppliedReais: 15,
      chargedReais: 5,
    });
  });

  it('servidor aplicou menos que a prévia: vale o que voltou', () => {
    expect(readCashbackCharge({ cashbackAppliedReais: 0, chargedReais: 20 }, 20)).toEqual({
      cashbackAppliedReais: 0,
      chargedReais: 20,
    });
  });

  it('backend antigo ou campo inválido: nada aplicado e o cobrado é o preço', () => {
    expect(readCashbackCharge({}, 20)).toEqual({ cashbackAppliedReais: 0, chargedReais: 20 });
    expect(readCashbackCharge(null, 20)).toEqual({ cashbackAppliedReais: 0, chargedReais: 20 });
    expect(readCashbackCharge({ cashbackAppliedReais: '15', chargedReais: Number.NaN }, 20)).toEqual({
      cashbackAppliedReais: 0,
      chargedReais: 20,
    });
  });
});

describe('withCashbackCharge', () => {
  it('acrescenta os campos normalizados à resposta, com o preço de fallback', () => {
    expect(withCashbackCharge({ paymentId: 'p1', amountReais: 50 })).toEqual({
      paymentId: 'p1',
      amountReais: 50,
      cashbackAppliedReais: 0,
      chargedReais: 50,
    });
    expect(
      withCashbackCharge({ paymentId: 'p1', amountReais: 50, cashbackAppliedReais: 12.4, chargedReais: 37.6 }),
    ).toEqual({ paymentId: 'p1', amountReais: 50, cashbackAppliedReais: 12.4, chargedReais: 37.6 });
  });
});
