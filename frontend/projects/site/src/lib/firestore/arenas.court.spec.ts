import { mapCourt } from './arenas';

/** Multiesporte fase 5a: o esporte da quadra cai para `types[0]`/`type`, que são o que o portal
 *  da arena e o app gravam hoje (`sport` só passa a ser gravado na 5b). */
describe('site · esporte da quadra', () => {
  it('types[0] → type → sport → courtType (types é gravado por todo escritor; sport só desde a 5b)', () => {
    expect(mapCourt('c1', { name: 'Q1', sport: 'beachVolleyball', types: ['beachTennis'] }).sport).toBe('beachTennis');
    expect(mapCourt('c1', { name: 'Q1', sport: 'beachTennis', courtType: 'Tênis' }).sport).toBe('beachTennis');
    expect(mapCourt('c1', { name: 'Q1', types: ['Vôlei de praia'], type: 'Vôlei de praia' }).sport).toBe('Vôlei de praia');
    expect(mapCourt('c1', { name: 'Q1', type: 'padel' }).sport).toBe('padel');
    expect(mapCourt('c1', { name: 'Q1' }).sport).toBeNull();
  });
});
