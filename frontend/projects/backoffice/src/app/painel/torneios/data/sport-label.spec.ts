import { sportLabel } from './tournaments.repository';

describe('backoffice · rótulo de esporte vem do catálogo', () => {
  it('conhecido, legado, desconhecido e vazio', () => {
    expect(sportLabel('indoorVolleyball')).toBe('Vôlei de quadra');
    expect(sportLabel('beach_tennis')).toBe('Beach tennis');
    expect(sportLabel('padel')).toBe('Padel');
    expect(sportLabel(null)).toBeNull();
  });
});
