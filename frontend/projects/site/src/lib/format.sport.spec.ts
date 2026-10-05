import { sportLabel } from './format';

describe('site · rótulo de esporte vem do catálogo', () => {
  it('não chama futevôlei de "esporte de areia"', () => {
    expect(sportLabel('footvolley')).toBe('Futevôlei');
    expect(sportLabel('beachVolleyball')).toBe('Vôlei de praia');
    expect(sportLabel('padel')).toBe('Padel');
  });
});
