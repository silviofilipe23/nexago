import type { AthleteNotification } from '../data/notifications-repository';

export interface NotificationTarget {
  readonly commands: string[];
  readonly queryParams?: Record<string, string>;
}

/** Para onde o toque no item do inbox leva. Hoje só a avaliação do torneio navega; o resto
 *  continua só marcando como lido. */
export function notificationTarget(n: Pick<AthleteNotification, 'type' | 'tournamentId'>): NotificationTarget | null {
  const type = n.type?.toLowerCase() ?? '';
  if ((type === 'tournament_review_request' || type === 'tournament_review_reminder') && n.tournamentId) {
    return { commands: ['/torneios', n.tournamentId, 'minha-inscricao'], queryParams: { avaliar: '1' } };
  }
  return null;
}
