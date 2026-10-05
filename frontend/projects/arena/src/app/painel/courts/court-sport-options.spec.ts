import { courtTypeOptionsFor } from '@nexago/arena-discovery';
import { ARENA_SPORT_OPTIONS } from '../data/arena-profile.model';
import { arenaProfileFromDoc } from '../profile/arena-profile-repository';
import { courtFromRaw } from './courts-repository';

/** Multiesporte fase 5a: o portal da arena lê código (`beachTennis`) ou rótulo legado e mostra a
 *  opção do chip — sem esconder o código nem duplicar ao salvar. Espelha `courtTypeOptionsFor`
 *  do app. */
describe('esporte da quadra no portal da arena', () => {
  it('valores gravados viram as opções do chip, sem repetir; desconhecido segue cru', () => {
    expect(courtTypeOptionsFor(['beachVolleyball', 'Vôlei de praia', 'indoorVolleyball', 'Areia'], ARENA_SPORT_OPTIONS)).toEqual([
      'Vôlei de praia',
      'Vôlei indoor',
      'Areia',
    ]);
    expect(courtTypeOptionsFor(['footvolley', 'Pickleball'], ARENA_SPORT_OPTIONS)).toEqual(['Futevôlei', 'Pickleball']);
  });

  it('quadra e perfil lidos do doc já chegam como opções', () => {
    expect(courtFromRaw('c1', { name: 'Q1', types: ['beachTennis', 'Beach tennis'] }).types).toEqual(['Beach tennis']);
    expect(courtFromRaw('c1', { name: 'Q1', type: 'tennis' }).types).toEqual(['Tênis']);
    expect(arenaProfileFromDoc({ courtTypes: ['padel', 'Futebol'] }).courtTypes).toEqual(['Padel', 'Futebol']);
  });
});
