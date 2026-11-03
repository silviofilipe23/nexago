import {
  NO_SERVICE_FEE,
  athleteServiceFeeReais,
  cardFeeReais,
  platformServiceFeeReais,
  readCardFee,
  readCardFeePercent,
  readCardFeeTerms,
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

  const ASAAS = { anticipationPercent: 1.33, processingPercent: 2.99, fixedReais: 0.49 };
  const ONLY_ANTICIPATION = { anticipationPercent: 1.33, processingPercent: 0, fixedReais: 0 };

  it('taxas do cartão: processamento sobre o total + antecipação sobre a base (espelho do servidor)', () => {
    // (100 + 1,33 + 0,49) / 0,9701 = 104,958… → 104,96.
    expect(cardFeeReais(100, ASAAS)).toBe(4.96);
    expect(cardFeeReais(90, ASAAS)).toBe(4.52);
    expect(cardFeeReais(54.5, ASAAS)).toBe(2.93);
  });

  it('taxas do cartão: só antecipação (backend que só manda o %) dá a conta de antes', () => {
    expect(cardFeeReais(100, ONLY_ANTICIPATION)).toBe(1.33);
    // 3.000 centavos × 1,33% = 39,9 → 40 centavos.
    expect(cardFeeReais(30, ONLY_ANTICIPATION)).toBe(0.4);
    expect(cardFeeReais(54, ONLY_ANTICIPATION)).toBe(0.72);
  });

  it('taxas do cartão: sem valor ou sem termos não há taxa', () => {
    expect(cardFeeReais(0, ASAAS)).toBe(0);
    expect(cardFeeReais(50, { anticipationPercent: 0, processingPercent: 0, fixedReais: 0 })).toBe(0);
    expect(cardFeeReais(-10, ASAAS)).toBe(0);
    expect(cardFeeReais(Number.NaN, ASAAS)).toBe(0);
  });

  it('lê os termos do cartão; ausente ou fora do contrato é zero (backend antigo)', () => {
    expect(readCardFeeTerms({ cardFeePercent: 1.33, cardProcessingPercent: 2.99, cardFixedReais: 0.49 })).toEqual(ASAAS);
    expect(readCardFeeTerms({ cardFeePercent: 1.33 })).toEqual(ONLY_ANTICIPATION);
    expect(readCardFeeTerms({ cardProcessingPercent: '2.99' })).toEqual({ anticipationPercent: 0, processingPercent: 0, fixedReais: 0 });
    expect(readCardFeeTerms(null)).toEqual({ anticipationPercent: 0, processingPercent: 0, fixedReais: 0 });
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
