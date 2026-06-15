import 'league_ranking_models.dart';

LeaguePointsCountingMode parseLeagueCountingMode(String? raw) => switch (raw) {
      'best_3_of_5' => LeaguePointsCountingMode.best3Of5,
      'all_stages' => LeaguePointsCountingMode.allStages,
      _ => LeaguePointsCountingMode.best4Of6,
    };

String leagueCountingModeLabel(LeaguePointsCountingMode mode) => switch (mode) {
      LeaguePointsCountingMode.best4Of6 => '4 melhores de 6 etapas',
      LeaguePointsCountingMode.best3Of5 => '3 melhores de 5 etapas',
      LeaguePointsCountingMode.allStages => 'Todas as etapas contam',
    };

int effectivePointsForMode(
  List<LeagueStageResult> stages,
  LeaguePointsCountingMode mode,
) {
  final points = stages.map((s) => s.points).toList()..sort((a, b) => b.compareTo(a));

  if (mode == LeaguePointsCountingMode.allStages) {
    return points.fold(0, (sum, value) => sum + value);
  }

  final take = mode == LeaguePointsCountingMode.best3Of5 ? 3 : 4;
  return points.take(take).fold(0, (sum, value) => sum + value);
}

List<LeagueAthleteRankingRow> buildLeagueAthleteRankingRows(
  List<LeagueAthleteRankingEntry> entries,
  Map<String, String> athleteDisplayNames,
) {
  final sorted = [...entries]
    ..sort((a, b) {
      final byPoints = b.effectivePoints.compareTo(a.effectivePoints);
      if (byPoints != 0) return byPoints;
      return a.athleteId.compareTo(b.athleteId);
    });

  final rows = <LeagueAthleteRankingRow>[];
  for (var i = 0; i < sorted.length; i++) {
    final entry = sorted[i];
    final name = athleteDisplayNames[entry.athleteId]?.trim();
    rows.add(
      LeagueAthleteRankingRow(
        rank: i + 1,
        athleteId: entry.athleteId,
        displayName: (name != null && name.isNotEmpty) ? name : 'Atleta',
        effectivePoints: entry.effectivePoints,
        stagesPlayed: entry.stageResults.length,
      ),
    );
  }
  return rows;
}

List<LeagueTeamRankingRow> buildLeagueTeamRankingRows(
  List<LeagueTeamRankingEntry> entries,
  Map<String, String> teamDisplayNames,
) {
  final sorted = [...entries]
    ..sort((a, b) {
      final byPoints = b.effectivePoints.compareTo(a.effectivePoints);
      if (byPoints != 0) return byPoints;
      return a.teamId.compareTo(b.teamId);
    });

  final rows = <LeagueTeamRankingRow>[];
  for (var i = 0; i < sorted.length; i++) {
    final entry = sorted[i];
    final name = teamDisplayNames[entry.teamId]?.trim();
    rows.add(
      LeagueTeamRankingRow(
        rank: i + 1,
        teamId: entry.teamId,
        displayName: (name != null && name.isNotEmpty) ? name : 'Dupla',
        effectivePoints: entry.effectivePoints,
        stagesPlayed: entry.stageResults.length,
        rawPoints: entry.rawPoints != entry.effectivePoints
            ? entry.rawPoints
            : null,
      ),
    );
  }
  return rows;
}
