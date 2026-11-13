import type { ArenaSlot } from '@nexago/arena-discovery';
import { bookingFromSnapshot, type ArenaBookingDoc } from '../../data/arena-bookings-repository';
import type { DocumentData, DocumentSnapshot } from 'firebase/firestore';
import {
  buildRescheduleTimes,
  bookingDurationMinutes,
  rescheduleEligibility,
  rescheduledNotice,
  type RescheduleCurrentSlot,
} from './booking-reschedule';

function booking(overrides: Partial<ArenaBookingDoc> = {}): ArenaBookingDoc {
  return {
    id: 'b1',
    arenaId: 'a1',
    arenaName: 'Arena Sol',
    courtId: 'c1',
    courtName: 'Quadra 1',
    allocationStatus: null,
    sport: null,
    dateKey: '2026-08-06',
    startTime: '18:00',
    endTime: '20:00',
    amountReais: 200,
    amountToPayNowReais: 0,
    amountDueOnsiteReais: 200,
    amountPaidOnlineReais: 0,
    paymentChannel: 'onsite',
    paymentStatus: 'none',
    paymentFraction: null,
    status: 'active',
    paymentExpiresAt: null,
    slotCount: 2,
    ownerAthleteId: 'dono',
    confirmedParticipants: 1,
    guestAthleteId: null,
    guestAthleteName: null,
    participants: [],
    participantUids: [],
    recurringBookingId: null,
    createdAt: null,
    couponCode: null,
    couponDiscountReais: 0,
    asaasPaymentId: null,
    cashbackAppliedReais: 0,
    seriesKind: null,
    athleteRescheduleCount: 0,
    tablePriceReais: 200,
    ...overrides,
  };
}

/** 2026-08-06 é uma quinta. */
const DAY = new Date(2026, 7, 6);
const EARLY = new Date(2026, 7, 5, 9, 0);

function slot(courtId: string, start: string, end: string, status = 'available', price: number | null = 100): ArenaSlot {
  return {
    id: `${courtId}-${start}`,
    arenaId: 'a1',
    courtId,
    date: DAY,
    startTime: start,
    endTime: end,
    rawStatus: status,
    priceReais: price,
    basePriceReais: price,
    appliedPromotionId: null,
    isVirtual: status === 'available',
  };
}

const CURRENT: RescheduleCurrentSlot = { dateKey: '2026-08-06', courtId: 'c1', startTime: '18:00', endTime: '20:00' };

function times(daySlots: ArenaSlot[], overrides: Partial<Parameters<typeof buildRescheduleTimes>[0]> = {}) {
  return buildRescheduleTimes({
    daySlots,
    day: DAY,
    courtIds: ['c1'],
    durationMinutes: 120,
    now: EARLY,
    current: CURRENT,
    tablePriceReais: 200,
    ...overrides,
  });
}

describe('rescheduleEligibility', () => {
  it('libera a reserva avulsa do dono com mais de 6h de antecedência', () => {
    expect(rescheduleEligibility(booking(), 'dono', EARLY)).toEqual({ allowed: true });
  });

  it('esconde de quem não é o dono e das reservas de série', () => {
    expect(rescheduleEligibility(booking(), 'outro', EARLY)).toEqual({ allowed: false, hint: null });
    for (const kind of ['class', 'schedule_plan', 'recurring', 'club', 'plan_flex'] as const) {
      expect(rescheduleEligibility(booking({ seriesKind: kind }), 'dono', EARLY).allowed).toBeFalse();
    }
    expect(rescheduleEligibility(booking({ recurringBookingId: 'r1' }), 'dono', EARLY).allowed).toBeFalse();
  });

  it('esconde reserva cancelada, com chuva pendente ou com presença registrada', () => {
    expect(rescheduleEligibility(booking({ status: 'canceled' }), 'dono', EARLY)).toEqual({ allowed: false, hint: null });
    expect(rescheduleEligibility(booking({ weatherPendingChoice: true }), 'dono', EARLY).allowed).toBeFalse();
    expect(rescheduleEligibility(booking({ attendanceStatus: 'checked_in' }), 'dono', EARLY).allowed).toBeFalse();
    expect(rescheduleEligibility(booking({ status: 'pending_payment' }), 'dono', EARLY).allowed).toBeTrue();
  });

  it('dentro das 6h ou já remarcada mostra a dica em vez do botão', () => {
    const late = rescheduleEligibility(booking(), 'dono', new Date(2026, 7, 6, 13, 0));
    expect(late).toEqual({ allowed: false, hint: jasmine.stringContaining('até 6h antes') as unknown as string });
    const again = rescheduleEligibility(booking({ athleteRescheduleCount: 1 }), 'dono', EARLY);
    expect(again).toEqual({ allowed: false, hint: jasmine.stringContaining('já foi remarcada') as unknown as string });
  });

  it('reserva já começada não mostra nada', () => {
    expect(rescheduleEligibility(booking(), 'dono', new Date(2026, 7, 6, 18, 30))).toEqual({ allowed: false, hint: null });
  });
});

