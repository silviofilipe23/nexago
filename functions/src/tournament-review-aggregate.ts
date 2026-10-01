import {
  MIN_PUBLIC_REVIEWS,
  TOURNAMENT_REVIEW_ASPECTS,
  type TournamentReviewAspect,
} from "./tournament-review-constants";

export type StarDistribution = {"1": number; "2": number; "3": number; "4": number; "5": number};

export interface AspectAggregate {
  count: number;
  average: number;
}

export interface ReviewAggregate {
  count: number;
  average: number | null;
  distribution: StarDistribution | null;
  aspects: Partial<Record<TournamentReviewAspect, AspectAggregate>> | null;
}

function star(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 5 ?
    value :
    null;
}

/** Duas casas: a tela mostra uma; o resto é ruído no doc. */
function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Agrega docs de `tournamentReviews`. Doc com `overall` inválido fica de fora de tudo.
 * Abaixo de MIN_PUBLIC_REVIEWS só a contagem sai: média, distribuição e aspectos ficam null,
 * senão o doc público entregaria a nota de uma avaliação única.
 */
export function computeReviewAggregate(
  reviews: ReadonlyArray<Record<string, unknown>>,
): ReviewAggregate {
  const distribution: StarDistribution = {"1": 0, "2": 0, "3": 0, "4": 0, "5": 0};
  const aspectSums = new Map<TournamentReviewAspect, {sum: number; count: number}>();
  let sum = 0;
  let count = 0;

  for (const review of reviews) {
    const overall = star(review.overall);
    if (overall == null) continue;
    count += 1;
    sum += overall;
    distribution[String(overall) as keyof StarDistribution] += 1;

    const aspects = (review.aspects ?? {}) as Record<string, unknown>;
    for (const key of TOURNAMENT_REVIEW_ASPECTS) {
      const value = star(aspects[key]);
      if (value == null) continue;
      const acc = aspectSums.get(key) ?? {sum: 0, count: 0};
      acc.sum += value;
      acc.count += 1;
      aspectSums.set(key, acc);
    }
  }

  if (count < MIN_PUBLIC_REVIEWS) {
    return {count, average: null, distribution: null, aspects: null};
  }

  const aspects: Partial<Record<TournamentReviewAspect, AspectAggregate>> = {};
  for (const key of TOURNAMENT_REVIEW_ASPECTS) {
    const acc = aspectSums.get(key);
    if (acc) aspects[key] = {count: acc.count, average: round2(acc.sum / acc.count)};
  }
  return {count, average: round2(sum / count), distribution, aspects};
}
