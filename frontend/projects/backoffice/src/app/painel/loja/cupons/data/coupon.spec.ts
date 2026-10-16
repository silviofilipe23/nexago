import {
  couponFromDoc,
  couponStatus,
  discountLabel,
  discountsFromDoc,
  generateCode,
  previewDiscountCents,
  ruleLabel,
  todaySaoPaulo,
  usageRatio,
  validityLabel,
  type Coupon,
} from './coupon';

function coupon(over: Partial<Coupon> = {}): Coupon {
  return {
    ...couponFromDoc('c1', { code: 'VERAO26', type: 'percent', value: 10, startDate: '2026-10-01', endDate: '2026-12-31', uses: 142, usageLimit: 500 }),
    ...over,
  };
}

const TODAY = '2026-10-16';

describe('coupon', () => {
  describe('couponStatus', () => {
    it('ativo dentro do prazo', () => {
      expect(couponStatus(coupon(), TODAY)).toBe('ativo');
    });

    it('agendado antes do início', () => {
      expect(couponStatus(coupon({ startDate: '2026-11-27' }), TODAY)).toBe('agendado');
    });

    it('encerrado por fim, por limite atingido ou encerramento manual', () => {
      expect(couponStatus(coupon({ endDate: '2026-10-15' }), TODAY)).toBe('encerrado');
      expect(couponStatus(coupon({ uses: 500 }), TODAY)).toBe('encerrado');
      expect(couponStatus(coupon({ ended: true, paused: true }), TODAY)).toBe('encerrado');
    });

    it('o último dia ainda vale', () => {
      expect(couponStatus(coupon({ endDate: TODAY }), TODAY)).toBe('ativo');
    });

    it('pausado ganha de agendado', () => {
      expect(couponStatus(coupon({ paused: true, startDate: '2026-11-27' }), TODAY)).toBe('pausado');
    });
  });

  it('rótulos de desconto', () => {
    expect(discountLabel({ type: 'percent', value: 10 })).toBe('10% off');
    expect(discountLabel({ type: 'fixed', value: 3000 })).toBe('R$ 30 off');
    expect(discountLabel({ type: 'fixed', value: 2990 })).toBe('R$ 29,90 off');
  });

  it('regra resume escopo e condições', () => {
    expect(ruleLabel(coupon({ scope: { type: 'collection', ids: ['verao-2026'], labels: ['Verão 26'] } }))).toBe('Coleção Verão 26');
    expect(ruleLabel(coupon({
      type: 'fixed', value: 3000, minOrderCents: 19900, maxDiscountCents: 6000,
      scope: { type: 'tournament', ids: ['t1'], labels: ['Copa Goiás'] },
    }))).toBe('Inscritos em Copa Goiás · mín. R$ 199');
    expect(ruleLabel(coupon({ maxDiscountCents: 6000 }))).toBe('Toda a loja · máx. R$ 60');
    expect(ruleLabel(coupon({ scope: { type: 'arena', ids: ['a1'], labels: ['Arena Errejota'] } }))).toBe('Retirada na Arena Errejota');
  });

  it('validade', () => {
    expect(validityLabel({ startDate: '2026-10-01', endDate: '2026-12-31' }, TODAY)).toBe('até 31 dez');
    expect(validityLabel({ startDate: '2026-11-27', endDate: '2026-11-30' }, TODAY)).toBe('27–30 nov');
    expect(validityLabel({ startDate: '2026-10-20', endDate: '2026-11-30' }, TODAY)).toBe('20 out–30 nov');
    expect(validityLabel({ startDate: '2026-10-01', endDate: null }, TODAY)).toBe('sem prazo');
    expect(validityLabel({ startDate: '2026-10-20', endDate: null }, TODAY)).toBe('a partir de 20 out');
  });

  it('barra de uso só com limite', () => {
    expect(usageRatio({ uses: 61, usageLimit: 200 })).toBeCloseTo(0.305);
    expect(usageRatio({ uses: 88, usageLimit: null })).toBeNull();
  });

  it('prévia: % com teto, fixo até o subtotal, zero abaixo do mínimo', () => {
    expect(previewDiscountCents({ type: 'percent', value: 10, maxDiscountCents: 5000, minOrderCents: null }, 20000)).toBe(2000);
    expect(previewDiscountCents({ type: 'percent', value: 50, maxDiscountCents: 5000, minOrderCents: null }, 20000)).toBe(5000);
    expect(previewDiscountCents({ type: 'fixed', value: 30000, maxDiscountCents: null, minOrderCents: null }, 20000)).toBe(20000);
    expect(previewDiscountCents({ type: 'percent', value: 10, maxDiscountCents: null, minOrderCents: 25000 }, 20000)).toBe(0);
  });

  it('hoje é o de São Paulo, não o UTC', () => {
    // 01:30 UTC de 17/10 ainda é 16/10 em São Paulo.
    expect(todaySaoPaulo(new Date('2026-10-17T01:30:00Z'))).toBe('2026-10-16');
  });

  it('código gerado sem caracteres ambíguos', () => {
    const code = generateCode(8, () => 0.999);
    expect(code).toMatch(/^[A-Z2-9]{8}$/);
    expect(generateCode(20)).not.toMatch(/[01OIL]/);
  });

  it('descontos automáticos: salvo por cima do padrão', () => {
    const rules = discountsFromDoc({ rules: [{ id: 'pix', active: false }] });
    expect(rules.map((r) => r.id)).toEqual(['pix', 'leve3pague2', 'nivel5']);
    expect(rules[0]!.active).toBeFalse();
    expect(rules[0]!.percent).toBe(5);
  });
});
