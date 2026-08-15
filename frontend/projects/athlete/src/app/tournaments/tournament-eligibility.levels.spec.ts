import { athleteLevelRank, evaluateCategoryEligibility, tournamentSportToLevelSportCode } from './tournament-eligibility';
import type { MyAthleteProfile } from '../data/my-athlete-profile-repository';
import type { TournamentCategoryOffer } from '../data/tournaments-repository';

function profile(overrides: Partial<MyAthleteProfile>): MyAthleteProfile {
  return {
    gender: null,
    birthDate: null,
    level: null,
    levelsBySport: {},
    fullName: null,
    nickname: null,
    profilePhotoUrl: null,
    ...overrides,
  };
}

function offer(overrides: Partial<TournamentCategoryOffer>): TournamentCategoryOffer {
  return {
    id: 'cat-1',
    categoryName: 'Categoria teste',
    entryFee: 0,
    maxTeams: 16,
    spotsLeft: 16,
    level: null,
    minLevel: null,
    genderType: 'Mix',
    teamSize: null,
    genderFree: false,
    genderComposition: null,
    bracketFormat: 'single elimination',
    registrationClosed: false,
    isCompleted: false,
    prizes: [],
    qualifiersPerGroup: 2,
    uniformType: null,
    uniformNumberOnShirt: false,
    uniformNameOnShirt: false,
    uniformSizeOptionsTop: [],
    uniformSizeOptionsShorts: [],
    ageBand: null,
    ageRestrictionMode: null,
    ageMinYears: null,
    ageMaxYears: null,
    ageReference: null,
    ...overrides,
  };
}

describe('tournamentSportToLevelSportCode', () => {
  it('mapeia todos os esportes de torneio para o código do perfil', () => {
    expect(tournamentSportToLevelSportCode('beachVolleyball')).toBe('VOLEI_PRAIA');
    expect(tournamentSportToLevelSportCode('indoorVolleyball')).toBe('VOLEI_QUADRA');
    expect(tournamentSportToLevelSportCode('footvolley')).toBe('FUTEVOLEI');
    expect(tournamentSportToLevelSportCode('beachTennis')).toBe('BEACH_TENNIS');
    expect(tournamentSportToLevelSportCode('xadrez')).toBeNull();
    expect(tournamentSportToLevelSportCode(null)).toBeNull();
  });
});

describe('athleteLevelRank (por esporte → global → 0)', () => {
  it('usa o nível de FUTEVOLEI em torneios de footvolley', () => {
    const p = profile({
      level: 'Iniciante 1',
      levelsBySport: { FUTEVOLEI: 'intermediario_2' },
    });
    expect(athleteLevelRank(p, 'footvolley')).toBe(3);
  });

  it('cai no nível global quando o esporte não tem entrada', () => {
    const p = profile({ level: 'Open', levelsBySport: { VOLEI_PRAIA: 'iniciante_1' } });
    expect(athleteLevelRank(p, 'footvolley')).toBe(6);
  });

  it('sem nada → 0 (permissivo)', () => {
    expect(athleteLevelRank(profile({}), 'footvolley')).toBe(0);
    expect(athleteLevelRank(null, 'footvolley')).toBe(0);
  });
});

describe('evaluateCategoryEligibility — piso de nível (minLevel)', () => {
  it('piso: Intermediário 2 é barrado da Elite (mín. Avançado 1), Avançado 1 entra', () => {
    const elite = offer({ level: 'Open', minLevel: 'Avançado 1' });
    const int2 = profile({ levelsBySport: { VOLEI_PRAIA: 'intermediario_2' } });
    const av1 = profile({ levelsBySport: { VOLEI_PRAIA: 'avancado_1' } });
    const opts = { tournamentSport: 'beachVolleyball', tournamentStart: null };
    expect(evaluateCategoryEligibility(elite, int2, opts).status).toBe('belowMinLevel');
    expect(evaluateCategoryEligibility(elite, av1, opts).status).toBe('eligible');
  });

  it('sem minLevel nada muda (retrocompat)', () => {
    const livre = offer({ level: 'Open', minLevel: null });
    const ini = profile({ levelsBySport: { VOLEI_PRAIA: 'iniciante_1' } });
    expect(evaluateCategoryEligibility(livre, ini, { tournamentSport: 'beachVolleyball', tournamentStart: null }).status).toBe(
      'eligible',
    );
  });

  // Regressão do Task 6: a mensagem de teto (belowLevel) combinava o `levelLabelForRank` COMPARTILHADO
  // (7 degraus) com o rank do atleta calculado pela escada LOCAL de 5 degraus — um atleta Open (rank
  // local 5) virava "Avançado 2" na mensagem. Corrigido ao levar o espelho local pra 7 degraus.
  it('regressão: atleta Open abaixo do teto vê "Open" na mensagem de belowLevel, não "Avançado 2"', () => {
    const categoriaBaixa = offer({ level: 'Intermediário 1' });
    const atletaOpen = profile({ levelsBySport: { VOLEI_PRAIA: 'open' } });
    const result = evaluateCategoryEligibility(categoriaBaixa, atletaOpen, {
      tournamentSport: 'beachVolleyball',
      tournamentStart: null,
    });
    expect(result.status).toBe('belowLevel');
    expect(result.message).toContain('Open');
    expect(result.message).not.toContain('Avançado 2');
  });
});
