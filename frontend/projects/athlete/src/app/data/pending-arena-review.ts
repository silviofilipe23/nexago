import { bookingEndsAt, bookingIsActive, bookingStartsAt, type MyBooking } from './my-bookings-repository';

/** Espelha `_reviewPromptDelayAfterEnd` (arena_review_providers.dart): a reserva só entra
 *  na fila de avaliação 5 minutos depois de acabar. */
const REVIEW_PROMPT_DELAY_MS = 5 * 60_000;

const DAY_MS = 86_400_000;

/** Janela do convite automático. Reserva mais antiga que isso continua avaliável pelos
 *  CTAs do detalhe e do histórico, mas não abre modal nem cobra no card "Precisa de você" —
 *  cobrar por um jogo de meses atrás é ruído, não lembrete. */
export const AUTO_PROMPT_WINDOW_DAYS = 30;

/** Campos que o modal precisa da reserva. `MyBooking` e `ArenaBookingDoc` satisfazem os dois
 *  estruturalmente, então nenhuma tela precisa converter nada. */
export interface ReviewableBooking {
  id: string;
  arenaId: string;
  arenaName: string;
  courtName: string;
  dateKey: string;
  startTime: string;
  endTime: string;
}

export type ReviewEligibilityFields = Pick<MyBooking, 'status' | 'dateKey' | 'startTime' | 'endTime'>;

const TIME_RE = /^\d{2}:\d{2}$/;

/** Fim real da reserva, somando um dia quando ela cruza a meia-noite (22:00→01:00).
 *  `bookingEndsAt` não faz esse ajuste — e aqui ele importa, porque "5 minutos depois do
 *  fim" é o gatilho da avaliação. Null quando não dá pra datar o fim. */
function reviewEndsAt(booking: ReviewEligibilityFields): Date | null {
  if (!TIME_RE.test(booking.endTime)) return null;
  const start = bookingStartsAt(booking);
  const end = bookingEndsAt(booking);
  if (start == null || end == null) return null;
  if (end.getTime() > start.getTime()) return end;
  const adjusted = new Date(end);
  adjusted.setDate(adjusted.getDate() + 1);
  return adjusted;
}

/** `true` quando não dá pra afirmar que a reserva terminou por falta de data/hora utilizável.
 *  Quem valida a escrita trata isso como "confia no gate anterior" — mesma decisão do app. */
export function bookingEndIsUnknown(booking: ReviewEligibilityFields): boolean {
  return reviewEndsAt(booking) == null;
}

/** Espelha o filtro de `pendingReviewProvider` (Dart): concluída por status explícito ou por
 *  tempo, nunca cancelada. */
export function bookingIsReviewable(booking: ReviewEligibilityFields, now: Date): boolean {
  if (!bookingIsActive(booking)) return false;
  const status = booking.status.trim().toLowerCase();
  if (status === 'completed' || status === 'finalizado') return true;
  const endsAt = reviewEndsAt(booking);
  if (endsAt == null) return false;
  return now.getTime() > endsAt.getTime() + REVIEW_PROMPT_DELAY_MS;
}

/** Gate de oferta de avaliação (CTA nas três telas + convite automático): além de
 *  `bookingIsReviewable`, exige `arenaId` não vazio, porque `submitArenaReview` sempre falha
 *  sem ele ("Dados inválidos para avaliação."). Não é o mesmo gate de `validateBookingForReview`
 *  (que confia no doc bruto quando ele não contradiz nada) — ali é sobre o que o backend
 *  aceita, aqui é sobre o que a UI deveria nem oferecer. Espelha o guard duplicado em
 *  `arena_review_providers.dart:104,148` (`if (arenaId.isEmpty) continue;`). */
export function bookingIsReviewCandidate(
  booking: ReviewEligibilityFields & Pick<MyBooking, 'arenaId'>,
  now: Date,
): boolean {
  return booking.arenaId.trim().length > 0 && bookingIsReviewable(booking, now);
}

/** Candidata ao convite automático: concluída, não avaliada e dentro da janela de 30 dias.
 *  Entre as elegíveis vence a de fim mais recente — o app pega a primeira da ordem do stream,
 *  que é arbitrária (duas queries mescladas por id); perguntar sobre o jogo mais fresco é o
 *  que o atleta consegue responder. */
export function pickPendingReview(
  bookings: readonly MyBooking[],
  reviewedBookingIds: ReadonlySet<string>,
  now: Date,
): MyBooking | null {
  const windowStart = now.getTime() - AUTO_PROMPT_WINDOW_DAYS * DAY_MS;
  let best: MyBooking | null = null;
  let bestEnd = Number.NEGATIVE_INFINITY;

  for (const booking of bookings) {
    if (reviewedBookingIds.has(booking.id)) continue;
    if (!bookingIsReviewCandidate(booking, now)) continue;
    const endsAt = reviewEndsAt(booking);
    if (endsAt == null) continue;
    const end = endsAt.getTime();
    if (end < windowStart) continue;
    if (end > bestEnd) {
      best = booking;
      bestEnd = end;
    }
  }

  return best;
}
