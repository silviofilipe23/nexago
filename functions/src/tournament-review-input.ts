import {HttpsError} from "firebase-functions/v2/https";
import {
  MAX_REVIEW_COMMENT_LENGTH,
  TOURNAMENT_REVIEW_ASPECTS,
  type TournamentReviewAspect,
} from "./tournament-review-constants";

export type TournamentReviewAspects = Partial<Record<TournamentReviewAspect, number>>;

export interface TournamentReviewInput {
  tournamentId: string;
  overall: number;
  aspects: TournamentReviewAspects;
  comment: string | null;
}

function isStar(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 5;
}

/**
 * Entrada de `submitTournamentReview`. Única validação do sistema: o cliente nunca grava nas
 * coleções da avaliação, então o que passa daqui é o que fica guardado.
 */
export function parseTournamentReviewInput(raw: unknown): TournamentReviewInput {
  const data = (raw ?? {}) as Record<string, unknown>;

  const tournamentId = typeof data.tournamentId === "string" ? data.tournamentId.trim() : "";
  if (!tournamentId) throw new HttpsError("invalid-argument", "Torneio inválido.");

  const overall = data.overall;
  if (!isStar(overall)) {
    throw new HttpsError("invalid-argument", "Dê uma nota geral de 1 a 5 estrelas.");
  }

  const aspects: TournamentReviewAspects = {};
  const rawAspects = data.aspects;
  if (rawAspects != null) {
    if (typeof rawAspects !== "object" || Array.isArray(rawAspects)) {
      throw new HttpsError("invalid-argument", "Notas por aspecto inválidas.");
    }
    for (const [key, value] of Object.entries(rawAspects as Record<string, unknown>)) {
      if (!(TOURNAMENT_REVIEW_ASPECTS as readonly string[]).includes(key)) {
        throw new HttpsError("invalid-argument", `Aspecto desconhecido: ${key}.`);
      }
      if (value == null) continue;
      if (!isStar(value)) {
        throw new HttpsError("invalid-argument", "Cada aspecto vai de 1 a 5 estrelas.");
      }
      aspects[key as TournamentReviewAspect] = value;
    }
  }

  let comment: string | null = null;
  if (data.comment != null) {
    if (typeof data.comment !== "string") {
      throw new HttpsError("invalid-argument", "Comentário inválido.");
    }
    const trimmed = data.comment.trim();
    if (trimmed.length > MAX_REVIEW_COMMENT_LENGTH) {
      throw new HttpsError(
        "invalid-argument",
        `O comentário passa de ${MAX_REVIEW_COMMENT_LENGTH} caracteres.`,
      );
    }
    comment = trimmed.length > 0 ? trimmed : null;
  }

  return {tournamentId, overall, aspects, comment};
}
