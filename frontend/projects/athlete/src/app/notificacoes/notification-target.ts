import type { AthleteNotification } from '../data/notifications-repository';

export interface NotificationTarget {
  readonly commands: string[];
  readonly queryParams?: Record<string, string>;
}

/** Avisos da reserva com convidados (`functions/src/arena-booking-invite.ts`) que abrem a
 *  própria reserva: o dono vê quem aceitou/recusou/saiu; o convidado, o jogo cancelado. */
const BOOKING_DETAIL_TYPES = new Set([
  'booking_invite_accepted',
  'booking_invite_declined',
  'booking_participant_left',
  'booking_canceled_participant',
]);

/** Para onde o toque no item do inbox leva: a avaliação do torneio e os convites para jogar
 *  numa reserva. O resto continua só marcando como lido. */
export function notificationTarget(
  n: Pick<AthleteNotification, 'type' | 'tournamentId'> & Partial<Pick<AthleteNotification, 'inviteId' | 'bookingId'>>,
): NotificationTarget | null {
  const type = n.type?.toLowerCase() ?? '';
  if ((type === 'tournament_review_request' || type === 'tournament_review_reminder') && n.tournamentId) {
    return { commands: ['/torneios', n.tournamentId, 'minha-inscricao'], queryParams: { avaliar: '1' } };
  }
  if (type === 'booking_invite' && n.inviteId) return { commands: ['/convite', n.inviteId] };
  if (BOOKING_DETAIL_TYPES.has(type) && n.bookingId) return { commands: ['/agenda/reserva', n.bookingId] };
  // Quem foi tirado do jogo não está mais na reserva: a Agenda é o lugar.
  if (type === 'booking_participant_removed') return { commands: ['/agenda'] };
  return null;
}
