import type { Enrollment } from '../../domain/models';
import { contractsByPlan, planDraftError, planRule } from './plan-view';

describe('plan-view', () => {
  it('regra do mensal e do pacote', () => {
    expect(planRule({ type: 'monthly', classesPerWeek: 2, makeupsPerMonth: 1, credits: null, validityDays: null })).toBe('2x/semana · 1 reposição/mês');
    expect(planRule({ planType: 'monthly', classesPerWeek: 3, makeupsPerMonth: 2, credits: null, validityDays: null })).toBe('3x/semana · 2 reposições/mês');
    expect(planRule({ type: 'class_pack', classesPerWeek: null, makeupsPerMonth: null, credits: 8, validityDays: 60 })).toBe('8 créditos · validade 60 dias');
  });

  it('conta só matrículas que ocupam vaga e junta preços contratados', () => {
    const e = (status: Enrollment['status'], planId: string | null, price: number | null) =>
      ({ status, planId, contract: price == null ? null : { priceCents: price } }) as Enrollment;
    const m = contractsByPlan([
      e('active', 'p1', 32000),
      e('paused', 'p1', 30000),
      e('pending', 'p1', 32000),
      e('cancelled', 'p1', 32000),
      e('waitlisted', 'p1', null),
      e('active', null, 1000),
    ]);
    expect(m.get('p1')).toEqual({ count: 3, prices: [30000, 32000] });
    expect(m.size).toBe(1);
  });
});

describe('planDraftError', () => {
  const base = { name: 'Mensal 2x', type: 'monthly' as const, priceCents: 32000, classesPerWeek: 2, makeupsPerMonth: 1, credits: 0, validityDays: 0 };

  it('aceita mensal e pacote válidos', () => {
    expect(planDraftError(base, true)).toBeNull();
    expect(planDraftError({ ...base, type: 'class_pack', credits: 8, validityDays: 60 }, true)).toBeNull();
  });

  it('preço só é exigido na criação', () => {
    expect(planDraftError({ ...base, priceCents: null }, true)).toBe('Informe um preço válido.');
    expect(planDraftError({ ...base, priceCents: null }, false)).toBeNull();
  });

  it('valida regras do tipo', () => {
    expect(planDraftError({ ...base, classesPerWeek: 0 }, false)).toContain('Aulas por semana');
    expect(planDraftError({ ...base, type: 'class_pack', credits: 8, validityDays: 0 }, false)).toContain('Validade');
    expect(planDraftError({ ...base, name: ' ' }, false)).toBe('Dê um nome ao plano.');
  });
});
