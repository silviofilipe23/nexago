import type { ArenaSlot } from '../agenda/arena-slot.model';
import {
  bookingCanReschedule,
  bookingDurationMinutes,
  mergeStartOptions,
  rescheduleDateBounds,
  rescheduleStartOptions,
  rescheduleSuccessMessage,
} from './booking-reschedule';

function booking(overrides: Partial<Parameters<typeof bookingCanReschedule>[0]> = {}) {
  return {
    status: 'active',
    attendanceStatus: 'pending',
    dateKey: '2026-11-20',
    startTime: '18:00',
    endTime: '19:00',
    classSessionId: null,
    scheduleSubscriptionId: null,
    isRecurring: false,
    recurringBookingId: null,
    clubSessionId: null,
    ...overrides,
  };
}

const BEFORE = new Date(2026, 10, 20, 10, 0).getTime();

function slot(start: string, end: string, overrides: Partial<ArenaSlot> = {}): ArenaSlot {
  return {
    id: `v_${start}`,
    arenaId: 'a1',
    courtId: 'c1',
    dateKey: '2026-11-20',
    startTime: start,
    endTime: end,
    status: 'available',
    isVirtual: true,
    bookingId: null,
    bookingAthleteId: null,
    blockReason: null,
    blockNote: null,
    ...overrides,
  };
}

const own = { id: 'b1', courtId: 'c1', dateKey: '2026-11-20', startTime: '18:00' };
const morning = new Date(2026, 10, 20, 7, 0);

function starts(slots: ArenaSlot[], durationMinutes = 60, now = morning, courtId = 'c1') {
  return rescheduleStartOptions({ slots, courtId, dateKey: '2026-11-20', durationMinutes, booking: own, now }).map(
    (o) => `${o.startTime}-${o.endTime}`,
  );
}

describe('bookingCanReschedule', () => {
  it('reserva avulsa ativa, confirmada ou aguardando pagamento pode remarcar', () => {
    expect(bookingCanReschedule(booking(), BEFORE)).toBeTrue();
    expect(bookingCanReschedule(booking({ status: 'confirmed' }), BEFORE)).toBeTrue();
    expect(bookingCanReschedule(booking({ status: 'pending_payment' }), BEFORE)).toBeTrue();
  });

  it('cancelada ou concluída não remarca', () => {
    expect(bookingCanReschedule(booking({ status: 'canceled' }), BEFORE)).toBeFalse();
    expect(bookingCanReschedule(booking({ status: 'completed' }), BEFORE)).toBeFalse();
  });

  it('aula, plano, horário fixo, clubinho e minutos do plano mudam pela própria tela', () => {
    expect(bookingCanReschedule(booking({ classSessionId: 'x' }), BEFORE)).toBeFalse();
    expect(bookingCanReschedule(booking({ scheduleSubscriptionId: 'x' }), BEFORE)).toBeFalse();
    expect(bookingCanReschedule(booking({ isRecurring: true }), BEFORE)).toBeFalse();
    expect(bookingCanReschedule(booking({ recurringBookingId: 'x' }), BEFORE)).toBeFalse();
    expect(bookingCanReschedule(booking({ clubSessionId: 'x' }), BEFORE)).toBeFalse();
    expect(bookingCanReschedule(booking({ scheduleFlexMinutes: 60 }), BEFORE)).toBeFalse();
    expect(bookingCanReschedule(booking({ weatherPendingChoice: true }), BEFORE)).toBeFalse();
  });

  it('com presença registrada não remarca', () => {
    expect(bookingCanReschedule(booking({ attendanceStatus: 'checked_in' }), BEFORE)).toBeFalse();
    expect(bookingCanReschedule(booking({ attendanceStatus: 'no_show' }), BEFORE)).toBeFalse();
  });

  it('a arena remarca até o fim do horário', () => {
    expect(bookingCanReschedule(booking(), new Date(2026, 10, 20, 18, 30).getTime())).toBeTrue();
    expect(bookingCanReschedule(booking(), new Date(2026, 10, 20, 19, 0).getTime())).toBeFalse();
  });
});

