import type { ArenaBooking } from '../bookings/arena-booking.model';
import type { ArenaSlot } from './arena-slot.model';
import { applyBookingsOverlay } from './arena-schedule-grouping';

function makeSlot(overrides: Partial<ArenaSlot> = {}): ArenaSlot {
  return {
    id: 's1',
    arenaId: 'arena1',
    courtId: 'court1',
    dateKey: '2026-07-30',
    startTime: '09:00',
    endTime: '10:00',
    status: 'available',
    isVirtual: true,
    bookingId: null,
    bookingAthleteId: null,
    blockReason: null,
    blockNote: null,
    ...overrides,
  };
}

function makeBooking(overrides: Partial<ArenaBooking> = {}): ArenaBooking {
  return {
    id: 'b1',
    arenaId: 'arena1',
    athleteId: 'athlete1',
    courtId: 'court1',
    courtName: 'Quadra 1',
    dateKey: '2026-07-30',
    startTime: '09:00',
    endTime: '10:00',
    status: 'confirmed',
    attendanceStatus: 'pending',
    customerName: null,
    isRecurring: false,
    recurringBookingId: null,
    amountReais: null,
    paymentChannel: null,
    paymentStatus: null,
    confirmedParticipants: 1,
    canceledAt: null,
    cancelReason: null,
    createdAt: null,
    couponCode: null,
    couponDiscountReais: null,
    ...overrides,
  };
}

describe('applyBookingsOverlay', () => {
  it('marca como booked um slot available que casa com uma reserva ativa do mesmo dia', () => {
    const slots = [makeSlot()];
    const bookings = [makeBooking()];
    const result = applyBookingsOverlay(slots, bookings);
    expect(result[0].status).toBe('booked');
    expect(result[0].bookingId).toBe('b1');
  });

  it('não aplica overlay de uma reserva de OUTRO dia (dateKey diferente)', () => {
    const slots = [makeSlot({ dateKey: '2026-07-31' })];
    const bookings = [makeBooking({ dateKey: '2026-07-30' })];
    const result = applyBookingsOverlay(slots, bookings);
    expect(result[0].status).toBe('available');
  });

  it('numa lista com slots de dois dias diferentes, cada slot só recebe overlay do seu próprio dia', () => {
    const slots = [
      makeSlot({ id: 'a', dateKey: '2026-07-30' }),
      makeSlot({ id: 'b', dateKey: '2026-07-31' }),
    ];
    const bookings = [makeBooking({ dateKey: '2026-07-31' })];
    const result = applyBookingsOverlay(slots, bookings);
    expect(result.find((s) => s.id === 'a')?.status).toBe('available');
    expect(result.find((s) => s.id === 'b')?.status).toBe('booked');
  });

  it('ignora reserva cancelada (bookingIsActive só considera "canceled"/"cancelled")', () => {
    const slots = [makeSlot()];
    const bookings = [makeBooking({ status: 'canceled' })];
    const result = applyBookingsOverlay(slots, bookings);
    expect(result[0].status).toBe('available');
  });

  it('não sobrescreve um slot já blocked/booked', () => {
    const slots = [makeSlot({ status: 'blocked' })];
    const bookings = [makeBooking()];
    const result = applyBookingsOverlay(slots, bookings);
    expect(result[0].status).toBe('blocked');
  });

  it('libera um slot booked cuja reserva vinculada foi cancelada', () => {
    const slots = [makeSlot({ status: 'booked', bookingId: 'b1', bookingAthleteId: 'athlete1' })];
    const bookings = [makeBooking({ status: 'canceled' })];
    const result = applyBookingsOverlay(slots, bookings);
    expect(result[0].status).toBe('available');
    expect(result[0].bookingId).toBeNull();
    expect(result[0].bookingAthleteId).toBeNull();
  });

  it('mantém booked um slot cuja reserva vinculada segue ativa', () => {
    const slots = [makeSlot({ status: 'booked', bookingId: 'b1', bookingAthleteId: 'athlete1' })];
    const bookings = [makeBooking()];
    const result = applyBookingsOverlay(slots, bookings);
    expect(result[0].status).toBe('booked');
    expect(result[0].bookingId).toBe('b1');
  });

  it('mantém booked um slot cujo bookingId não está (ainda) na lista de reservas carregadas', () => {
    const slots = [makeSlot({ status: 'booked', bookingId: 'b-desconhecido' })];
    const bookings = [makeBooking()];
    const result = applyBookingsOverlay(slots, bookings);
    expect(result[0].status).toBe('booked');
  });
});
