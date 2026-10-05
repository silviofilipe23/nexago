import { categoryFromMap } from './tournament-create-mapper';
import {
  disputeOptionsForSport,
  disputeSpotsStep,
  emptyCategoryDraft,
  withSportDisputes,
} from './tournament-create.model';

describe('categoria individual no wizard (fase 4b1)', () => {
  it('tipos de disputa vêm de allowedTeamSizes do esporte', () => {
    expect(disputeOptionsForSport('tennis')).toEqual(['individual', 'dupla']);
    expect(disputeOptionsForSport('beachVolleyball')).toEqual(['dupla', 'trio', 'quarteto', 'quinteto']);
    expect(disputeOptionsForSport('beachTennis')).toEqual(['dupla', 'trio', 'quarteto', 'quinteto']);
  });

  it('trocar para esporte sem individual leva a categoria individual para dupla', () => {
    const solo = { ...emptyCategoryDraft('c1'), dispute: 'individual' as const };
    const trio = { ...emptyCategoryDraft('c2'), dispute: 'trio' as const, genderFree: true };
    const [a, b] = withSportDisputes([solo, trio], 'beachVolleyball');
    expect(a!.dispute).toBe('dupla');
    expect(b!.dispute).toBe('trio');
    expect(b!.genderFree).toBeTrue();
    const [c] = withSportDisputes([trio], 'tennis');
    expect(c!.dispute).toBe('dupla');
    expect(c!.genderFree).toBeFalse();
  });

  it('vagas: dupla anda de 2 em 2; individual e equipe de 1 em 1', () => {
    expect(disputeSpotsStep('dupla')).toBe(2);
    expect(disputeSpotsStep('individual')).toBe(1);
    expect(disputeSpotsStep('trio')).toBe(1);
  });

  it('teamSize 1 explícito sem disputeType carrega como individual (não regrava dupla)', () => {
    expect(categoryFromMap({ id: 'c1', teamSize: 1 })?.dispute).toBe('individual');
    expect(categoryFromMap({ id: 'c2' })?.dispute).toBe('dupla');
  });

  it('troca de esporte não mexe no tipo de categoria travada (torneio publicado)', () => {
    const solo = { ...emptyCategoryDraft('c1'), dispute: 'individual' as const };
    const novo = { ...emptyCategoryDraft('c2'), dispute: 'individual' as const };
    const [a, b] = withSportDisputes([solo, novo], 'beachVolleyball', new Set(['c1']));
    expect(a!.dispute).toBe('individual');
    expect(b!.dispute).toBe('dupla');
  });
});
