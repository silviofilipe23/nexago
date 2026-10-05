import {
  ARENA_SPORT_CHIP_OPTIONS,
  arenaHasIndexedSportMetadata,
  arenaMatchesSportChip,
  arenaSportLabels,
  courtDocSportLabel,
  courtSportLabel,
  defaultSportChipFromProfile,
  sportFirestoreIdFromChip,
  type ArenaListItem,
} from '@nexago/arena-discovery';

/** Multiesporte fase 5a: o esporte da quadra casa por IGUALDADE de código (rótulo legado ou código
 *  gravado), sem substring e sem o nome da arena. */
describe('esporte da arena por código', () => {
  const arena = (courtTypes: string[], name = 'Arena Central'): ArenaListItem =>
    ({ id: 'a1', name, courtTypes } as unknown as ArenaListItem);

  it('rótulo legado e código casam o mesmo chip', () => {
    expect(arenaMatchesSportChip(arena(['Beach tennis']), 'beachTennis')).toBeTrue();
    expect(arenaMatchesSportChip(arena(['beachTennis']), 'beachTennis')).toBeTrue();
    expect(arenaMatchesSportChip(arena(['Vôlei indoor']), 'volleyball')).toBeTrue();
    expect(arenaMatchesSportChip(arena(['indoorVolleyball']), 'volleyball')).toBeTrue();
  });

  it('sem substring: beach tennis não aparece em vôlei de praia (nem por "praia" no nome)', () => {
    expect(arenaMatchesSportChip(arena(['Beach tennis'], 'Praia Clube'), 'beachVolleyball')).toBeFalse();
    expect(arenaMatchesSportChip(arena(['Vôlei de praia']), 'beachTennis')).toBeFalse();
    expect(arenaMatchesSportChip(arena(['Vôlei de praia']), 'volleyball')).toBeFalse();
    expect(arenaMatchesSportChip(arena(['Tênis']), 'beachTennis')).toBeFalse();
  });

  it('futevôlei tem chip próprio e o perfil FUTEVOLEI abre nele', () => {
    expect(ARENA_SPORT_CHIP_OPTIONS.some((o) => o.chip === 'footvolley')).toBeTrue();
    expect(arenaMatchesSportChip(arena(['Futevôlei']), 'footvolley')).toBeTrue();
    expect(arenaMatchesSportChip(arena(['Futevôlei']), 'beachVolleyball')).toBeFalse();
    expect(defaultSportChipFromProfile({ primarySport: 'FUTEVOLEI' })).toBe('footvolley');
    expect(sportFirestoreIdFromChip('footvolley')).toBe('FUTEVOLEI');
  });

  it('arena sem esporte reconhecido (vazia, só superfície, só pickleball) não é filtrada', () => {
    expect(arenaHasIndexedSportMetadata(arena([]))).toBeFalse();
    expect(arenaHasIndexedSportMetadata(arena(['Areia']))).toBeFalse();
    expect(arenaMatchesSportChip(arena(['Areia']), 'tennis')).toBeTrue();
    expect(arenaMatchesSportChip(arena(['Pickleball']), 'tennis')).toBeTrue();
    expect(arenaHasIndexedSportMetadata(arena(['footvolley']))).toBeTrue();
  });

  it('rótulos para exibição: catálogo, sem duplicar código + rótulo; desconhecido segue cru', () => {
    expect(arenaSportLabels(['beachVolleyball', 'Vôlei de praia', 'Pickleball', 'Areia'])).toEqual([
      'Vôlei de praia',
      'Pickleball',
      'Areia',
    ]);
    expect(arenaSportLabels(['beachTennis', 'tennis'])).toEqual(['Beach tennis', 'Tênis']);
    expect(courtSportLabel('beachTennis')).toBe('Beach tennis');
    expect(courtSportLabel('Vôlei de praia')).toBe('Vôlei de praia');
    expect(courtSportLabel('Pickleball')).toBe('Pickleball');
    expect(courtSportLabel('')).toBe('');
  });

  it('esporte de UM doc de quadra: sport → courtType → types[0] → type, pelo catálogo', () => {
    expect(courtDocSportLabel({ sport: 'beachTennis', types: ['Tênis'] })).toBe('Beach tennis');
    expect(courtDocSportLabel({ types: ['Vôlei de praia', 'Futevôlei'], type: 'Vôlei de praia' })).toBe('Vôlei de praia');
    expect(courtDocSportLabel({ type: 'padel' })).toBe('Padel');
    expect(courtDocSportLabel({ types: ['Pickleball'] })).toBe('Pickleball');
    expect(courtDocSportLabel({})).toBe('Esporte não informado');
  });
});
