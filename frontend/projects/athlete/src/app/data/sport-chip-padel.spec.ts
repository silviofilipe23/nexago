import { defaultSportChipFromProfile, sportFirestoreIdFromChip } from '@nexago/arena-discovery';

/** Padel virou esporte de perfil (multiesporte 3c2): o chip de arena e o código do perfil
 *  passam a se reconhecer nos dois sentidos. */
describe('chip de arena × padel', () => {
  it('perfil com PADEL abre no chip de padel, mesmo com `sport` legado de outro esporte', () => {
    expect(defaultSportChipFromProfile({ primarySport: 'PADEL', sport: 'Vôlei' })).toBe('padel');
  });

  it('chip de padel → código de perfil PADEL', () => {
    expect(sportFirestoreIdFromChip('padel')).toBe('PADEL');
    expect(sportFirestoreIdFromChip('all')).toBeNull();
  });
});
