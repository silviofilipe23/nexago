import {
  athleteParticipantOf,
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
