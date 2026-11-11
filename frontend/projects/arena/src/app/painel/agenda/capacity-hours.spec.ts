import type { ArenaBooking } from '../bookings/arena-booking.model';
import type { ArenaCourt } from '../courts/court.model';
import type { ArenaSlot } from './arena-slot.model';
import {
  bookingCanCheckInNow,
  bookingCanMarkNoShow,
  bookingDetailLink,
  buildBoard,
  buildCapacityHours,
  capacityCourts,
  dropBlockReason,
  hourBookings,
  provisionalBookings,
} from './capacity-hours';

/** Agenda → Por horário (`docs/product/reservas-por-capacidade.md`, PR 5). */
const DAY = '2026-11-22';
const H19 = 19 * 60;

function court(id: string, overrides: Partial<ArenaCourt> = {}): ArenaCourt {
  return { id, name: `Quadra ${id.slice(1)}`, types: ['beachTennis'], typeLabels: ['Beach Tennis'], status: 'active', basePricePerHourReais: null, ...overrides };
}

function slot(courtId: string, start: string, end: string, status: ArenaSlot['status'] = 'available'): ArenaSlot {
  return {
    id: `${courtId}-${start}`, arenaId: 'a1', courtId, dateKey: DAY, startTime: start, endTime: end, status,
    isVirtual: true, bookingId: null, bookingAthleteId: null, blockReason: null, blockNote: null,
  };
}

function booking(id: string, courtId: string, overrides: Partial<ArenaBooking> = {}): ArenaBooking {
  return {
    id, arenaId: 'a1', athleteId: `ath-${id}`, courtId, courtName: `Quadra ${courtId.slice(1)}`, sportLabel: 'Beach Tennis',
    dateKey: DAY, startTime: '19:00', endTime: '20:00', status: 'active', attendanceStatus: 'pending', customerName: null,
    isRecurring: false, recurringBookingId: null, classSessionId: null, sportCode: 'beachTennis', clubSessionId: null,
    scheduleSubscriptionId: null, allocationStatus: null, amountReais: 120, paymentChannel: 'pix', paymentStatus: 'paid',
    confirmedParticipants: 1, canceledAt: null, cancelReason: null, createdAt: null, couponCode: null, couponDiscountReais: null,
    bookedAsProfessor: false, professorRelationshipType: null, professorDiscountPercent: 0, professorDiscountReais: null,
    ...overrides,
  };
}

const courts = [court('c1'), court('c2'), court('c3'), court('c4')];
const hourSlots = (start: string, end: string) => courts.map((c) => slot(c.id, start, end));

describe('bookingDetailLink', () => {
  it('reserva comum, de plano ou do clubinho abre o detalhe da reserva', () => {
    expect(bookingDetailLink(booking('b1', 'c1'))).toEqual(['/painel/reservas', 'b1']);
    expect(bookingDetailLink(booking('b2', 'c1', { scheduleSubscriptionId: 's1' }))).toEqual(['/painel/reservas', 'b2']);
    expect(bookingDetailLink(booking('b3', 'c1', { clubSessionId: 'club1' }))).toEqual(['/painel/reservas', 'b3']);
  });

  it('aula abre a tela da aula', () => {
    expect(bookingDetailLink(booking('class_x', 'c1', { classSessionId: 'sess1' }))).toEqual(['/painel/aulas/aula', 'sess1']);
  });
});

describe('capacityCourts', () => {
  it('distribuição na ordem gravada; sem distribuição, todas', () => {
    expect(capacityCourts(courts, ['c3', 'c1', 'zz']).map((c) => c.id)).toEqual(['c3', 'c1']);
    expect(capacityCourts(courts, []).length).toBe(4);
  });
});

describe('buildBoard e resumo da hora', () => {
  const slots = [...hourSlots('19:00', '20:00'), slot('c4', '19:00', '20:00', 'blocked')].filter(
    (s, i, all) => !(s.courtId === 'c4' && s.status === 'available' && all.some((o) => o.courtId === 'c4' && o.status === 'blocked')),
  );
  const bookings = [
    booking('a', 'c1', { allocationStatus: 'unassigned' }),
    booking('b', 'c2', { allocationStatus: 'assigned' }),
    booking('x', 'c3', { status: 'canceled' }),
  ];

  it('reservada, livre e bloqueada por quadra; cancelada não ocupa', () => {
    const board = buildBoard(H19, courts, slots, bookings);
    expect(board.map((t) => t.state)).toEqual(['booked', 'booked', 'free', 'blocked']);
    expect(board[0]!.booking?.id).toBe('a');
  });

  it('capacidade sem bloqueio, ocupação e provisórias', () => {
    const [hour] = buildCapacityHours(courts, slots, bookings);
    expect(hour).toEqual(jasmine.objectContaining({ startTime: '19:00', endTime: '20:00', capacity: 3, booked: 2, free: 1, unassigned: 1, occupancyPct: 67 }));
  });

  it('manutenção fica fora da capacidade', () => {
    const board = buildBoard(H19, [court('c1', { status: 'maintenance' })], hourSlots('19:00', '20:00'), []);
    expect(board[0]!.state).toBe('maintenance');
  });

  it('lista: provisórias primeiro; "Confirmar todas" pega só elas', () => {
    const board = buildBoard(H19, courts, slots, [booking('b', 'c2', { allocationStatus: 'assigned' }), booking('a', 'c3', { allocationStatus: 'unassigned' })]);
    expect(hourBookings(board).map((b) => b.id)).toEqual(['a', 'b']);
    expect(provisionalBookings(board).map((b) => b.id)).toEqual(['a']);
  });

  it('"Confirmar todas" deixa o clubinho provisório de fora', () => {
    const board = buildBoard(H19, courts, slots, [
      booking('a', 'c3', { allocationStatus: 'unassigned' }),
      booking('club', 'c2', { allocationStatus: 'unassigned', clubSessionId: 's1' }),
    ]);
    expect(hourBookings(board).map((b) => b.id).sort()).toEqual(['a', 'club']);
    expect(provisionalBookings(board).map((b) => b.id)).toEqual(['a']);
  });
});

