export type {
  League,
  LeagueCategory,
  LeagueCountingStagesMode,
  LeagueGenderCat,
  LeagueListingStatus,
  LeagueStage,
} from './league.model';
export {
  LEAGUE_COUNTING_MODE_LABEL,
  LEAGUE_STATUS_LABEL,
  leagueCategoriesForGender,
  leagueDefinedStages,
  leagueFromDoc,
  leagueGendersOf,
  leagueListingStatusOf,
  leagueSportLabel,
} from './league.model';

export { fetchLeague, fetchLeaguesByManager } from './leagues-repository';

export type { LeagueRankingEntry, LeagueRankingRow, LeagueRankingScope, LeagueStageResult } from './league-rankings';
export {
  effectivePointsForMode,
  fetchLeagueRanking,
  leagueRankingEntryFromDoc,
  rankLeagueRows,
} from './league-rankings';

export {
  canCancelLeague,
  canCloseLeagueSeason,
  cancelLeague,
  closeLeagueSeason,
  leagueStatusTransitionAllowed,
} from './league-lifecycle';
