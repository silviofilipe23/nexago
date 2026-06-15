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

  static String inscriptionsCollection() =>
      '$publicDataBase/inscriptions';

  static String matchesCollection() => '$publicDataBase/matches';

  static String matchPointEventsCollection(String matchId) =>
      '${matchesCollection()}/${matchId.trim()}/pointEvents';

  static String matchAuditLogCollection(String matchId) =>
      '${matchesCollection()}/${matchId.trim()}/auditLog';

  static String legacyTournamentDoc(String tournamentId) =>
      '$publicDataBase/tournaments/$tournamentId';
}
