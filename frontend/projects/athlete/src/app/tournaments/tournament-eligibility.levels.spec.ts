import { athleteLevelRank, tournamentSportToLevelSportCode } from './tournament-eligibility';
import type { MyAthleteProfile } from '../data/my-athlete-profile-repository';

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
    expect(athleteLevelRank(p, 'footvolley')).toBe(5);
  });

  it('sem nada → 0 (permissivo)', () => {
    expect(athleteLevelRank(profile({}), 'footvolley')).toBe(0);
    expect(athleteLevelRank(null, 'footvolley')).toBe(0);
  });
});
