import type { ArenaBooking } from './arena-booking.model';
import {
  bookingKindLabel,
  bookingLiveState,
  bookingTakesGuests,
  bookingTimeline,
  durationLabel,
  longDateLabel,
  paymentStatusView,
  perPlayerLabel,
  timelineWhen,
} from './booking-detail';

function booking(overrides: Partial<ArenaBooking> = {}): ArenaBooking {
  return {
    id: 'b1', arenaId: 'a1', athleteId: 'ath1', courtId: 'c7', courtName: 'Quadra 7', sportLabel: 'Beach Tennis',
    dateKey: '2026-11-18', startTime: '19:00', endTime: '20:30', status: 'active', attendanceStatus: 'pending', customerName: null,
    isRecurring: false, recurringBookingId: null, classSessionId: null, sportCode: 'beachTennis', clubSessionId: null,
    scheduleSubscriptionId: null, allocationStatus: null, amountReais: 144, paymentChannel: 'pix', paymentStatus: 'paid',
    confirmedParticipants: 1, canceledAt: null, cancelReason: null, createdAt: null, couponCode: null, couponDiscountReais: null,
    bookedAsProfessor: false, professorRelationshipType: null, professorDiscountPercent: 0, professorDiscountReais: null,
    ...overrides,
  };
}

const at = (h: number, m = 0, day = 18) => new Date(2026, 10, day, h, m);

describe('detalhe da reserva', () => {
  it('data longa e duração', () => {
    expect(longDateLabel('2026-11-18')).toBe('Quarta · 18 de novembro de 2026');
    expect(durationLabel('19:00', '20:30')).toBe('1h30');
    expect(durationLabel('19:00', '20:00')).toBe('1h');
    expect(durationLabel('19:15', '20:00')).toBe('45 min');
    expect(durationLabel('23:00', '00:00')).toBe('1h');
  });

  it('situação agora: antes, janela de check-in, rolando, encerrada e cancelada', () => {
    const b = booking();
    expect(bookingLiveState(b, at(17)).headline).toBe('Começa em 2h');
    const soon = bookingLiveState(b, at(18, 45));
    expect(soon.headline).toBe('Começa em 15 min');
    expect(soon.detail).toContain('já está aberta');
    const live = bookingLiveState(b, at(19, 45));
    expect(live.headline).toBe('Em andamento');
    expect(live.progress).toBeCloseTo(0.5);
    expect(live.detail).toContain('ainda sem check-in');
    expect(bookingLiveState(booking({ attendanceStatus: 'no_show' }), at(21)).detail).toBe('Marcada como falta.');
    expect(bookingLiveState(booking({ status: 'canceled' }), at(17)).tone).toBe('canceled');
    expect(bookingLiveState(b, at(9, 0, 15)).headline).toBe('Daqui a 3 dias');
  });

  it('pagamento em português; "none" no local é pago na recepção', () => {
    expect(paymentStatusView('paid', 'pix')).toEqual({ label: 'Pago', tone: 'green' });
    expect(paymentStatusView('none', 'onsite').label).toBe('Paga no local');
    expect(paymentStatusView('none', null).label).toBe('Sem cobrança');
    expect(paymentStatusView('refunded', 'pix').label).toBe('Estornado');
  });

  it('tipo e vagas de convidado', () => {
    expect(bookingKindLabel(booking())).toBe('Avulsa');
    expect(bookingKindLabel(booking({ classSessionId: 's1' }))).toBe('Aula');
    expect(bookingKindLabel(booking({ scheduleSubscriptionId: 'p1' }))).toBe('Plano de horário');
    expect(bookingTakesGuests(booking())).toBeTrue();
    expect(bookingTakesGuests(booking({ athleteId: '' }))).toBeFalse();
    expect(bookingTakesGuests(booking({ clubSessionId: 'c1' }))).toBeFalse();
    expect(bookingTakesGuests(booking({ status: 'pending_payment' }))).toBeFalse();
  });

  it('valor por jogador só com mais de um e valor > 0', () => {
    expect(perPlayerLabel(144, 3)).toContain('48,00');
    expect(perPlayerLabel(144, 1)).toBeNull();
    expect(perPlayerLabel(0, 3)).toBeNull();
  });

  it('linha do tempo em ordem, sem evento sem hora', () => {
    const b = booking({
      createdAt: at(18, 2, 9),
      participants: [
        { uid: 'u2', name: 'Lia', avatarUrl: null, via: 'link', joinedAt: at(8, 15, 10) },
        { uid: 'u3', name: 'Rafa', avatarUrl: null, via: 'direct', joinedAt: null },
      ],
      courtHistory: [{ fromCourtName: 'Quadra 3', toCourtName: 'Quadra 7', at: at(10, 15), reason: 'rede' }],
      attendanceStatus: 'checked_in',
      checkedInAt: at(18, 50),
    });
    const tl = bookingTimeline(b, 'Marina');
    expect(tl.map((e) => e.title)).toEqual(['Reserva criada', 'Lia entrou', 'Quadra trocada: Quadra 3 → Quadra 7', 'Check-in feito']);
    expect(tl[1]!.detail).toBe('Pelo link da reserva');
    expect(timelineWhen(at(18, 2, 9))).toBe('09/11 · 18:02');
  });
});
