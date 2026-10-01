/**
 * Destinos das notificações de quem OPERA o torneio (dono e staff gestor).
 *
 * `deliverNotificationToUser` entrega o MESMO `data` ao app (FCM + inbox) e ao portal do
 * organizador (Web Push + sino). O `url` levava `/painel/...`, que é rota do PORTAL: no app o
 * toque abria uma rota inexistente (tela de erro do GoRouter).
 *
 * Por isso são dois campos:
 *  - `url`: rota do APP. Os builds antigos da loja só leem `url` e navegam pra ele como está,
 *    então tem de ser uma rota que já existe neles.
 *  - `webUrl`: rota do portal. O service worker (`push-sw.js`) e o sino do portal leem
 *    `webUrl ?? url`.
 */
export interface OrganizerNotificationLinks {
  url: string;
  webUrl: string;
}

/** Torneio no app; lista de inscrições no portal (com a inscrição em foco, quando houver). */
export function organizerTournamentNotificationLinks(
  tournamentId: string,
  registrationId?: string,
): OrganizerNotificationLinks {
  const focus = registrationId ? `?registrationId=${registrationId}` : "";
  return {
    url: `/organizer/tournaments/${tournamentId}`,
    webUrl: `/painel/eventos/${tournamentId}/inscricoes${focus}`,
  };
}

/** Carteira do organizador: no app e no portal. */
export const ORGANIZER_WALLET_NOTIFICATION_LINKS: OrganizerNotificationLinks = {
  url: "/organizer/wallet",
  webUrl: "/painel/financeiro",
};
