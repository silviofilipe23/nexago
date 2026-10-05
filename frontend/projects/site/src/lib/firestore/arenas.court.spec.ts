import { mapCourt } from './arenas';

/** Multiesporte fase 5a: o esporte da quadra cai para `types[0]`/`type`, que são o que o portal
 *  da arena e o app gravam hoje (`sport` só passa a ser gravado na 5b). */
describe('site · esporte da quadra', () => {
  it('sport → courtType → types[0] → type', () => {
    expect(mapCourt('c1', { name: 'Q1', sport: 'beachTennis', types: ['Tênis'] }).sport).toBe('beachTennis');
    expect(mapCourt('c1', { name: 'Q1', types: ['Vôlei de praia'], type: 'Vôlei de praia' }).sport).toBe('Vôlei de praia');
    expect(mapCourt('c1', { name: 'Q1', type: 'padel' }).sport).toBe('padel');
    expect(mapCourt('c1', { name: 'Q1' }).sport).toBeNull();
  });
});
