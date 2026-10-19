import { bookingSportCode, bookingSportOptions, COURT_SPORT_OPTIONS, courtDocSportValues } from '@nexago/arena-discovery';

/** Esporte da reserva do atleta. Espelha `functions/src/arena-booking-sport.test.ts` e
 *  `booking_sport_options_test.dart` do app. */
describe('bookingSportCode', () => {
  it('código e rótulo legado viram o código do catálogo', () => {
    expect(bookingSportCode('beachTennis')).toBe('beachTennis');
    expect(bookingSportCode('Beach tennis')).toBe('beachTennis');
    expect(bookingSportCode('Vôlei indoor')).toBe('indoorVolleyball');
  });

  it('pickleball segue como texto; superfície e vazio não são esporte', () => {
    expect(bookingSportCode('pickleball')).toBe('Pickleball');
    expect(bookingSportCode('Areia')).toBeNull();
    expect(bookingSportCode('  ')).toBeNull();
    expect(bookingSportCode(null)).toBeNull();
  });
});

describe('courtDocSportValues', () => {
  it('lê types; sem types cai no legado type', () => {
    expect(courtDocSportValues({ types: ['beachTennis', 'Areia'] })).toEqual(['beachTennis', 'Areia']);
    expect(courtDocSportValues({ types: [], type: 'Padel' })).toEqual(['Padel']);
    expect(courtDocSportValues({})).toEqual([]);
  });
});

describe('bookingSportOptions', () => {
  it('esportes da quadra, sem repetir código e rótulo nem superfície', () => {
    expect(bookingSportOptions(['Beach tennis', 'beachTennis', 'Areia', 'Futevôlei'], ['Padel'])).toEqual([
      'beachTennis',
      'footvolley',
    ]);
  });

  it('quadra sem esporte cadastrado cai nos da arena', () => {
    expect(bookingSportOptions(['Areia'], ['Vôlei de praia', 'Padel'])).toEqual(['beachVolleyball', 'padel']);
  });

  it('nem quadra nem arena: a lista do cadastro de quadra', () => {
    expect(bookingSportOptions([], [])).toEqual(COURT_SPORT_OPTIONS.map((o) => o.value));
  });
});
