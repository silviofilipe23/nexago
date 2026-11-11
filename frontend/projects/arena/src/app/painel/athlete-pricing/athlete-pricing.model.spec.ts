import {
  athletePricingFormError,
  athletePricingFormFromArena,
  athletePricingPayload,
  athletePricingValueLabel,
  memberHoursPolicyFromArena,
  parseMoneyOrPercent,
  type AthletePricingForm,
} from './athlete-pricing.model';

function form(overrides: Partial<AthletePricingForm> = {}): AthletePricingForm {
  return {
    student: { enabled: true, label: 'Aluno', mode: 'fixed', value: '100', autoFromClasses: false },
    professor: { enabled: false, label: 'Professor', mode: 'percent', value: '', autoFromClasses: false },
    ...overrides,
  };
}

describe('preço por perfil (portal)', () => {
  it('arena sem config: os dois perfis desligados com o nome padrão', () => {
    const f = athletePricingFormFromArena({});
    expect(f.student).toEqual({ enabled: false, label: 'Aluno', mode: 'fixed', value: '', autoFromClasses: false });
    expect(f.professor.label).toBe('Professor');
  });

  it('lê a config gravada', () => {
    const f = athletePricingFormFromArena({
      athletePricing: {
        student: { enabled: true, mode: 'fixed', pricePerHourReais: 100 },
        professor: { enabled: true, mode: 'percent', discountPercent: 20, label: 'Professor de outro esporte' },
      },
    });
    expect(f.student.value).toBe('100');
    expect(f.professor).toEqual({
      enabled: true,
      label: 'Professor de outro esporte',
      mode: 'percent',
      value: '20',
      autoFromClasses: false,
    });
  });

  it('entende valor em reais com vírgula', () => {
    expect(parseMoneyOrPercent('R$ 99,90')).toBe(99.9);
    expect(parseMoneyOrPercent('1.200,00')).toBe(1200);
    expect(parseMoneyOrPercent('')).toBeNull();
    expect(parseMoneyOrPercent('0')).toBeNull();
  });

  it('só valida perfil ligado', () => {
    expect(athletePricingFormError(form())).toBeNull();
    expect(athletePricingFormError(form({ student: { enabled: true, label: 'Aluno', mode: 'fixed', value: '', autoFromClasses: false } }))).toContain('Aluno');
    expect(
      athletePricingFormError(
        form({ professor: { enabled: true, label: 'Professor', mode: 'percent', value: '95', autoFromClasses: false } }),
      ),
    ).toContain('90%');
  });

  it('monta o payload da callable', () => {
    const p = athletePricingPayload('a1', form());
    expect(p).toEqual({
      arenaId: 'a1',
      student: {
        enabled: true,
        label: 'Aluno',
        mode: 'fixed',
        pricePerHourReais: 100,
        discountPercent: null,
        autoFromClasses: false,
      },
      professor: { enabled: false, label: 'Professor', mode: 'percent', pricePerHourReais: null, discountPercent: null },
    });
  });

  it('aluno pela matrícula: lê, só no Aluno, e vai no payload', () => {
    const f = athletePricingFormFromArena({
      athletePricing: {
        student: { enabled: true, mode: 'fixed', pricePerHourReais: 100, autoFromClasses: true },
        professor: { enabled: true, mode: 'percent', discountPercent: 10, autoFromClasses: true },
      },
    });
    expect(f.student.autoFromClasses).toBeTrue();
    expect(f.professor.autoFromClasses).toBeFalse();
    const p = athletePricingPayload('a1', f) as { student: Record<string, unknown>; professor: Record<string, unknown> };
    expect(p.student['autoFromClasses']).toBeTrue();
    expect('autoFromClasses' in p.professor).toBeFalse();
  });

  it('mensalista: desligado por padrão; inadimplente barrado por padrão', () => {
    expect(memberHoursPolicyFromArena(null)).toEqual({ enabled: false, blockWhenOverdue: true });
    expect(memberHoursPolicyFromArena({ memberHoursBank: { enabled: true, blockWhenOverdue: false } })).toEqual({
      enabled: true,
      blockWhenOverdue: false,
    });
  });

  it('rótulo do valor', () => {
    expect(athletePricingValueLabel(form().student)).toBe('R$ 100,00/h');
    expect(athletePricingValueLabel({ enabled: true, label: 'P', mode: 'percent', value: '20', autoFromClasses: false })).toBe('20% de desconto');
  });
});