describe('buildCapacityHours', () => {
  it('reserva das 19:30 às 20:30 conta nas duas horas; slots de 30 min somam na hora', () => {
    const slots = courts.flatMap((c) => [slot(c.id, '19:00', '19:30'), slot(c.id, '19:30', '20:00'), slot(c.id, '20:00', '20:30'), slot(c.id, '20:30', '21:00')]);
    const hours = buildCapacityHours(courts, slots, [booking('a', 'c1', { startTime: '19:30', endTime: '20:30' })]);
    expect(hours.map((h) => [h.startTime, h.booked, h.capacity])).toEqual([['19:00', 1, 4], ['20:00', 1, 4]]);
  });

  it('reserva até meia-noite', () => {
    const hours = buildCapacityHours([court('c1')], [slot('c1', '23:00', '00:00')], [booking('a', 'c1', { startTime: '23:00', endTime: '00:00' })]);
    expect(hours.map((h) => [h.startTime, h.endTime, h.booked])).toEqual([['23:00', '00:00', 1]]);
  });
});

describe('dropBlockReason', () => {
  const board = buildBoard(
    H19,
    [...courts, court('c5', { types: ['footvolley'], typeLabels: ['Futevôlei'] }), court('c6', { status: 'maintenance' })],
    [...hourSlots('19:00', '20:00'), slot('c5', '19:00', '20:00'), slot('c4', '19:00', '20:00', 'blocked')],
    [booking('flo', 'c2', { allocationStatus: 'unassigned' }), booking('fix', 'c3', { allocationStatus: 'assigned' })],
  );
  const tile = (id: string) => board.find((t) => t.court.id === id)!;
  const moving = booking('m', 'c1', { allocationStatus: 'unassigned' });

  it('livre ou com provisória aceita (provisória troca de lugar)', () => {
    expect(dropBlockReason(moving, tile('c2'))).toBeNull();
  });

  it('definida, bloqueada, manutenção e outro esporte recusam', () => {
    expect(dropBlockReason(moving, tile('c3'))).toContain('quadra definida');
    expect(dropBlockReason(moving, tile('c4'))).toContain('bloqueada');
    expect(dropBlockReason(moving, tile('c6'))).toContain('manutenção');
    expect(dropBlockReason(moving, tile('c5'))).toContain('não é de Beach Tennis');
  });

  it('clubinho sai do lugar pelo quadro (muda a quadra da sessão)', () => {
    expect(dropBlockReason(booking('k', 'c1', { clubSessionId: 's1' }), tile('c2'))).toBeNull();
  });
});

describe('bookingCanMarkNoShow', () => {
  it('só depois do início e sem presença resolvida', () => {
    const b = booking('a', 'c1');
    expect(bookingCanMarkNoShow(b, new Date(2026, 10, 22, 18, 59))).toBeFalse();
    expect(bookingCanMarkNoShow(b, new Date(2026, 10, 22, 19, 0))).toBeTrue();
    expect(bookingCanMarkNoShow({ ...b, attendanceStatus: 'checked_in' }, new Date(2026, 10, 22, 20))).toBeFalse();
    // Clubinho: presença é por participante.
    expect(bookingCanMarkNoShow({ ...b, clubSessionId: 's1' }, new Date(2026, 10, 22, 19, 0))).toBeFalse();
    expect(bookingCanCheckInNow({ ...b, clubSessionId: 's1' }, new Date(2026, 10, 22, 19, 0))).toBeFalse();
  });
});

describe('bookingCanCheckInNow', () => {
  it('de 20 min antes até 15 min depois do fim', () => {
    const b = booking('a', 'c1');
    expect(bookingCanCheckInNow(b, new Date(2026, 10, 22, 18, 39))).toBeFalse();
    expect(bookingCanCheckInNow(b, new Date(2026, 10, 22, 18, 40))).toBeTrue();
    expect(bookingCanCheckInNow(b, new Date(2026, 10, 22, 20, 15))).toBeTrue();
    expect(bookingCanCheckInNow(b, new Date(2026, 10, 22, 20, 16))).toBeFalse();
    expect(bookingCanCheckInNow({ ...b, attendanceStatus: 'checked_in' }, new Date(2026, 10, 22, 19))).toBeFalse();
  });
});
