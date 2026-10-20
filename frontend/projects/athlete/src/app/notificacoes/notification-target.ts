import { safeExternalUrl } from '../data/class-agenda-repository';
import type { AthleteNotification } from '../data/notifications-repository';

/** Rota do portal ou, para a fatura da mensalidade de aula, o link externo (nova aba). */
export type NotificationTarget =
  | { readonly commands: string[]; readonly queryParams?: Record<string, string> }
  | { readonly externalUrl: string };

/** Avisos da reserva com convidados (`functions/src/arena-booking-invite.ts`) que abrem a
 *  própria reserva: o dono vê quem aceitou/recusou/saiu; o convidado, o jogo cancelado. */
const BOOKING_DETAIL_TYPES = new Set([
  'booking_invite_accepted',
  'booking_invite_declined',
  'booking_participant_left',
  'booking_canceled_participant',
]);

/** Para onde o toque no item do inbox leva: a avaliação do torneio, os convites para jogar
 *  numa reserva, a fatura da mensalidade de aula e o vínculo de professor. O resto continua só
 *  marcando como lido. */
export function notificationTarget(
  n: Pick<AthleteNotification, 'type' | 'tournamentId'> &
    Partial<Pick<AthleteNotification, 'inviteId' | 'bookingId' | 'invoiceUrl' | 'linkId'>>,
): NotificationTarget | null {
  const type = n.type?.toLowerCase() ?? '';
  // Mensalidade de aula (`ensureClassAsaasPayment`): a fatura do Asaas, como no app; sem link, a
  // Agenda, onde a mensalidade a pagar aparece.
  if (type === 'arena_class_charge_link') {
    const url = safeExternalUrl(n.invoiceUrl);
    return url ? { externalUrl: url } : { commands: ['/agenda'] };
  }
  if ((type === 'tournament_review_request' || type === 'tournament_review_reminder') && n.tournamentId) {
    return { commands: ['/torneios', n.tournamentId, 'minha-inscricao'], queryParams: { avaliar: '1' } };
  }
  if (type === 'booking_invite' && n.inviteId) return { commands: ['/convite', n.inviteId] };
  if (BOOKING_DETAIL_TYPES.has(type) && n.bookingId) return { commands: ['/agenda/reserva', n.bookingId] };
  // Quem foi tirado do jogo não está mais na reserva: a Agenda é o lugar.
  if (type === 'booking_participant_removed') return { commands: ['/agenda'] };
  // Vínculo professor ↔ arena (convite, aprovação, suspensão…): o próprio vínculo, como o
  // `webUrl` do push; sem `linkId`, a lista de Minhas arenas.
  if (type.startsWith('professor_link_')) {
    return n.linkId ? { commands: ['/professor/arenas', n.linkId] } : { commands: ['/professor/arenas'] };
  }
  return null;
}