describe('bookingDurationMinutes', () => {
  it('fim 00:00 é meia-noite', () => {
    expect(bookingDurationMinutes({ startTime: '18:00', endTime: '19:30' })).toBe(90);
    expect(bookingDurationMinutes({ startTime: '23:00', endTime: '00:00' })).toBe(60);
    expect(bookingDurationMinutes({ startTime: '--:--', endTime: '19:00' })).toBeNull();
  });
});

describe('rescheduleDateBounds', () => {
  it('hoje até hoje + 34 dias', () => {
    expect(rescheduleDateBounds(new Date(2026, 10, 13, 15, 0))).toEqual({ min: '2026-11-13', max: '2026-12-17' });
  });
});

describe('rescheduleStartOptions', () => {
  it('oferece cada slot livre, menos o horário atual', () => {
    const slots = [slot('17:00', '18:00'), slot('18:00', '19:00', { status: 'booked', bookingId: 'b1' }), slot('19:00', '20:00')];
    expect(starts(slots)).toEqual(['17:00-18:00', '19:00-20:00']);
  });

  it('duração maior que o slot precisa de slots livres encadeados; os da própria reserva contam como livres', () => {
    const slots = [
      slot('16:00', '17:00'),
      slot('17:00', '18:00'),
      slot('18:00', '19:00', { status: 'booked', bookingId: 'b1' }),
      slot('19:00', '20:00', { status: 'booked', bookingId: 'other' }),
      slot('20:00', '21:00'),
      slot('21:00', '22:00', { status: 'blocked' }),
    ];
    expect(starts(slots, 120)).toEqual(['16:00-18:00', '17:00-19:00']);
  });

  it('respeita a grade de 30 min e não passa da meia-noite', () => {
    const slots = [slot('22:30', '23:00'), slot('23:00', '23:30'), slot('23:30', '00:00')];
    expect(starts(slots, 60)).toEqual(['22:30-23:30', '23:00-00:00']);
  });

  it('tira o que já passou', () => {
    const slots = [slot('09:00', '10:00'), slot('10:00', '11:00'), slot('11:00', '12:00')];
    expect(starts(slots, 60, new Date(2026, 10, 20, 10, 0))).toEqual(['11:00-12:00']);
  });

  it('só olha a quadra pedida; noutra quadra o horário atual vale', () => {
    const slots = [slot('18:00', '19:00', { courtId: 'c2' }), slot('19:00', '20:00')];
    expect(starts(slots, 60, morning, 'c2')).toEqual(['18:00-19:00']);
  });
});

describe('mergeStartOptions', () => {
  it('junta e ordena sem repetir início', () => {
    const merged = mergeStartOptions([
      [{ startTime: '19:00', endTime: '20:00' }],
      [
        { startTime: '17:00', endTime: '18:00' },
        { startTime: '19:00', endTime: '20:00' },
      ],
    ]);
    expect(merged.map((o) => o.startTime)).toEqual(['17:00', '19:00']);
  });
});

describe('rescheduleSuccessMessage', () => {
  const base = { bookingId: 'b1', date: '2026-08-06', startTime: '18:00', endTime: '19:00', courtId: 'c1', courtName: 'Quadra 1', courtChanged: false };

  it('sem diferença de tabela: dia e hora', () => {
    expect(rescheduleSuccessMessage({ ...base, tablePriceDiffReais: 0 })).toBe('Reserva remarcada para qui, 06/08 às 18:00.');
  });

  it('com diferença: lembra que o valor não mudou', () => {
    expect(rescheduleSuccessMessage({ ...base, tablePriceDiffReais: 20 })).toContain('a mais — o valor da reserva não mudou');
    expect(rescheduleSuccessMessage({ ...base, tablePriceDiffReais: -20 })).toContain('a menos');
  });
});
