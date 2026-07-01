enum LeaguePointsCountingMode {
  best4Of6,
  best3Of5,
  allStages,
}

class LeagueTeamRankingEntry {
  const LeagueTeamRankingEntry({
    required this.id,
    required this.leagueId,
    required this.categoryId,
    required this.teamId,
    required this.stageResults,
    required this.effectivePoints,
    required this.rawPoints,
    required this.countingMode,
  });

  final String id;
  final String leagueId;
  final String categoryId;
  final String teamId;
  final List<LeagueStageResult> stageResults;
  final int effectivePoints;
  final int rawPoints;
  final LeaguePointsCountingMode countingMode;
}

class LeagueStageResult {
  const LeagueStageResult({
    required this.tournamentId,
    required this.place,
    required this.points,
    this.stageOrder = 0,
    this.placementBucket,
  });

  final String tournamentId;
  final int place;
  final int points;
  final int stageOrder;
  final String? placementBucket;
}

class LeagueTeamRankingRow {
  const LeagueTeamRankingRow({
    required this.rank,
    required this.teamId,
    required this.displayName,
    required this.effectivePoints,
    required this.stagesPlayed,
    this.rawPoints,
  });

  final int rank;
  final String teamId;
  final String displayName;
  final int effectivePoints;
  final int stagesPlayed;
  final int? rawPoints;
}

class LeagueAthleteRankingEntry {
  const LeagueAthleteRankingEntry({
    required this.id,
    required this.leagueId,
    required this.categoryId,
    required this.athleteId,
    required this.stageResults,
    required this.effectivePoints,
    required this.rawPoints,
    required this.countingMode,
  });

  final String id;
  final String leagueId;
  final String categoryId;
  final String athleteId;
  final List<LeagueStageResult> stageResults;
  final int effectivePoints;
  final int rawPoints;
  final LeaguePointsCountingMode countingMode;
}

class LeagueAthleteRankingRow {
  const LeagueAthleteRankingRow({
    required this.rank,
    required this.athleteId,
    required this.displayName,
    required this.effectivePoints,
    required this.stagesPlayed,
  });

  final int rank;
  final String athleteId;
  final String displayName;
  final int effectivePoints;
  final int stagesPlayed;
}

class DiscoveryLeagueCategory {
  const DiscoveryLeagueCategory({
    required this.id,
    required this.name,
    this.genderType,
  });

  final String id;
  final String name;
  /// Persistência Firestore: `male` | `female` | `mixed`.
  final String? genderType;
}