describe('buildRescheduleTimes', () => {
  it('oferece inícios com a duração inteira livre e contígua, fora o horário atual', () => {
    const daySlots = [
      slot('c1', '16:00', '17:00'),
      slot('c1', '17:00', '18:00'),
      slot('c1', '18:00', '19:00', 'booked'),
      slot('c1', '19:00', '20:00', 'booked'),
      slot('c1', '20:00', '21:00'),
      slot('c1', '21:00', '22:00', 'booked', null),
    ];
    const out = times(daySlots);
    // 17 e 19 contam os slots da própria reserva como livres; 18 é o atual; 20 cruza o 21h de outro.
    expect(out.map((t) => `${t.startTime}-${t.endTime}`)).toEqual(['16:00-18:00', '17:00-19:00', '19:00-21:00']);
    expect(out[0]!.priceReais).toBe(200);
  });

  it('slot ocupado de outra reserva fecha o horário', () => {
    const daySlots = [slot('c1', '10:00', '11:00'), slot('c1', '11:00', '12:00', 'booked'), slot('c1', '12:00', '13:00')];
    expect(times(daySlots)).toEqual([]);
  });

  it('em outro dia os slots ocupados não são da reserva', () => {
    const daySlots = [slot('c1', '18:00', '19:00', 'booked'), slot('c1', '19:00', '20:00'), slot('c1', '20:00', '21:00')];
    const out = times(daySlots, { current: { ...CURRENT, dateKey: '2026-08-07' } });
    expect(out.map((t) => t.startTime)).toEqual(['19:00']);
  });

  it('pula horário já começado e o que passa da meia-noite', () => {
    const daySlots = [slot('c1', '09:00', '10:00'), slot('c1', '10:00', '11:00'), slot('c1', '11:00', '12:00'), slot('c1', '23:00', '00:00')];
    const out = times(daySlots, { now: new Date(2026, 7, 6, 9, 30) });
    expect(out.map((t) => t.startTime)).toEqual(['10:00']);
    const midnight = times([slot('c1', '22:00', '23:00'), slot('c1', '23:00', '00:00')]);
    expect(midnight.map((t) => `${t.startTime}-${t.endTime}`)).toEqual(['22:00-00:00']);
  });

  it('marca o horário mais caro que a reserva e mantém preço desconhecido como nulo', () => {
    const daySlots = [slot('c1', '08:00', '09:00', 'available', 150), slot('c1', '09:00', '10:00', 'available', 150), slot('c1', '10:00', '11:00', 'available', null)];
    const out = times(daySlots);
    expect(out[0]).toEqual({ startTime: '08:00', endTime: '10:00', priceReais: 300, pricier: true });
    expect(out[1]).toEqual({ startTime: '09:00', endTime: '11:00', priceReais: null, pricier: false });
  });

  it('sem quadra definida: une as quadras candidatas e usa o preço do horário', () => {
    const daySlots = [
      slot('c1', '08:00', '09:00', 'booked'),
      slot('c1', '09:00', '10:00'),
      slot('c2', '08:00', '09:00'),
      slot('c2', '09:00', '10:00'),
    ];
    const out = times(daySlots, { courtIds: ['c1', 'c2'], fixedPriceReais: 180 });
    expect(out).toEqual([{ startTime: '08:00', endTime: '10:00', priceReais: 180, pricier: false }]);
  });
});

describe('helpers', () => {
  it('duração com fim à meia-noite', () => {
    expect(bookingDurationMinutes('22:00', '00:00')).toBe(120);
    expect(bookingDurationMinutes('18:00', '19:30')).toBe(90);
    expect(bookingDurationMinutes('18:00', '')).toBeNull();
  });

  it('aviso de sucesso', () => {
    expect(rescheduledNotice('2026-08-06', '18:00')).toBe('Reserva remarcada para qui, 06/08 às 18:00.');
  });

  it('o repositório lê série, contagem e preço de tabela da reserva', () => {
    const snap = {
      id: 'b1',
      data: () => ({
        athleteId: 'dono',
        date: '2026-08-06',
        startTime: '18:00',
        endTime: '20:00',
        clubSessionId: 'club1',
        athleteRescheduleCount: 1,
        weatherRelease: { status: 'pending_choice' },
        pricingLineItems: [{ finalSlotPriceReais: 90 }, { finalSlotPriceReais: 95.5 }],
        amountReais: 150,
      }),
    } as unknown as DocumentSnapshot<DocumentData>;
    const b = bookingFromSnapshot(snap)!;
    expect(b.seriesKind).toBe('club');
    expect(b.athleteRescheduleCount).toBe(1);
    expect(b.weatherPendingChoice).toBeTrue();
    expect(b.tablePriceReais).toBe(185.5);
  });
});
