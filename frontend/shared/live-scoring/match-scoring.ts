/** Regras de set da mesa e do lançamento rápido nos portais. A lógica mora no núcleo de placar
 *  (`@nexago/sports`, por perfil — o mesmo de `functions/src/sports/scoring.ts` e do app); estas
 *  funções são invólucros com a regra histórica (21, decisivo 15 no 3º set de MD3, vantagem 2),
 *  mantidos pelas assinaturas que a mesa, o telão e o placar já usam. O servidor revalida. */

import {
  isPointsSetWon,
  legacyScoringProfile,
  matchWinnerSide as coreMatchWinnerSide,
  setPointsTarget,
  setsWonBy,
  setWinnerSide as coreSetWinnerSide,
  validateScoreSets,
  type ScoreSet,
  type ScoreValidationIssue,
} from '@nexago/sports';

export type { ScoreSet, ScoreValidationIssue } from '@nexago/sports';

export const DEFAULT_SET_POINTS = 21;
export const TIEBREAK_SET_POINTS = 15;
export const MIN_ADVANTAGE = 2;
export const DEFAULT_BEST_OF = 3;

export function targetPointsForSet(setIndex: number, bestOf: number): number {
  return setPointsTarget(legacyScoringProfile(bestOf), setIndex);
}

export function isSetWon(scoreA: number, scoreB: number, target: number): boolean {
  return isPointsSetWon(scoreA, scoreB, target, MIN_ADVANTAGE, null);
}

export function setWinnerSide(sets: readonly ScoreSet[], index: number, bestOf: number): 'A' | 'B' | null {
  return coreSetWinnerSide(sets, index, legacyScoringProfile(bestOf));
}

export function setsWon(sets: readonly ScoreSet[], bestOf: number): { a: number; b: number } {
  return setsWonBy(sets, legacyScoringProfile(bestOf));
}

export function matchWinnerSide(sets: readonly ScoreSet[], bestOf: number): 'A' | 'B' | null {
  return coreMatchWinnerSide(sets, legacyScoringProfile(bestOf));
}

/** Espelha `validateQuickScoreSubmission` do app — mensagens idênticas (vêm do núcleo). */
export function validateScoreSubmission(sets: readonly ScoreSet[], bestOf: number): ScoreValidationIssue[] {
  return validateScoreSets(sets, legacyScoringProfile(bestOf));
}
