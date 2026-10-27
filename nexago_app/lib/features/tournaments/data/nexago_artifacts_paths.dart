import '../../../firebase_options.dart';

/// Base path para dados legados em `artifacts/{projectId}/public/data/`.
abstract final class NexagoArtifactsPaths {
  NexagoArtifactsPaths._();

  static String get projectId => DefaultFirebaseOptions.currentPlatform.projectId;

  static String get publicDataBase =>
      'artifacts/$projectId/public/data';

  static String teamsCollection() => '$publicDataBase/teams';

  static String athleteRankingsCollection() =>
      '$publicDataBase/athleteRankings';

  static String tournamentCategoryResultsCollection() =>
      '$publicDataBase/tournamentCategoryResults';

  static String teamRankingsCollection() => '$publicDataBase/teamRankings';

  /// Ranking por esporte (multiesporte fase 3a): docs `{id}_{CODE}`.
  static String athleteRankingsBySportCollection() =>
      '$publicDataBase/athleteRankingsBySport';

  static String teamRankingsBySportCollection() =>
      '$publicDataBase/teamRankingsBySport';

  /// Etapas que pontuaram no ranking de cada esporte: doc `{CODE}`.
  static String rankingStagesCollection() => '$publicDataBase/rankingStages';

  static String leagueTeamRankingsCollection() =>
      '$publicDataBase/leagueTeamRankings';

  static String leagueAthleteRankingsCollection() =>
      '$publicDataBase/leagueAthleteRankings';

  static String inscriptionsCollection() =>
      '$publicDataBase/inscriptions';

  static String matchesCollection() => '$publicDataBase/matches';

  static String athleteRatingsCollection() =>
      '$publicDataBase/athleteRatings';

  /// Ledger da engine de rating: um doc por partida, com o rating de cada
  /// atleta antes (`pre`) e depois (`post`).
  static String ratingEventsCollection() => '$publicDataBase/ratingEvents';

  static String matchPointEventsCollection(String matchId) =>
      '${matchesCollection()}/${matchId.trim()}/pointEvents';

  static String matchAuditLogCollection(String matchId) =>
      '${matchesCollection()}/${matchId.trim()}/auditLog';

  static String legacyTournamentDoc(String tournamentId) =>
      '$publicDataBase/tournaments/$tournamentId';
}
