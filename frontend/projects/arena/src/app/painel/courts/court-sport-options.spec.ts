import { COURT_SPORT_OPTIONS, courtTypeCodesFor } from '@nexago/arena-discovery';
import { SPORT_CATALOG } from '@nexago/sports';
import { ARENA_SPORT_OPTIONS } from '../data/arena-profile.model';
import { arenaProfileFromDoc } from '../profile/arena-profile-repository';
import { courtFromRaw, courtPayload } from './courts-repository';

/** Multiesporte fase 5b: o portal da arena grava o esporte como CÓDIGO do catálogo (quadra e
 *  perfil); rótulo legado gravado é lido como código. Espelha `court_sport_codes_test.dart`. */
describe('esporte da quadra no portal da arena (código)', () => {
  it('opções vêm do catálogo (arenaCourtTypes) + Pickleball', () => {
    const catalogCodes = SPORT_CATALOG.filter((e) => e.arenaCourtTypes.length > 0).map((e) => e.code);
    expect(COURT_SPORT_OPTIONS.map((o) => o.value)).toEqual([...catalogCodes, 'Pickleball']);
    expect(COURT_SPORT_OPTIONS.find((o) => o.value === 'beachTennis')?.label).toBe('Beach tennis');
    expect(ARENA_SPORT_OPTIONS).toBe(COURT_SPORT_OPTIONS);
  });

  it('rótulo ou código gravado viram código; desconhecido segue cru', () => {
    expect(courtTypeCodesFor(['Vôlei de praia', 'beachVolleyball', 'Beach tennis', 'Pickleball', 'Areia'])).toEqual([
      'beachVolleyball',
      'beachTennis',
      'Pickleball',
      'Areia',
    ]);
  });

  it('quadra e perfil lidos do doc chegam em código', () => {
    expect(courtFromRaw('c1', { name: 'Q1', types: ['beachTennis', 'Beach tennis'] }).types).toEqual(['beachTennis']);
    expect(courtFromRaw('c1', { name: 'Q1', type: 'Tênis' }).types).toEqual(['tennis']);
    expect(arenaProfileFromDoc({ courtTypes: ['Padel', 'football'] }).courtTypes).toEqual(['padel', 'football']);
  });

  it('quadra grava types/type/sport em código', () => {
    const payload = courtPayload({ name: ' Q1 ', types: ['Vôlei de praia', 'Futevôlei'], status: 'active', basePricePerHourReais: null });
    expect(payload['types']).toEqual(['beachVolleyball', 'footvolley']);
    expect(payload['type']).toBe('beachVolleyball');
    expect(payload['sport']).toBe('beachVolleyball');
  });
});
