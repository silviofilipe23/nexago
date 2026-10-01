/**
 * Avaliação do torneio pelos atletas — constantes e caminhos compartilhados.
 * Spec: docs/superpowers/specs/2026-10-01-tournament-athlete-reviews-design.md
 *
 * A lista de aspectos tem cópias no app e nos portais; o teste de paridade de cada
 * superfície compara com esta.
 */

export const TOURNAMENT_REVIEW_ASPECTS = [
  "organization",
  "schedule",
  "refereeing",
  "venue",
  "prizes",
] as const;

export type TournamentReviewAspect = typeof TOURNAMENT_REVIEW_ASPECTS[number];

/** Abaixo disso não há nota pública, nem comentário legível pelo organizador. */
export const MIN_PUBLIC_REVIEWS = 3;
export const REVIEW_WINDOW_DAYS = 14;
export const REVIEW_REMINDER_AFTER_DAYS = 3;
/** Só abre janela de torneio encerrado há no máximo isso: o deploy (ou ligar a flag) não pode
 *  disparar push para torneio antigo. */
export const REVIEW_LOOKBACK_DAYS = 3;
/** Sem `completed`, a janela abre `endAt` + isto. */
export const REVIEW_END_GRACE_HOURS = 12;
export const MAX_REVIEW_COMMENT_LENGTH = 1000;
export const XP_TOURNAMENT_REVIEW = 10;

export const HOUR_MS = 60 * 60 * 1000;
export const DAY_MS = 24 * HOUR_MS;

export const TOURNAMENT_REVIEWS_COLLECTION = "tournamentReviews";
export const TOURNAMENT_REVIEW_SUMMARIES_COLLECTION = "tournamentReviewSummaries";
export const ORGANIZER_REPUTATION_COLLECTION = "organizerReputation";
export const TOURNAMENT_REVIEW_INVITES_SUBCOLLECTION = "tournamentReviewInvites";
export const ANONYMOUS_REVIEWS_SUBCOLLECTION = "anonymousReviews";

export const TOURNAMENT_REVIEW_NOTIFICATION_TYPES = {
  request: "tournament_review_request",
  reminder: "tournament_review_reminder",
  closed: "tournament_review_closed",
} as const;

export function tournamentReviewDocId(tournamentId: string, uid: string): string {
  return `${tournamentId}_${uid}`;
}

export function reviewInvitePath(uid: string, tournamentId: string): string {
  return `users/${uid}/${TOURNAMENT_REVIEW_INVITES_SUBCOLLECTION}/${tournamentId}`;
}

export function anonymousReviewPath(tournamentId: string, anonId: string): string {
  return `tournaments/${tournamentId}/${ANONYMOUS_REVIEWS_SUBCOLLECTION}/${anonId}`;
}
