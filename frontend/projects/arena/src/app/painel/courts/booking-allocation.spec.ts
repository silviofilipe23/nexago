import type { ArenaCourt } from './court.model';
import {
  bookingAllocationError,
  bookingAllocationFromArena,
  bookingAllocationPayload,
  sportsOfCourts,
  type BookingAllocationForm,
} from './booking-allocation';

function court(id: string, types: string[], labels: string[] = types): ArenaCourt {
  return { id, name: `Quadra ${id}`, types, typeLabels: labels, status: 'active', basePricePerHourReais: null };
}

const COURTS = [
  court('c1', ['beachTennis'], ['Beach Tennis']),
  court('c2', ['beachTennis', 'beachVolleyball'], ['Beach Tennis', 'Vôlei de praia']),
  court('c3', []),
];

function form(overrides: Partial<BookingAllocationForm> = {}): BookingAllocationForm {
  return {
    mode: 'capacity',
    courtIds: ['c1'],
    priceBySport: { beachTennis: 120 },
    revealBeforeArrival: false,
    allowCourtChoice: false,
    ...overrides,
  };
}

describe('bookingAllocationFromArena', () => {
  it('sem configuração é o modo de sempre', () => {
    expect(bookingAllocationFromArena(null).mode).toBe('court');
    expect(bookingAllocationFromArena({}).courtIds).toEqual([]);
  });

  it('lê o modo capacidade e guarda a configuração mesmo com o modo de volta em court', () => {
    const saved = bookingAllocationFromArena({
      bookingAllocation: { mode: 'court', courtIds: ['c1'], priceBySport: { beachTennis: 120, padel: 0 }, allowCourtChoice: true },
    });
    expect(saved.mode).toBe('court');
    expect(saved.courtIds).toEqual(['c1']);
    expect(saved.priceBySport).toEqual({ beachTennis: 120 });
    expect(saved.allowCourtChoice).toBeTrue();
  });
});

describe('sportsOfCourts', () => {
  it('esportes das quadras escolhidas, sem repetir', () => {
    expect(sportsOfCourts(COURTS, ['c1', 'c2']).map((s) => s.code)).toEqual(['beachTennis', 'beachVolleyball']);
    expect(sportsOfCourts(COURTS, ['c1'])[0]?.label).toBe('Beach Tennis');
  });
});

describe('bookingAllocationError', () => {
  it('modo de sempre nunca tem erro', () => {
    expect(bookingAllocationError(form({ mode: 'court', courtIds: [] }), COURTS)).toBeNull();
  });

  it('exige quadra, esporte e preço de cada esporte', () => {
    expect(bookingAllocationError(form({ courtIds: [] }), COURTS)).toContain('ao menos uma quadra');
    expect(bookingAllocationError(form({ courtIds: ['c3'] }), COURTS)).toContain('não têm esporte');
    expect(bookingAllocationError(form({ courtIds: ['c2'] }), COURTS)).toContain('Vôlei de praia');
    expect(bookingAllocationError(form(), COURTS)).toBeNull();
  });
});

describe('bookingAllocationPayload', () => {
  it('manda só quadras que existem e preços dos esportes delas', () => {
    const payload = bookingAllocationPayload('a1', form({
      courtIds: ['c1', 'sumiu'],
      priceBySport: { beachTennis: 120, beachVolleyball: 90, padel: null },
    }), COURTS);
    expect(payload.courtIds).toEqual(['c1']);
    expect(payload.priceBySport).toEqual({ beachTennis: 120 });
    expect(payload.arenaId).toBe('a1');
  });
});
