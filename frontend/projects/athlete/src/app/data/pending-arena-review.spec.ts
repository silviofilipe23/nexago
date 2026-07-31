import type { MyBooking } from './my-bookings-repository';
import { AUTO_PROMPT_WINDOW_DAYS, bookingEndIsUnknown, bookingIsReviewable, pickPendingReview } from './pending-arena-review';

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

describe('bookingIsReviewable', () => {
  it('libera a reserva que terminou há mais de 5 minutos', () => {
    expect(bookingIsReviewable(booking(), new Date(2026, 3, 15, 20, 36))).toBe(true);
  });

  it('segura a reserva que acabou de terminar (dentro dos 5 minutos)', () => {
    expect(bookingIsReviewable(booking(), new Date(2026, 3, 15, 20, 33))).toBe(false);
  });

  it('não libera reserva futura', () => {
    expect(bookingIsReviewable(booking(), new Date(2026, 3, 15, 18, 0))).toBe(false);
  });

  it('nunca libera reserva cancelada, nas duas grafias', () => {
    const now = new Date(2026, 3, 15, 22, 0);
    expect(bookingIsReviewable(booking({ status: 'canceled' }), now)).toBe(false);
    expect(bookingIsReviewable(booking({ status: 'CANCELLED' }), now)).toBe(false);
  });

  it('libera por status explícito mesmo antes do horário terminar', () => {
    const now = new Date(2026, 3, 15, 19, 10);
    expect(bookingIsReviewable(booking({ status: 'completed' }), now)).toBe(true);
    expect(bookingIsReviewable(booking({ status: 'finalizado' }), now)).toBe(true);
  });

  it('trata a reserva que cruza a meia-noite somando um dia ao fim', () => {
    const crossing = booking({ startTime: '22:00', endTime: '01:00' });
    expect(bookingIsReviewable(crossing, new Date(2026, 3, 16, 0, 30))).toBe(false);
    expect(bookingIsReviewable(crossing, new Date(2026, 3, 16, 1, 10))).toBe(true);
  });

  it('não libera por tempo quando o fim é inutilizável', () => {
    const broken = booking({ endTime: '--:--' });
    expect(bookingIsReviewable(broken, new Date(2026, 3, 20, 12, 0))).toBe(false);
    expect(bookingEndIsUnknown(broken)).toBe(true);
    expect(bookingEndIsUnknown(booking())).toBe(false);
  });
});

describe('pickPendingReview', () => {
  const now = new Date(2026, 3, 20, 12, 0);
  const noneReviewed: ReadonlySet<string> = new Set<string>();

  it('escolhe a reserva concluída de fim mais recente', () => {
    const older = booking({ id: 'antiga', dateKey: '2026-04-10' });
    const newer = booking({ id: 'recente', dateKey: '2026-04-18' });
    expect(pickPendingReview([older, newer], noneReviewed, now)?.id).toBe('recente');
    expect(pickPendingReview([newer, older], noneReviewed, now)?.id).toBe('recente');
  });

  it('ignora as reservas já avaliadas', () => {
    const reviewed = booking({ id: 'recente', dateKey: '2026-04-18' });
    const pendente = booking({ id: 'pendente', dateKey: '2026-04-10' });
    expect(pickPendingReview([reviewed, pendente], new Set(['recente']), now)?.id).toBe('pendente');
  });

  it('devolve null com lista vazia', () => {
    expect(pickPendingReview([], noneReviewed, now)).toBeNull();
  });

  it('devolve null quando a única candidata está fora da janela de 30 dias', () => {
    const antiga = booking({ id: 'antiga', dateKey: '2026-03-01' });
    expect(pickPendingReview([antiga], noneReviewed, now)).toBeNull();
  });

  it('a candidata fora da janela continua avaliável fora do convite automático', () => {
    expect(bookingIsReviewable(booking({ dateKey: '2026-03-01' }), now)).toBe(true);
    expect(AUTO_PROMPT_WINDOW_DAYS).toBe(30);
  });

  it('ignora reserva sem fim utilizável (nunca cobra pelo que não dá pra datar)', () => {
    expect(pickPendingReview([booking({ endTime: '--:--' })], noneReviewed, now)).toBeNull();
  });
});
