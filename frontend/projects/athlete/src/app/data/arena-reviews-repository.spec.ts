import { REVIEW_CANCELED_MESSAGE, REVIEW_NOT_COMPLETED_MESSAGE, validateBookingForReview } from './arena-reviews-repository';

const OWNER = { arenaId: 'a1', userId: 'u1' };

function bookingData(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    arenaId: 'a1',
    athleteId: 'u1',
    status: 'confirmed',
    date: '2026-04-15',
    startTime: '19:00',
    endTime: '20:30',
    ...overrides,
  };
}

describe('validateBookingForReview', () => {
  const afterEnd = new Date(2026, 3, 15, 21, 0);

  it('libera a reserva concluída do próprio atleta', () => {
    expect(validateBookingForReview(OWNER, bookingData(), afterEnd)).toBeNull();
  });

  it('recusa reserva de outra arena', () => {
    expect(validateBookingForReview(OWNER, bookingData({ arenaId: 'outra' }), afterEnd)).toBe(REVIEW_NOT_COMPLETED_MESSAGE);
  });

  it('recusa reserva de outro atleta', () => {
    expect(validateBookingForReview(OWNER, bookingData({ athleteId: 'u2' }), afterEnd)).toBe(REVIEW_NOT_COMPLETED_MESSAGE);
  });

  it('recusa reserva cancelada', () => {
    expect(validateBookingForReview(OWNER, bookingData({ status: 'cancelled' }), afterEnd)).toBe(REVIEW_CANCELED_MESSAGE);
  });

  it('recusa reserva que ainda não terminou', () => {
    expect(validateBookingForReview(OWNER, bookingData(), new Date(2026, 3, 15, 19, 30))).toBe(REVIEW_NOT_COMPLETED_MESSAGE);
  });

  it('libera por status explícito antes do horário', () => {
    expect(validateBookingForReview(OWNER, bookingData({ status: 'completed' }), new Date(2026, 3, 15, 19, 30))).toBeNull();
  });

  it('reconhece os nomes de campo legados', () => {
    const legado = {
      idArena: 'a1',
      bookingAthleteId: 'u1',
      status: 'confirmed',
      data: '2026-04-15',
      horaInicio: '19:00',
      horaFim: '20:30',
    };
    expect(validateBookingForReview(OWNER, legado, afterEnd)).toBeNull();
  });

  it('libera quando a data do doc é inutilizável — confia no gate anterior, como o app', () => {
    const semData = bookingData({ date: '', startTime: '', endTime: '' });
    expect(validateBookingForReview(OWNER, semData, afterEnd)).toBeNull();
  });

  it('libera quando o doc não traz arena nem dono (nada a contradizer)', () => {
    const anonimo = { status: 'confirmed', date: '2026-04-15', startTime: '19:00', endTime: '20:30' };
    expect(validateBookingForReview(OWNER, anonimo, afterEnd)).toBeNull();
  });
});
