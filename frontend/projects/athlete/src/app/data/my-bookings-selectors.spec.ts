import {
  bookingEndsAt,
  bookingIsActive,
  bookingIsUpcoming,
  bookingStartsAt,
  type MyBooking,
} from './my-bookings-repository';

function booking(overrides: Partial<MyBooking> = {}): MyBooking {
  return {
    id: 'b1',
    arenaId: 'a1',
    arenaName: 'Arena Central',
    courtName: 'Quadra 2',
    dateKey: '2026-04-15',
    startTime: '19:00',
    endTime: '20:30',
    status: 'confirmed',
    attendanceConfirmed: false,
    amountReais: 68,
    createdAt: null,
    ...overrides,
  };
}

describe('my-bookings selectors', () => {
  it('interpreta data e hora no fuso local, não em UTC', () => {
    const startsAt = bookingStartsAt(booking());
    expect(startsAt?.getFullYear()).toBe(2026);
    expect(startsAt?.getMonth()).toBe(3);
    expect(startsAt?.getDate()).toBe(15);
    expect(startsAt?.getHours()).toBe(19);
  });

  it('cai no início do dia quando startTime é inutilizável', () => {
    const startsAt = bookingStartsAt(booking({ startTime: '--:--' }));
    expect(startsAt?.getHours()).toBe(0);
    expect(startsAt?.getDate()).toBe(15);
  });

  it('cai no início quando endTime é inutilizável, em vez de virar meia-noite', () => {
    const target = booking({ endTime: '--:--' });
    expect(bookingEndsAt(target)?.getTime()).toBe(bookingStartsAt(target)?.getTime());
  });

  it('devolve null quando não há data', () => {
    expect(bookingStartsAt(booking({ dateKey: '' }))).toBeNull();
  });

  it('mantém como próxima a reserva que está acontecendo agora', () => {
    const now = new Date(2026, 3, 15, 19, 30);
    expect(bookingIsUpcoming(booking(), now)).toBe(true);
  });

  it('descarta a reserva que já terminou', () => {
    const now = new Date(2026, 3, 15, 20, 31);
    expect(bookingIsUpcoming(booking(), now)).toBe(false);
  });

  it('mantém a reserva de um dia futuro', () => {
    const now = new Date(2026, 3, 14, 23, 0);
    expect(bookingIsUpcoming(booking(), now)).toBe(true);
  });

  it('trata reservas canceladas como inativas nas duas grafias', () => {
    expect(bookingIsActive(booking({ status: 'canceled' }))).toBe(false);
    expect(bookingIsActive(booking({ status: 'CANCELLED' }))).toBe(false);
    expect(bookingIsActive(booking())).toBe(true);
  });
});
