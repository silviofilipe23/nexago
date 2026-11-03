import {
  NO_SERVICE_FEE,
  athleteServiceFeeReais,
  cardFeeReais,
  platformServiceFeeReais,
  readCardFee,
  readCardFeePercent,
  readServiceFee,
  serviceFeeRuleFromRaw,
  type ServiceFeeRule,
} from './service-fee';

const rule = (payer: ServiceFeeRule['payer'], percent = 8, floorReais = 1.5): ServiceFeeRule => ({ percent, floorReais, payer });

describe('service-fee', () => {
  it('atleta paga a taxa inteira por cima do preço (% ou piso)', () => {
    expect(athleteServiceFeeReais(50, rule('atleta'))).toBe(4);
    expect(athleteServiceFeeReais(30, rule('atleta'))).toBe(2.4);
    // 8% de R$ 10 = R$ 0,80 → vale o piso.
    expect(athleteServiceFeeReais(10, rule('atleta'))).toBe(1.5);
  });

  it('dividido: metade arredondada para baixo (o centavo ímpar fica com o organizador)', () => {
    expect(athleteServiceFeeReais(50, rule('dividido'))).toBe(2);
    // 8% de R$ 19,37 = R$ 1,55 → metade = R$ 0,77.
    expect(athleteServiceFeeReais(19.37, rule('dividido'))).toBe(0.77);
  });

  it('organizador paga: nada por cima do preço', () => {
    expect(athleteServiceFeeReais(50, rule('organizador'))).toBe(0);
    expect(athleteServiceFeeReais(50, NO_SERVICE_FEE)).toBe(0);
  });

  it('sem preço ou sem % não há taxa; nunca passa do preço', () => {
    expect(athleteServiceFeeReais(0, rule('atleta'))).toBe(0);
    expect(athleteServiceFeeReais(50, rule('atleta', 0))).toBe(0);
    // Piso maior que o preço: sobra R$ 0,01.
    expect(platformServiceFeeReais(1, { percent: 8, floorReais: 1.5 })).toBe(0.99);
  });

  it('lê a regra da callable; fora do contrato vira "sem taxa"', () => {
    expect(serviceFeeRuleFromRaw({ percent: 8, floorReais: 1.5, payer: 'dividido' })).toEqual(rule('dividido'));
    expect(serviceFeeRuleFromRaw({ percent: 0, floorReais: 0, payer: 'organizador' })).toEqual(NO_SERVICE_FEE);
    expect(serviceFeeRuleFromRaw({ percent: 8, floorReais: 1.5, payer: 'outro' })).toEqual(NO_SERVICE_FEE);
    expect(serviceFeeRuleFromRaw(null)).toEqual(NO_SERVICE_FEE);
    expect(serviceFeeRuleFromRaw({ percent: '8', payer: 'atleta' })).toEqual({ percent: 0, floorReais: 0, payer: 'atleta' });
  });

  it('lê a taxa da resposta da cobrança; ausente é zero', () => {
    expect(readServiceFee({ serviceFeeReais: 4 })).toBe(4);
    expect(readServiceFee({})).toBe(0);
    expect(readServiceFee(null)).toBe(0);
  });

  it('taxa do cartão: % sobre os centavos do valor do cartão, arredondada (espelho do servidor)', () => {
    expect(cardFeeReais(100, 1.33)).toBe(1.33);
    // 3.000 centavos × 1,33% = 39,9 → 40 centavos.
    expect(cardFeeReais(30, 1.33)).toBe(0.4);
    expect(cardFeeReais(54, 1.33)).toBe(0.72);
  });

  it('taxa do cartão: sem valor ou sem % não há taxa', () => {
    expect(cardFeeReais(0, 1.33)).toBe(0);
    expect(cardFeeReais(50, 0)).toBe(0);
    expect(cardFeeReais(-10, 1.33)).toBe(0);
    expect(cardFeeReais(50, Number.NaN)).toBe(0);
  });

  it('lê o % da taxa do cartão; ausente ou fora do contrato é zero (backend antigo)', () => {
    expect(readCardFeePercent({ payer: 'organizador', percent: 0, floorReais: 0, cardFeePercent: 1.33 })).toBe(1.33);
    expect(readCardFeePercent({ payer: 'atleta' })).toBe(0);
    expect(readCardFeePercent({ cardFeePercent: '1.33' })).toBe(0);
    expect(readCardFeePercent({ cardFeePercent: -1 })).toBe(0);
    expect(readCardFeePercent(null)).toBe(0);
  });

  it('lê a taxa do cartão da resposta da cobrança; ausente é zero', () => {
    expect(readCardFee({ cardFeeReais: 0.72 })).toBe(0.72);
    expect(readCardFee({})).toBe(0);
    expect(readCardFee(null)).toBe(0);
  });
});
