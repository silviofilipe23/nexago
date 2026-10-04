import { categoryFromMap, categoryToMap } from './tournament-create-mapper';
import {
  bracketSystemsForSport,
  emptyCategoryDraft,
  emptyTournamentDraft,
  parseTournamentSport,
  publishBlockReasonForUnsupportedBrackets,
} from './tournament-create.model';

const BT = { kind: 'sets_games', bestOf: 3, gamesPerSet: 6, winByGames: 2, tiebreakAtGames: 6, tiebreakTo: 7, noAd: true, decidingSet: 'super_tiebreak', superTiebreakTo: 10 };

describe('wizard · beach tennis aberto (fase 2d1)', () => {
  it('beach tennis é esporte conhecido, sem raw', () => {
    expect(parseTournamentSport('beachTennis')).toEqual({ sport: 'beachTennis', sportRaw: null });
  });

  it('scoringProfile da categoria faz ida e volta (o array é regravado inteiro)', () => {
    const draft = categoryFromMap({ id: 'c1', categoryName: 'Open', bracketFormat: 'single_elimination', maxTeams: 16, scoringProfile: BT })!;
    expect(draft.scoringProfile).toEqual(BT);
    expect(categoryToMap(draft, emptyTournamentDraft())['scoringProfile']).toEqual(BT);
  });

  it('categoria sem perfil continua sem perfil', () => {
    const draft = categoryFromMap({ id: 'c1', categoryName: 'Open', bracketFormat: 'single_elimination', maxTeams: 16 })!;
    expect('scoringProfile' in categoryToMap(draft, emptyTournamentDraft())).toBeFalse();
  });

  it('KOTC só aparece em vôlei de praia', () => {
    expect(bracketSystemsForSport('beachVolleyball')).toContain('kingOfCourt');
    expect(bracketSystemsForSport('beachTennis')).not.toContain('kingOfCourt');
    expect(bracketSystemsForSport('footvolley')).not.toContain('kingOfCourt');
  });

  it('KOTC fora do vôlei de praia bloqueia a publicação; em vôlei de praia não', () => {
    const koc = { ...emptyCategoryDraft('c1'), name: 'Rei', bracketSystem: 'kingOfCourt' as const };
    expect(publishBlockReasonForUnsupportedBrackets({ ...emptyTournamentDraft(), sport: 'beachTennis', categories: [koc] })).toBe(
      'A categoria "Rei" usa King of the Court, que por enquanto é só para vôlei de praia.',
    );
    expect(publishBlockReasonForUnsupportedBrackets({ ...emptyTournamentDraft(), sport: 'beachVolleyball', categories: [koc] })).toBe('');
  });
});
