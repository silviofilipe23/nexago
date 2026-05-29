import 'ranking_constants.dart';
import 'ranking_list_models.dart';
import 'ranking_models.dart';

/// Agrupa pontos brutos por atleta e monta linhas da temporada (melhores N).
List<AthleteRankingRow> buildAthleteRankingRowsFromPointsByAthlete(
  Map<String, List<int>> pointsByAthlete, {
  int year = 0,
  int n = bestNResults,
}) {
  final rows = <AthleteRankingRow>[];
  for (final entry in pointsByAthlete.entries) {
    final points = entry.value;
    final total = sumBestNPoints(points, n: n);
    rows.add(
      AthleteRankingRow(
        rank: 0,
        athleteId: entry.key,
        totalPoints: total,
        tournamentsCount: points.length,
        pointsByYear: year > 0 ? {year.toString(): total} : const {},
      ),
    );
  }
  rows.sort((a, b) => b.totalPoints.compareTo(a.totalPoints));
  return assignRanks(rows);
}

/// Atribui posições 1, 2, 3… preservando ordem por pontos.
List<AthleteRankingRow> assignRanks(List<AthleteRankingRow> rows) {
  return [
    for (var i = 0; i < rows.length; i++)
      rows[i].copyWith(rank: i + 1),
  ];
}

/// Monta ranking geral a partir de entradas agregadas Firestore.
List<AthleteRankingRow> buildAthleteRankingRowsFromEntries(
  List<AthleteRankingEntry> entries,
) {
  final sorted = [...entries]
    ..sort((a, b) => b.totalPoints.compareTo(a.totalPoints));
  return [
    for (var i = 0; i < sorted.length; i++)
      AthleteRankingRow(
        rank: i + 1,
        athleteId: sorted[i].athleteId,
        totalPoints: sorted[i].totalPoints,
        tournamentsCount: sorted[i].tournamentsCount,
        pointsByYear: sorted[i].pointsByYear,
      ),
  ];
}

/// Pontos que faltam para ultrapassar o atleta imediatamente acima.
int? pointsToNextRank(List<AthleteRankingRow> rows, String athleteId) {
  final index = rows.indexWhere((row) => row.athleteId == athleteId);
  if (index <= 0) return null;
  final current = rows[index];
  final above = rows[index - 1];
  final gap = above.totalPoints - current.totalPoints;
  return gap <= 0 ? 1 : gap + 1;
}

/// Progresso relativo entre posição atual e a imediatamente acima (0–1).
double promotionProgressTowardNextRank(
  List<AthleteRankingRow> rows,
  String athleteId,
) {
  final index = rows.indexWhere((row) => row.athleteId == athleteId);
  if (index <= 0) return 1;
  final current = rows[index];
  final above = rows[index - 1];
  final below = index + 1 < rows.length ? rows[index + 1] : null;

  final upper = above.totalPoints;
  final lower = below?.totalPoints ?? 0;
  if (upper <= lower) return 0.5;
  final span = upper - lower;
  final progress = (current.totalPoints - lower) / span;
  return progress.clamp(0, 1);
}

/// Top N + usuário atual (se fora do top).
List<AthleteRankingRow> previewRankingRows(
  List<AthleteRankingRow> rows, {
  int topCount = 3,
  String? currentAthleteId,
}) {
  if (rows.isEmpty) return const [];

  final top = rows.take(topCount).toList();
  if (currentAthleteId == null || currentAthleteId.isEmpty) {
    return top;
  }

  final userRow = rows.where((r) => r.athleteId == currentAthleteId).firstOrNull;
  if (userRow == null || top.any((r) => r.athleteId == currentAthleteId)) {
    return top;
  }
  return [...top, userRow];
}

/// Agrupa pontos brutos por equipe e monta linhas da temporada (melhores N).
List<TeamRankingRow> buildTeamRankingRowsFromPointsByTeam(
  Map<String, List<int>> pointsByTeam, {
  int year = 0,
  int n = bestNResults,
}) {
  final rows = <TeamRankingRow>[];
  for (final entry in pointsByTeam.entries) {
    final points = entry.value;
    final total = sumBestNPoints(points, n: n);
    rows.add(
      TeamRankingRow(
        rank: 0,
        teamId: entry.key,
        totalPoints: total,
        tournamentsCount: points.length,
        pointsByYear: year > 0 ? {year.toString(): total} : const {},
      ),
    );
  }
  rows.sort((a, b) => b.totalPoints.compareTo(a.totalPoints));
  return assignTeamRanks(rows);
}

List<TeamRankingRow> assignTeamRanks(List<TeamRankingRow> rows) {
  return [
    for (var i = 0; i < rows.length; i++)
      rows[i].copyWith(rank: i + 1),
  ];
}

List<TeamRankingRow> buildTeamRankingRowsFromEntries(
  List<TeamRankingEntry> entries,
) {
  final sorted = [...entries]
    ..sort((a, b) => b.totalPoints.compareTo(a.totalPoints));
  return [
    for (var i = 0; i < sorted.length; i++)
      TeamRankingRow(
        rank: i + 1,
        teamId: sorted[i].teamId,
        totalPoints: sorted[i].totalPoints,
        tournamentsCount: sorted[i].tournamentsCount,
        pointsByYear: sorted[i].pointsByYear,
      ),
  ];
}

RankingGenderFilter? normalizeRankingGender(String? raw) {
  if (raw == null || raw.trim().isEmpty) return null;
  final n = raw.trim().toLowerCase();
  if (n.startsWith('masc') || n == 'm' || n == 'male') {
    return RankingGenderFilter.male;
  }
  if (n.startsWith('fem') || n == 'f' || n == 'female') {
    return RankingGenderFilter.female;
  }
  if (n.startsWith('mix') || n == 'misto' || n == 'x') {
    return RankingGenderFilter.mixed;
  }
  return null;
}

bool matchesRankingGenderFilter(
  RankingGenderFilter filter,
  RankingGenderFilter? entityGender,
) {
  if (filter == RankingGenderFilter.all) return true;
  return entityGender == filter;
}

List<AthleteRankingRow> filterAthleteRowsByGender(
  List<AthleteRankingRow> rows,
  RankingGenderFilter filter,
  Map<String, RankingGenderFilter?> genderByAthleteId,
) {
  if (filter == RankingGenderFilter.all) return rows;
  final filtered = rows
      .where(
        (row) => matchesRankingGenderFilter(
          filter,
          genderByAthleteId[row.athleteId],
        ),
      )
      .toList();
  return assignRanks(filtered);
}

List<TeamRankingRow> filterTeamRowsByGender(
  List<TeamRankingRow> rows,
  RankingGenderFilter filter,
  Map<String, RankingGenderFilter?> genderByTeamId,
) {
  if (filter == RankingGenderFilter.all) return rows;
  final filtered = rows
      .where(
        (row) =>
            matchesRankingGenderFilter(filter, genderByTeamId[row.teamId]),
      )
      .toList();
  return assignTeamRanks(filtered);
}

List<RankingListEntry> filterRankingEntriesBySearch(
  List<RankingListEntry> entries,
  String query,
) {
  final q = query.trim();
  if (q.isEmpty) return entries;
  return entries.where((e) => e.matchesSearch(q)).toList();
}
