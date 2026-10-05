import { courtTypeLabels, sportLabel } from './format';

describe('site · rótulo de esporte vem do catálogo', () => {
  it('não chama futevôlei de "esporte de areia"', () => {
    expect(sportLabel('footvolley')).toBe('Futevôlei');
    expect(sportLabel('beachVolleyball')).toBe('Vôlei de praia');
    expect(sportLabel('padel')).toBe('Padel');
  });
});

/** Multiesporte fase 5a: `courtTypes` da arena pode ter rótulo legado OU código do esporte. */
describe('courtTypeLabels', () => {
  it('exibe o rótulo do catálogo, sem duplicar código + rótulo; desconhecido segue cru', () => {
    expect(courtTypeLabels(['beachTennis', 'Beach tennis', 'Vôlei de praia', 'Areia'])).toEqual([
      'Beach tennis',
      'Vôlei de praia',
      'Areia',
    ]);
    expect(courtTypeLabels(['footvolley'])).toEqual(['Futevôlei']);
    expect(courtTypeLabels([])).toEqual([]);
  });
});
