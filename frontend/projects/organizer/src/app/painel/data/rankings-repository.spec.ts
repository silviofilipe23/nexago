import { rankingEntryOf } from './ranking-positions';
import {
  athleteParticipantOf,
  bySportRankingRowOf,
  inSport,
  rankingSportOf,
  rankingProfileFromDoc,
  rankingTeamFromDoc,
  rankingTotalsFromDoc,
  teamParticipantOf,
  type RankingProfile,
} from './rankings-repository';
import { interviewProfileFromDoc } from './teams-repository';

describe('rankings-repository (mapeamento)', () => {
  it('totais: lixo vira zero', () => {
    expect(rankingTotalsFromDoc({ totalPoints: 1240, tournamentsCount: 6 })).toEqual({ points: 1240, tournaments: 6 });
    expect(rankingTotalsFromDoc({ totalPoints: '9' })).toEqual({ points: 0, tournaments: 0 });
  });

  it('esporte sai do onboarding (código) e cai no padrão do app', () => {
    expect(rankingProfileFromDoc({ sportOnboarding: { primarySportId: 'BEACH_TENNIS' }, gender: 'Feminino' })).toEqual({
      sport: 'beachTennis',
      gender: 'Feminino',
    });
    expect(rankingProfileFromDoc({}).sport).toBe('beachVolleyball');
  });

  it('atleta sem perfil (excluído) segue no ranking com o esporte padrão e gênero desconhecido', () => {
    expect(athleteParticipantOf('u1', { points: 10, tournaments: 1 }, undefined)).toEqual({
      id: 'u1',
      points: 10,
      tournaments: 1,
      sport: 'beachVolleyball',
      gender: null,
      format: null,
    });
  });

  it('time: gênero derivado do elenco, formato pelo teamSize e esporte do 1º com perfil', () => {
    const profiles = new Map<string, RankingProfile>([
      ['u2', { sport: 'beachTennis', gender: 'Feminino' }],
      ['u3', { sport: 'beachVolleyball', gender: 'f' }],
    ]);
    const team = rankingTeamFromDoc({ player1Id: 'u1', player2Id: 'u2', memberUids: ['u1', 'u2', 'u3'], teamSize: 3 });
    expect(teamParticipantOf('t1', { points: 5, tournaments: 2 }, team, profiles)).toEqual({
      id: 't1',
      points: 5,
      tournaments: 2,
      sport: 'beachTennis',
      gender: 'female',
      format: 'trio',
    });
  });

  it('dupla legada (sem memberUids) usa os dois slots', () => {
    const team = rankingTeamFromDoc({ player1Id: 'u1', player2Id: 'u2', gender: 'Masculino' });
    const p = teamParticipantOf('t1', { points: 1, tournaments: 1 }, team, new Map());
    expect(p.format).toBe('dupla');
    expect(p.gender).toBe('male');
  });
});

describe('interviewProfileFromDoc', () => {
  it('nome e foto com os fallbacks de sempre, mais cidade/UF e nível por esporte', () => {
    expect(
      interviewProfileFromDoc({
        nickname: 'Aninha',
        fullName: 'Ana Souza',
        avatarUrl: 'a.jpg',
        city: 'Goiânia',
        state: 'GO',
        sportOnboarding: { levelsBySport: { VOLEI_PRAIA: 'open', LIXO: 3 } },
        nivel: 'Intermediário',
      }),
    ).toEqual({
      name: 'Aninha',
      photoUrl: 'a.jpg',
      city: 'Goiânia',
      state: 'GO',
      levelsBySport: { VOLEI_PRAIA: 'open' },
      legacyLevel: 'Intermediário',
    });
  });
});

describe('rankings-repository (por esporte, fase 3b1)', () => {
  it('linha do doc por esporte: id do campo; sem ele, id do doc sem o sufixo do esporte', () => {
    expect(bySportRankingRowOf('a1_BEACH_TENNIS', { athleteId: 'a1', totalPoints: 800, tournamentsCount: 2 }, 'athleteId', 'BEACH_TENNIS')).toEqual({
      id: 'a1',
      totals: { points: 800, tournaments: 2 },
    });
    expect(bySportRankingRowOf('t_9_VOLEI_PRAIA', { totalPoints: 5 }, 'teamId', 'VOLEI_PRAIA').id).toBe('t_9');
  });

  it('no esporte do torneio, a posição é entre todos que pontuaram nele (esporte do perfil não recorta)', () => {
    const profiles = new Map<string, RankingProfile>([
      ['a', { sport: 'beachVolleyball', gender: 'Feminino' }],
      ['b', { sport: 'beachTennis', gender: 'Feminino' }],
    ]);
    const athletes = inSport(
      [
        athleteParticipantOf('a', { points: 900, tournaments: 3 }, profiles.get('a')),
        athleteParticipantOf('b', { points: 500, tournaments: 1 }, profiles.get('b')),
      ],
      'BEACH_TENNIS',
    );
    expect(rankingEntryOf(athletes, 'b')).toEqual({ position: 2, points: 500, tournaments: 1 });
  });

  it('esporte do ranking = código de perfil do torneio; desconhecido = null (total somado); sem torneio = undefined', () => {
    expect(rankingSportOf({ sportId: 'beachTennis' })).toBe('BEACH_TENNIS');
    expect(rankingSportOf({ sportId: 'footvolley' })).toBe('FUTEVOLEI');
    expect(rankingSportOf({ sportId: 'xadrez' })).toBeNull();
    expect(rankingSportOf(null)).toBeUndefined();
  });
});
