import {EVENT_TIME_ZONE} from "./event-timezone";
import type {DeliverNotificationInput} from "./notification-delivery";
import {
  MIN_PUBLIC_REVIEWS,
  TOURNAMENT_REVIEW_NOTIFICATION_TYPES as TYPES,
  XP_TOURNAMENT_REVIEW,
} from "./tournament-review-constants";

/**
 * Payloads dos 3 pushes da avaliação de torneio.
 *
 * `url` é SEMPRE uma rota que o app antigo conhece: `resolveNotificationRoute`
 * (nexago_app/lib/core/notifications/notification_navigation.dart) usa a url antes do tipo e o
 * router não tem errorBuilder. O build novo checa o tipo primeiro e abre o formulário. O portal
 * do organizador lê `webUrl` (push-sw.js e inbox).
 */

function label(tournamentName: string): string {
  return tournamentName.trim() || "torneio";
}

function formatDayMonth(ms: number): string {
  return new Intl.DateTimeFormat("pt-BR", {day: "2-digit", month: "2-digit", timeZone: EVENT_TIME_ZONE})
    .format(new Date(ms));
}

function formatAverage(average: number): string {
  return average.toFixed(1).replace(".", ",");
}

export function reviewRequestNotification(p: {
  uid: string;
  tournamentId: string;
  tournamentName: string;
}): DeliverNotificationInput {
  return {
    userId: p.uid,
    title: `Como foi o ${label(p.tournamentName)}?`,
    body: `Avalie em 10 segundos e ganhe ${XP_TOURNAMENT_REVIEW} XP.`,
    type: TYPES.request,
    data: {tournamentId: p.tournamentId, url: `/torneios/${p.tournamentId}`},
    requireInteraction: false,
  };
}

export function reviewReminderNotification(p: {
  uid: string;
  tournamentId: string;
  tournamentName: string;
  closesAtMs: number;
}): DeliverNotificationInput {
  return {
    userId: p.uid,
    title: `Ainda dá tempo de avaliar o ${label(p.tournamentName)}`,
    body: `A avaliação fecha em ${formatDayMonth(p.closesAtMs)}.`,
    type: TYPES.reminder,
    data: {tournamentId: p.tournamentId, url: `/torneios/${p.tournamentId}`},
    requireInteraction: false,
  };
}

export function reviewClosedNotification(p: {
  uid: string;
  tournamentId: string;
  tournamentName: string;
  count: number;
  average: number | null;
}): DeliverNotificationInput {
  const body = p.count >= MIN_PUBLIC_REVIEWS && p.average != null ?
    `${formatAverage(p.average)} ★ com ${p.count} avaliações.` :
    `Recebeu ${p.count} ${p.count === 1 ? "avaliação" : "avaliações"}, poucas para exibir.`;
  return {
    userId: p.uid,
    title: `Avaliações do ${label(p.tournamentName)} encerradas`,
    body,
    type: TYPES.closed,
    data: {
      tournamentId: p.tournamentId,
      url: `/organizer/tournaments/${p.tournamentId}`,
      webUrl: `/painel/eventos/${p.tournamentId}/avaliacoes`,
    },
    requireInteraction: false,
  };
}
