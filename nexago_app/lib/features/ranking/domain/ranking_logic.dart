import 'package:nexago_app/core/profiles/app_user_profile.dart';
import 'package:nexago_app/features/athlete/domain/athlete_profile_options.dart';

import 'ranking_constants.dart';
import 'ranking_list_models.dart';
import 'ranking_models.dart';

/// Agrupa pontos brutos por atleta e monta linhas da temporada (soma do ano).
List<AthleteRankingRow> buildAthleteRankingRowsFromPointsByAthlete(
  Map<String, List<int>> pointsByAthlete, {
  int year = 0,
}) {
  final rows = <AthleteRankingRow>[];
  for (final entry in pointsByAthlete.entries) {
    final points = entry.value;
    final total = sumPoints(points);
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

/// Agrupa pontos brutos por equipe e monta linhas da temporada (soma do ano).
List<TeamRankingRow> buildTeamRankingRowsFromPointsByTeam(
  Map<String, List<int>> pointsByTeam, {
  int year = 0,
}) {
  final rows = <TeamRankingRow>[];
  for (final entry in pointsByTeam.entries) {
    final points = entry.value;
    final total = sumPoints(points);
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

/// Formato do time: `teamSize` (3–5, equipes nomeadas) vence; sem ele o
/// tamanho do elenco (`memberUids`) decide. Dupla legada não grava nenhum
/// dos dois — cai em dupla. Nunca devolve `all` (é valor de filtro, não de
/// time). Paridade com `teamFormatOf` do portal web.
RankingFormatFilter rankingTeamFormat({
  int? teamSize,
  required int memberCount,
}) {
  final size = teamSize ?? memberCount;
  if (size >= 5) return RankingFormatFilter.quinteto;
  if (size == 4) return RankingFormatFilter.quarteto;
  if (size == 3) return RankingFormatFilter.trio;
  return RankingFormatFilter.dupla;
}

/// Mesmo contrato do filtro de gênero: recorte renumera; time sem formato
/// conhecido (doc ausente) só aparece com o filtro em `all`.
List<TeamRankingRow> filterTeamRowsByFormat(
  List<TeamRankingRow> rows,
  RankingFormatFilter filter,
  Map<String, RankingFormatFilter?> formatByTeamId,
) {
  if (filter == RankingFormatFilter.all) return rows;
  final filtered =
      rows.where((row) => formatByTeamId[row.teamId] == filter).toList();
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

/// Rank de nível do atleta pro ranking geral: cadeia canônica de leitura —
/// esporte principal (`levelsBySportFirestore[primarySportFirestoreId]`) →
/// nível global legado (`level`) → `null` (sem nível resolvido; some do
/// filtro por nível, nunca chuta um degrau).
int? athleteLevelRank(AppUserProfile? profile) {
  if (profile == null) return null;
  final sportCode = profile.primarySportFirestoreId;
  if (sportCode != null && sportCode.isNotEmpty) {
    final perSport =
        AthleteProfileOptions.levelRank(profile.levelsBySportFirestore[sportCode]);
    if (perSport != null) return perSport;
  }
  return AthleteProfileOptions.levelRank(profile.level);
}

/// Rank de nível da dupla: o maior entre os dois atletas (mesma regra do
/// anti-sandbagging — "vale o integrante mais forte"). `null` só quando
/// nenhum dos dois tem nível resolvido.
int? teamLevelRank(AppUserProfile? player1, AppUserProfile? player2) {
  final r1 = athleteLevelRank(player1);
  final r2 = athleteLevelRank(player2);
  if (r1 == null) return r2;
  if (r2 == null) return r1;
  return r1 > r2 ? r1 : r2;
}

/// Filtra o ranking de atletas pela faixa de nível (`all` = todos os níveis).
/// Atleta sem nível resolvido nunca aparece quando uma faixa é escolhida.
List<AthleteRankingRow> filterAthleteRowsByLevel(
  List<AthleteRankingRow> rows,
  RankingLevelFilter level,
  Map<String, int?> levelRankByAthleteId,
) {
  if (level == RankingLevelFilter.all) return rows;
  final filtered = rows
      .where((row) => level.matchesRank(levelRankByAthleteId[row.athleteId]))
      .toList();
  return assignRanks(filtered);
}

/// Filtra o ranking de duplas pela faixa de nível (`all` = todos os níveis).
List<TeamRankingRow> filterTeamRowsByLevel(
  List<TeamRankingRow> rows,
  RankingLevelFilter level,
  Map<String, int?> levelRankByTeamId,
) {
  if (level == RankingLevelFilter.all) return rows;
  final filtered = rows
      .where((row) => level.matchesRank(levelRankByTeamId[row.teamId]))
      .toList();
  return assignTeamRanks(filtered);
}
