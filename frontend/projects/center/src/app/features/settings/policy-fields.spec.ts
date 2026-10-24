import { DEFAULT_POLICIES } from '../../domain/models';
import {
  ALL_POLICY_ROWS,
  applyChoice,
  applyNumber,
  changedPolicies,
  choiceValue,
  EXIT_SECTIONS,
  numberChoiceOptions,
  policiesError,
  POLICY_ROWS,
  rowVisible,
  toggleRetention,
  type NumberChoiceRow,
} from './policy-fields';

describe('policy-fields', () => {
  it('cobre todas as políticas do modelo, cada uma numa aba só', () => {
    const keys: string[] = ALL_POLICY_ROWS.map((r) => r.key as string).sort();
    expect(keys).toEqual(Object.keys(DEFAULT_POLICIES).sort());
    const exitKeys = EXIT_SECTIONS.flatMap((s) => s.rows.map((r) => r.key as string));
    expect(POLICY_ROWS.some((r) => exitKeys.includes(r.key as string))).toBeFalse();
    expect(EXIT_SECTIONS.map((s) => s.title)).toEqual(['Trancamento', 'Pausa por lesão', 'Cancelamento', 'Lista de espera']);
  });

  it('retenção: liga/desliga mantendo a ordem e conta como mudança', () => {
    const none = toggleRetention(toggleRetention(DEFAULT_POLICIES, 'pause'), 'plan_change');
    expect(none.cancelRetention).toEqual([]);
    const back = toggleRetention(toggleRetention(none, 'plan_change'), 'pause');
    expect(back.cancelRetention).toEqual(['pause', 'plan_change']);
    expect(changedPolicies(DEFAULT_POLICIES, none)).toEqual(['cancelRetention']);
    expect(changedPolicies(DEFAULT_POLICIES, back)).toEqual([]);
    expect(DEFAULT_POLICIES.cancelRetention).toEqual(['pause', 'plan_change']);
  });

  it('desconto de 1 mês: entra na ordem canônica e o percentual só aparece com ele ligado', () => {
    const rows = EXIT_SECTIONS.find((s) => s.title === 'Cancelamento')!.rows;
    const percent = rows.find((r) => r.key === 'retentionDiscountPercent') as NumberChoiceRow;
    expect(rowVisible(percent, DEFAULT_POLICIES)).toBeFalse();
    const on = toggleRetention(DEFAULT_POLICIES, 'discount');
    expect(on.cancelRetention).toEqual(['pause', 'plan_change', 'discount']);
    expect(rowVisible(percent, on)).toBeTrue();
    expect(numberChoiceOptions(on, percent).map((o) => o.label)).toEqual(['10%', '20%', '30%', '50%']);
    const next = applyNumber(on, 'retentionDiscountPercent', '30');
    expect(changedPolicies(DEFAULT_POLICIES, next).sort()).toEqual(['cancelRetention', 'retentionDiscountPercent']);
    expect(toggleRetention(toggleRetention(on, 'pause'), 'pause').cancelRetention).toEqual(['pause', 'plan_change', 'discount']);
  });

  it('alta médica: fica na pausa por lesão e o texto explica quando é pedida', () => {
    const injury = EXIT_SECTIONS.find((s) => s.title === 'Pausa por lesão')!.rows;
    const row = injury.find((r) => r.key === 'requireMedicalClearance')!;
    expect(rowVisible(row, DEFAULT_POLICIES)).toBeTrue();
    const on = applyChoice(DEFAULT_POLICIES, 'requireMedicalClearance', 'true');
    expect(on.requireMedicalClearance).toBeTrue();
    expect(row.hint(on)).toBe('Pedida 3 dias antes do fim; sem alta aprovada a pausa segue');
    expect(choiceValue(DEFAULT_POLICIES, 'requireMedicalClearance')).toBe('false');
  });

  it('número com opções mostra também um valor antigo fora da lista', () => {
    const row = EXIT_SECTIONS[0]!.rows.find((r) => r.key === 'pauseMinDays') as NumberChoiceRow;
    expect(numberChoiceOptions(DEFAULT_POLICIES, row).map((o) => o.value)).toEqual(['7', '15']);
    expect(numberChoiceOptions({ ...DEFAULT_POLICIES, pauseMinDays: 10 }, row).map((o) => o.label)).toEqual(['7 dias', '10 dias', '15 dias']);
    const next = applyNumber(DEFAULT_POLICIES, 'pauseMinDays', '15');
    expect(next.pauseMinDays).toBe(15);
    expect(changedPolicies(DEFAULT_POLICIES, applyChoice(next, 'injuryPauseApproval', 'auto')).sort()).toEqual(['injuryPauseApproval', 'pauseMinDays']);
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
