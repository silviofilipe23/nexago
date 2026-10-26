import {
  NO_SERVICE_FEE,
  athleteServiceFeeReais,
  platformServiceFeeReais,
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
});
