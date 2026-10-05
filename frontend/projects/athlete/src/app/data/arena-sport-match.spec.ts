import {
  ARENA_SPORT_CHIP_OPTIONS,
  arenaSportChipCode,
  arenaHasIndexedSportMetadata,
  arenaMatchesSportChip,
  arenaSportLabels,
  courtDocSportLabel,
  courtSportLabel,
  defaultSportChipFromProfile,
  sportFirestoreIdFromChip,
  type ArenaListItem,
} from '@nexago/arena-discovery';
import { SPORT_CATALOG } from '@nexago/sports';

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

  it('esporte de UM doc de quadra: types[0] → type → sport → courtType, pelo catálogo', () => {
    // `types` é gravado por TODO escritor; `sport` só a partir da 5b. Um app sem a 5b que edite a
    // quadra atualiza `types` e deixa `sport` velho — então `types` manda.
    expect(courtDocSportLabel({ sport: 'beachVolleyball', types: ['beachTennis'] })).toBe('Beach tennis');
    expect(courtDocSportLabel({ sport: 'beachTennis', courtType: 'Tênis' })).toBe('Beach tennis');
    expect(courtDocSportLabel({ types: ['Vôlei de praia', 'Futevôlei'], type: 'Vôlei de praia' })).toBe('Vôlei de praia');
    expect(courtDocSportLabel({ type: 'padel' })).toBe('Padel');
    expect(courtDocSportLabel({ types: ['Pickleball'] })).toBe('Pickleball');
    expect(courtDocSportLabel({})).toBe('Esporte não informado');
  });

  it('trava catálogo × chips: todo esporte com quadra no catálogo tem chip (e vice-versa)', () => {
    const chipCodes = new Set(ARENA_SPORT_CHIP_OPTIONS.filter((o) => o.chip !== 'all').map((o) => arenaSportChipCode(o.chip)));
    const catalogCodes = new Set(SPORT_CATALOG.filter((e) => e.arenaCourtTypes.length > 0).map((e) => e.code));
    expect([...chipCodes].sort()).toEqual([...catalogCodes].sort());
  });
});
