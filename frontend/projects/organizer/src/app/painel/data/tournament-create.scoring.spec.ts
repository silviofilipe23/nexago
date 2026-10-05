import { categoryToMap } from './tournament-create-mapper';
import {
  categoryScoringView,
  emptyCategoryDraft,
  emptyTournamentDraft,
  patchCategoryScoring,
  scoringSportOf,
  suggestedScoringProfile,
  withSportScoring,
} from './tournament-create.model';
import { applyOrganizerCategoryDefaults, DEFAULT_ORGANIZER_EVENT_DEFAULTS } from './organizer-settings.model';

describe('placar da categoria no wizard (fase 2d2a)', () => {
  it('sugestão por esporte: 21/15, 25/15, 18/15 e games com super tie-break', () => {
    expect(suggestedScoringProfile('beachVolleyball', 'bestOf3')).toEqual(jasmine.objectContaining({ kind: 'sets_points', setTarget: 21, decidingSetTarget: 15, bestOf: 3 }));
    expect(suggestedScoringProfile('indoorVolleyball', 'bestOf3')).toEqual(jasmine.objectContaining({ setTarget: 25, decidingSetTarget: 15 }));
    expect(suggestedScoringProfile('footvolley', 'singleSet')).toEqual(jasmine.objectContaining({ setTarget: 18, bestOf: 1 }));
    expect(suggestedScoringProfile('beachTennis', 'bestOf3')).toEqual(jasmine.objectContaining({ kind: 'sets_games', decidingSet: 'super_tiebreak', noAd: true }));
  });

  it('categoria nova nasce com a sugestão do esporte', () => {
    const c = applyOrganizerCategoryDefaults(emptyCategoryDraft('c1'), DEFAULT_ORGANIZER_EVENT_DEFAULTS, 'indoorVolleyball');
    expect(c.scoringProfile).toEqual(jasmine.objectContaining({ setTarget: 25 }));
  });

  it('categoria sem perfil (torneio antigo) mostra a regra histórica e continua sem perfil', () => {
    const legacy = { ...emptyCategoryDraft('c1'), bestOf: 'bestOf3' as const, scoringProfile: null };
    expect(categoryScoringView(legacy, 'indoorVolleyball')).toEqual(jasmine.objectContaining({ kind: 'sets_points', setTarget: 21, decidingSetTarget: 15 }));
    expect('scoringProfile' in categoryToMap(legacy, emptyTournamentDraft())).toBeFalse();
  });

  it('editar o placar parte do que a categoria carimba e grava o perfil explícito', () => {
    const legacy = { ...emptyCategoryDraft('c1'), bestOf: 'bestOf3' as const, scoringProfile: null };
    const edited = patchCategoryScoring(legacy, 'indoorVolleyball', { decidingSetTarget: 11 });
    expect(edited.scoringProfile).toEqual(jasmine.objectContaining({ setTarget: 21, decidingSetTarget: 11 }));
    const bt = patchCategoryScoring({ ...emptyCategoryDraft('c2'), bestOf: 'bestOf3' as const }, 'beachTennis', { noAd: false, decidingSet: 'full' });
    expect(bt.scoringProfile).toEqual(jasmine.objectContaining({ kind: 'sets_games', noAd: false, decidingSet: 'full' }));
  });

  it('trocar o esporte refaz o perfil de quem tem; quem não tem segue sem', () => {
    const withProfile = { ...emptyCategoryDraft('c1'), bestOf: 'bestOf3' as const, scoringProfile: suggestedScoringProfile('beachVolleyball', 'bestOf3') };
    const without = { ...emptyCategoryDraft('c2'), scoringProfile: null };
    const [a, b] = withSportScoring([withProfile, without], 'beachTennis');
    expect(a!.scoringProfile).toEqual(jasmine.objectContaining({ kind: 'sets_games' }));
    expect(b!.scoringProfile).toBeNull();
  });

  it('trocar entre esportes do mesmo tipo (ou clicar no mesmo) preserva o placar editado', () => {
    const edited = patchCategoryScoring({ ...emptyCategoryDraft('c1'), bestOf: 'bestOf3' as const, scoringProfile: suggestedScoringProfile('beachVolleyball', 'bestOf3') }, 'beachVolleyball', { decidingSetTarget: 11 });
    const [same] = withSportScoring([edited], 'beachVolleyball');
    expect(same!.scoringProfile).toEqual(jasmine.objectContaining({ decidingSetTarget: 11 }));
    const [indoor] = withSportScoring([edited], 'indoorVolleyball');
    expect(indoor!.scoringProfile).toEqual(jasmine.objectContaining({ kind: 'sets_points', decidingSetTarget: 11 }));
  });

  it('o bestOf gravado no perfil acompanha o da categoria (MD5 vira 3, como no servidor)', () => {
    const c = { ...emptyCategoryDraft('c1'), bestOf: 'singleSet' as const, scoringProfile: suggestedScoringProfile('beachTennis', 'bestOf3') };
    expect((categoryToMap(c, emptyTournamentDraft())['scoringProfile'] as Record<string, unknown>)['bestOf']).toBe(1);
    const md5 = { ...c, bestOf: 'bestOf5' as const };
    expect((categoryToMap(md5, emptyTournamentDraft())['scoringProfile'] as Record<string, unknown>)['bestOf']).toBe(3);
  });

  it('esporte desconhecido (sportRaw): sem esporte de placar, categoria nova sem perfil', () => {
    expect(scoringSportOf({ sport: 'beachVolleyball', sportRaw: null })).toBe('beachVolleyball');
    expect(scoringSportOf({ sport: 'beachVolleyball', sportRaw: 'tennis' })).toBeNull();
    const c = applyOrganizerCategoryDefaults(emptyCategoryDraft('c1'), DEFAULT_ORGANIZER_EVENT_DEFAULTS, scoringSportOf({ sport: 'beachVolleyball', sportRaw: 'tennis' }) ?? undefined);
    expect(c.scoringProfile ?? null).toBeNull();
  });
});

