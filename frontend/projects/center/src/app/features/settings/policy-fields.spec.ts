import { DEFAULT_POLICIES } from '../../domain/models';
import { applyChoice, applyNumber, changedPolicies, choiceValue, policiesError, POLICY_ROWS } from './policy-fields';

describe('policy-fields', () => {
  it('cobre todas as políticas do modelo', () => {
    const keys: string[] = POLICY_ROWS.map((r) => r.key as string).sort();
    expect(keys).toEqual(Object.keys(DEFAULT_POLICIES).sort());
  });

  it('applyChoice preserva boolean e string', () => {
    const a = applyChoice(DEFAULT_POLICIES, 'allowPause', 'false');
    expect(a.allowPause).toBe(false);
    expect(choiceValue(a, 'allowPause')).toBe('false');
    const b = applyChoice(DEFAULT_POLICIES, 'activation', 'on_confirmation');
    expect(b.activation).toBe('on_confirmation');
    expect(DEFAULT_POLICIES.allowPause).toBe(true);
  });

  it('changedPolicies lista só o que mudou', () => {
    const next = applyNumber(applyChoice(DEFAULT_POLICIES, 'makeupScope', 'any_class'), 'makeupValidityDays', '45');
    expect(changedPolicies(DEFAULT_POLICIES, next).sort()).toEqual(['makeupScope', 'makeupValidityDays']);
    expect(changedPolicies(DEFAULT_POLICIES, { ...DEFAULT_POLICIES })).toEqual([]);
  });

  it('policiesError rejeita vazio, fração e fora da faixa', () => {
    expect(policiesError(DEFAULT_POLICIES)).toBeNull();
    expect(policiesError(applyNumber(DEFAULT_POLICIES, 'makeupValidityDays', ''))).toContain('Validade da reposição');
    expect(policiesError(applyNumber(DEFAULT_POLICIES, 'pendingHoldHours', '1.5'))).not.toBeNull();
    expect(policiesError(applyNumber(DEFAULT_POLICIES, 'pauseMaxDaysPerYear', '400'))).not.toBeNull();
    expect(policiesError(applyNumber(DEFAULT_POLICIES, 'excusedNoticeHours', '0'))).toBeNull();
  });

  it('travelBufferMinutes aceita 0 (sem aviso) até 240 min', () => {
    expect(policiesError(applyNumber(DEFAULT_POLICIES, 'travelBufferMinutes', '0'))).toBeNull();
    expect(policiesError(applyNumber(DEFAULT_POLICIES, 'travelBufferMinutes', '241'))).toContain('locais diferentes');
  });
});
