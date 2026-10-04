import {
  SPORT_CATALOG,
  normalizeSportKey,
  resolveSport,
  sportLabel,
  titleCaseSportCode,
} from '@nexago/sports';
import {
  SPORT_NORMALIZE_VECTORS,
  SPORT_RESOLVE_VECTORS,
  SPORT_TITLE_CASE_VECTORS,
} from '../../../../../../shared/sports/vectors.generated';
import { ATHLETE_SPORT_CODES, athleteSportLabel, tournamentSportToLevelSportCode } from '@nexago/levels';
import { SPORTS_WITH_COVER_ART, tournamentCoverArt } from '@nexago/tournament-covers';
import { leagueSportLabel } from '@nexago/leagues';

describe('@nexago/sports · vetores compartilhados com functions e app', () => {
  it('normaliza', () => {
    for (const [input, want] of SPORT_NORMALIZE_VECTORS) expect(normalizeSportKey(input)).withContext(input).toBe(want);
  });
  it('resolve', () => {
    for (const [input, want] of SPORT_RESOLVE_VECTORS) expect(resolveSport(input)?.code ?? null).withContext(input).toBe(want);
  });
  it('title case', () => {
    for (const [input, want] of SPORT_TITLE_CASE_VECTORS) expect(titleCaseSportCode(input)).withContext(input).toBe(want);
  });
  it('rótulo: conhecido, desconhecido e vazio', () => {
    expect(sportLabel('beach_tennis')).toBe('Beach tennis');
    expect(sportLabel('padel')).toBe('Padel');
    expect(sportLabel('')).toBeNull();
  });
});

describe('pacotes compartilhados leem do catálogo', () => {
  it('@nexago/levels', () => {
    expect([...ATHLETE_SPORT_CODES]).toEqual(SPORT_CATALOG.map((s) => s.profileCode));
    expect(tournamentSportToLevelSportCode('beach_tennis')).toBe('BEACH_TENNIS');
    expect(athleteSportLabel('FUTEVOLEI')).toBe('Futevôlei');
    expect(athleteSportLabel('XADREZ')).toBe('Xadrez');
  });

  it('@nexago/tournament-covers', () => {
    expect(tournamentCoverArt('beach_tennis')).toBe('/media/tournament-covers/beach_tennis.webp');
    expect(tournamentCoverArt('tennis')).toBe('/media/tournament-covers/tenis.webp');
    expect(tournamentCoverArt('other')).toBeNull();
    expect(SPORTS_WITH_COVER_ART).toContain('beachVolleyball');
  });

  it('@nexago/leagues', () => {
    expect(leagueSportLabel('beachTennis')).toBe('Beach tennis');
    expect(leagueSportLabel(null)).toBe('Esporte');
  });
});
