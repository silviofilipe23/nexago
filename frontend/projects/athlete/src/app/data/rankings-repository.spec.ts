import { pointsForPeriod, rankingBySportRowFromDoc } from './rankings-repository';
import { athletePublicProfileFromDoc, levelForSport } from './public-profiles-repository';

describe('rankingBySportRowFromDoc', () => {
  it('lê o id do atleta do campo, não do id do doc ({id}_{CODE})', () => {
    const row = rankingBySportRowFromDoc('a1_BEACH_TENNIS', {
      athleteId: 'a1',
      sport: 'BEACH_TENNIS',
      totalPoints: 800,
      tournamentsCount: 2,
      pointsByYear: { '2026': 500, '2025': 300 },
    }, 'athleteId', 'BEACH_TENNIS');
    expect(row).toEqual({ id: 'a1', totalPoints: 800, tournamentsCount: 2, pointsByYear: { '2026': 500, '2025': 300 } });
  });

  it('sem o campo, tira o sufixo do esporte (código com "_" no meio)', () => {
    expect(rankingBySportRowFromDoc('tA_x_VOLEI_PRAIA', { totalPoints: 10 }, 'teamId', 'VOLEI_PRAIA').id).toBe('tA_x');
  });

  it('campos ausentes ou de outro tipo viram zero/vazio', () => {
    const row = rankingBySportRowFromDoc('a1_FUTEVOLEI', { athleteId: 'a1', pointsByYear: { '2026': 'x', '2025': 40 } }, 'athleteId', 'FUTEVOLEI');
    expect(row.totalPoints).toBe(0);
    expect(row.tournamentsCount).toBe(0);
    expect(row.pointsByYear).toEqual({ '2025': 40 });
  });
});

describe('pointsForPeriod', () => {
  const row = { id: 'a1', totalPoints: 800, tournamentsCount: 2, pointsByYear: { '2026': 500, '2025': 300 } };

  it('geral = total; temporada = pontos do ano (0 sem pontos no ano)', () => {
    expect(pointsForPeriod(row, 'geral', 2026)).toBe(800);
    expect(pointsForPeriod(row, 'temporada', 2026)).toBe(500);
    expect(pointsForPeriod(row, 'temporada', 2024)).toBe(0);
  });
});

describe('levelForSport', () => {
  it('nível do esporte escolhido; sem ele, o global (não o do esporte principal)', () => {
    const profile = athletePublicProfileFromDoc('a1', {
      level: 'iniciante_2',
      sportOnboarding: { primarySportId: 'BEACH_TENNIS', levelsBySport: { BEACH_TENNIS: 'open', VOLEI_PRAIA: 'intermediario_1' } },
    });
    expect(levelForSport(profile, 'VOLEI_PRAIA')).toBe('intermediario_1');
    expect(levelForSport(profile, 'BEACH_TENNIS')).toBe('open');
    expect(levelForSport(profile, 'FUTEVOLEI')).toBe('iniciante_2');
  });
});
