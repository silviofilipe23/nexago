import { couponFromDoc } from './coupon';
import { duplicateForm, emptyCouponForm, formFromCoupon, validateCouponForm } from './coupon-form';

describe('coupon-form', () => {
  const TODAY = '2026-10-16';

  it('form vazio começa hoje, sem prazo, 1 uso por atleta e acumulando Pix', () => {
    const f = emptyCouponForm(TODAY);
    expect(f.startDate).toBe(TODAY);
    expect(f.endDate).toBe('');
    expect(f.onePerAthlete && f.stacksWithPix && !f.appOnly).toBeTrue();
  });

  it('monta o payload do desenho (RACHA10)', () => {
    const r = validateCouponForm({
      ...emptyCouponForm(TODAY),
      code: ' racha10',
      value: '10',
      max: '50,00',
      minOrder: '150,00',
      usageLimit: '300',
      startDate: '2026-10-20',
      endDate: '2026-11-30',
    });
    expect(r.ok).toBeTrue();
    if (r.ok) {
      expect(r.payload).toEqual(jasmine.objectContaining({
        code: 'RACHA10', type: 'percent', value: 10, maxDiscountCents: 5000, minOrderCents: 15000,
        usageLimit: 300, endDate: '2026-11-30', scope: { type: 'store', ids: [], labels: [] },
      }));
    }
  });

  it('valor fixo vira centavos e ignora o máximo', () => {
    const r = validateCouponForm({ ...emptyCouponForm(TODAY), code: 'COPA30', type: 'fixed', value: '30,00', max: '99' });
    expect(r.ok && r.payload.value === 3000 && r.payload.maxDiscountCents === null).toBeTrue();
  });

  it('erros por campo', () => {
    const r = validateCouponForm({
      ...emptyCouponForm(TODAY),
      code: 'a b',
      value: '120',
      scopeType: 'category',
      usageLimit: '0',
      endDate: '2026-10-01',
    });
    expect(r.ok).toBeFalse();
    if (!r.ok) {
      expect(Object.keys(r.errors).sort()).toEqual(['code', 'endDate', 'scope', 'usageLimit', 'value']);
    }
  });

  it('editar e duplicar partem do cupom salvo', () => {
    const c = couponFromDoc('c1', {
      code: 'VERAO26', type: 'fixed', value: 3000, startDate: '2026-09-01', endDate: '2026-10-10',
      scope: { type: 'collection', ids: ['verao-2026'], labels: ['Verão 2026'] }, uses: 5,
    });
    expect(formFromCoupon(c).value).toBe('30,00');
    const dup = duplicateForm(c, 'NOVO1234', TODAY);
    expect(dup.code).toBe('NOVO1234');
    expect(dup.startDate).toBe(TODAY);
    // Fim já passado não faz sentido na cópia.
    expect(dup.endDate).toBe('');
    expect(dup.scopeIds).toEqual(['verao-2026']);
  });
});
