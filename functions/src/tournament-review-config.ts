import type {Firestore} from "firebase-admin/firestore";

/**
 * Kill-switch do rollout da avaliação de torneio — doc `appConfig/tournamentReviews`.
 * Ausente ou inválido = desligado: o job sobe sem mandar push até alguém ligar
 * (`functions/scripts/set-tournament-reviews-flag.js`).
 */
export const TOURNAMENT_REVIEWS_CONFIG_PATH = "appConfig/tournamentReviews";

export type TournamentReviewsConfig = {enabled: boolean};

export function parseTournamentReviewsConfig(raw: unknown): TournamentReviewsConfig {
  const data = (raw ?? {}) as Record<string, unknown>;
  return {enabled: data.enabled === true};
}

export async function loadTournamentReviewsConfig(db: Firestore): Promise<TournamentReviewsConfig> {
  const snap = await db.doc(TOURNAMENT_REVIEWS_CONFIG_PATH).get();
  return parseTournamentReviewsConfig(snap.exists ? snap.data() : undefined);
}
