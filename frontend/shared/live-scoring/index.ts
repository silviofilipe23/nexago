/** Motor de placar compartilhado pelos portais (organizador e atleta): as regras de set, a
 *  marcação ponto a ponto da mesa ao vivo e o acesso ao doc da partida. Vive fora dos projetos
 *  porque o MESÁRIO opera pelos dois — mesma escrita, mesmas regras, um desenho só. */

export type { ScoreSet, ScoreValidationIssue } from './match-scoring';
export {
  DEFAULT_BEST_OF,
  DEFAULT_SET_POINTS,
  MIN_ADVANTAGE,
  TIEBREAK_SET_POINTS,
  isSetWon,
  matchWinnerSide,
  setWinnerSide,
  setsWon,
  targetPointsForSet,
  validateScoreSubmission,
} from './match-scoring';

export type { ApplyPointResult, BestOfChangeResult, LiveSet } from './live-scoring';
export {
  applyBestOfChange,
  applyPoint,
  canReduceBestOf,
  elapsedSecondsFromStart,
  formatElapsedMmSs,
  liveSetToMap,
  needsStartingServe,
  playedSetsCount,
  setPointHint,
  setRulesLabel,
  setsWonOf,
  undoPoint,
} from './live-scoring';

export type { MatchDisplayStatus } from './match-status';
export { statusOf } from './match-status';

export type { LiveMatch, LivePointEvent, LiveScoringContext } from './live-match-repository';
export {
  lastUndoablePoint,
  liveMatchFromDoc,
  recordPointTransaction,
  updateMatchFields,
  watchLiveMatch,
  watchPointEvents,
} from './live-match-repository';
