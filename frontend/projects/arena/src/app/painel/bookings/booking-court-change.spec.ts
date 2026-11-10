import type { ArenaCourt } from '../courts/court.model';
import { bookingCanChangeCourt, courtAssignOptions, courtChangeOptions } from './booking-court-change';

function booking(overrides: Partial<Parameters<typeof bookingCanChangeCourt>[0]> = {}) {
  return {
    status: 'active',
    courtId: 'c1',
    sportCode: 'beachTennis',
    classSessionId: null,
    clubSessionId: null,
    scheduleSubscriptionId: null,
    ...overrides,
  };
}

function court(id: string, overrides: Partial<ArenaCourt> = {}): ArenaCourt {
  return {
    id,
    name: `Quadra ${id}`,
    types: ['beachTennis'],
    typeLabels: ['Beach Tennis'],
    status: 'active',
    basePricePerHourReais: null,
    ...overrides,
  };
}

describe('bookingCanChangeCourt', () => {
  it('reserva ativa, confirmada ou aguardando pagamento pode trocar', () => {
    expect(bookingCanChangeCourt(booking())).toBeTrue();
    expect(bookingCanChangeCourt(booking({ status: 'confirmed' }))).toBeTrue();
    expect(bookingCanChangeCourt(booking({ status: 'pending_payment' }))).toBeTrue();
  });

  it('cancelada ou concluída não troca', () => {
    expect(bookingCanChangeCourt(booking({ status: 'cancelled' }))).toBeFalse();
    expect(bookingCanChangeCourt(booking({ status: 'completed' }))).toBeFalse();
  });

  it('aula, clubinho e plano de horário trocam pela própria tela', () => {
    expect(bookingCanChangeCourt(booking({ classSessionId: 'a1' }))).toBeFalse();
    expect(bookingCanChangeCourt(booking({ clubSessionId: 's1' }))).toBeFalse();
    expect(bookingCanChangeCourt(booking({ scheduleSubscriptionId: 'p1' }))).toBeFalse();
  });
});

describe('courtChangeOptions', () => {
  it('tira a quadra atual, as em manutenção e as de outro esporte', () => {
    const courts = [
      court('c1'),
      court('c2'),
      court('c3', { status: 'maintenance' }),
      court('c4', { types: ['beachVolleyball'] }),
      court('c5', { types: [] }),
    ];
    expect(courtChangeOptions(booking(), courts).map((c) => c.id)).toEqual(['c2', 'c5']);
  });

  it('reserva sem esporte aceita quadra de qualquer esporte', () => {
    const courts = [court('c2', { types: ['beachVolleyball'] })];
    expect(courtChangeOptions(booking({ sportCode: null }), courts).map((c) => c.id)).toEqual(['c2']);
  });
});

describe('courtAssignOptions', () => {
  it('reserva sem quadra definida oferece a provisória primeiro', () => {
    const courts = [court('c1'), court('c2'), court('c3', { status: 'maintenance' })];
    const options = courtAssignOptions(booking({ allocationStatus: 'unassigned' } as never), courts);
    expect(options.map((o) => [o.court.id, o.provisional])).toEqual([['c1', true], ['c2', false]]);
  });

  it('reserva com quadra definida não oferece a atual', () => {
    const options = courtAssignOptions(booking({ allocationStatus: 'assigned' } as never), [court('c1'), court('c2')]);
    expect(options.map((o) => o.court.id)).toEqual(['c2']);
  });
});
