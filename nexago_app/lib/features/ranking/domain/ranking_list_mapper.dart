import 'package:nexago_app/core/profiles/users_repository.dart';
import 'package:nexago_app/core/profiles/app_user_profile.dart';
import '../data/ranking_repository.dart';
import 'ranking_display_helpers.dart';
import 'ranking_list_models.dart';
import 'ranking_logic.dart';
import 'ranking_models.dart';

String rankingSubtitle({
  String? levelLabel,
  required int tournamentsCount,
}) {
  final parts = <String>[];
  if (levelLabel != null && levelLabel.trim().isNotEmpty) {
    parts.add(levelLabel.trim().toUpperCase());
  }
  if (tournamentsCount > 0) {
    parts.add(
      tournamentsCount == 1 ? '1 torneio' : '$tournamentsCount torneios',
    );
  }
  return parts.join(' • ');
}

String teamDisplayName({
  required RankingTeamPlayers? team,
  required AppUserProfile? player1,
  required AppUserProfile? player2,
}) {
  final teamName = team?.teamName?.trim();
  if (teamName != null && teamName.isNotEmpty) return teamName;

  final p1Short = player1 != null ? appUserShortLabel(player1) : '';
  final p2Short = player2 != null ? appUserShortLabel(player2) : '';
  if (p1Short.isNotEmpty && p2Short.isNotEmpty && p1Short != p2Short) {
    return '$p1Short / $p2Short';
  }

  final p1 = player1 != null ? appUserDisplayName(player1).trim() : '';
  final p2 = player2 != null ? appUserDisplayName(player2).trim() : '';
  if (p1.isNotEmpty && p2.isNotEmpty && p1 != p2) return '$p1 / $p2';
  if (p1.isNotEmpty) return p1;
  if (p2.isNotEmpty) return p2;
  return 'Dupla';
}

Future<List<RankingListEntry>> buildAthleteRankingListEntries({
  required RankingRepository repo,
  required UsersRepository users,
  required RankingPageFilter filter,
  required String? currentUid,
  required Future<Map<String, String?>> Function(Iterable<String> uids)
      athleteLevelsFor,
}) async {
  var rows = await repo.loadAthleteRanking(year: filter.year);
  if (rows.isEmpty) return const [];

  // Uma leitura em lote cobre filtro de gênero e exibição.
  final profiles =
      await users.getUsersByIds(rows.map((row) => row.athleteId));

  final genderByAthlete = <String, RankingGenderFilter?>{
    for (final row in rows)
      row.athleteId:
          normalizeRankingGender(profiles[row.athleteId]?.gender),
  };

  rows = filterAthleteRowsByGender(
    rows,
    filter.gender,
    genderByAthlete,
  );
  if (rows.isEmpty) return const [];

  final levels = await athleteLevelsFor(rows.map((row) => row.athleteId));

  final entries = <RankingListEntry>[];
  for (final row in rows) {
    final profile = profiles[row.athleteId];
    final level = levels[row.athleteId];
    entries.add(
      RankingListEntry(
        rank: row.rank,
        points: row.totalPoints,
        tournamentsCount: row.tournamentsCount,
        displayName: rankingDisplayName(profile, row.athleteId),
        subtitle: rankingSubtitle(
          levelLabel: level,
          tournamentsCount: row.tournamentsCount,
        ),
        isCurrentUser: row.athleteId == currentUid,
        entityId: row.athleteId,
        initials: rankingInitials(profile, row.athleteId),
        avatarColor: rankingAvatarColor(row.athleteId),
        avatarUrl: rankingAvatarUrl(profile),
      ),
    );
  }
  return entries;
}

Future<List<RankingListEntry>> buildTeamRankingListEntries({
  required RankingRepository repo,
  required UsersRepository users,
  required RankingPageFilter filter,
  required String? currentUid,
}) async {
  var rows = await repo.loadTeamRanking(year: filter.year);
  if (rows.isEmpty) return const [];

  final teamIds = rows.map((r) => r.teamId).toList();
  final teams = await repo.loadTeamsMap(teamIds);

  final genderByTeam = <String, RankingGenderFilter?>{};
  for (final teamId in teamIds) {
    genderByTeam[teamId] =
        normalizeRankingGender(teams[teamId]?.gender);
  }

  rows = filterTeamRowsByGender(rows, filter.gender, genderByTeam);
  if (rows.isEmpty) return const [];

  final profiles = await users.getUsersByIds([
    for (final team in teams.values) ...[
      if (team.player1Id != null) team.player1Id!,
      if (team.player2Id != null) team.player2Id!,
    ],
  ]);

  final entries = <RankingListEntry>[];
  for (final row in rows) {
    final team = teams[row.teamId];
    final p1 = team?.player1Id != null ? profiles[team!.player1Id] : null;
    final p2 = team?.player2Id != null ? profiles[team!.player2Id] : null;
    final isCurrentUser = currentUid != null &&
        currentUid.isNotEmpty &&
        (team?.player1Id == currentUid || team?.player2Id == currentUid);

    entries.add(
      RankingListEntry(
        rank: row.rank,
        points: row.totalPoints,
        tournamentsCount: row.tournamentsCount,
        displayName: teamDisplayName(team: team, player1: p1, player2: p2),
        subtitle: rankingSubtitle(tournamentsCount: row.tournamentsCount),
        isCurrentUser: isCurrentUser,
        entityId: row.teamId,
        player1Initials: rankingInitials(
          p1,
          team?.player1Id ?? '',
        ),
        player2Initials: rankingInitials(
          p2,
          team?.player2Id ?? '',
        ),
        player1Color: rankingAvatarColor(team?.player1Id ?? row.teamId),
        player2Color: rankingAvatarColor(team?.player2Id ?? '${row.teamId}_2'),
        player1AvatarUrl: rankingAvatarUrl(p1),
        player2AvatarUrl: rankingAvatarUrl(p2),
      ),
    );
  }
  return entries;
}

List<RankingListEntry> splitRankingEntries(List<RankingListEntry> entries) {
  return entries;
}

List<RankingListEntry> podiumEntries(List<RankingListEntry> entries) {
  final top3 = entries.where((e) => e.rank >= 1 && e.rank <= 3).toList()
    ..sort((a, b) => a.rank.compareTo(b.rank));
  return top3;
}

List<RankingListEntry> listEntriesFromRank4(List<RankingListEntry> entries) {
  final rest = entries.where((e) => e.rank > 3).toList()
    ..sort((a, b) => a.rank.compareTo(b.rank));
  return rest;
}

List<RankingListEntry> sortedRankingEntries(List<RankingListEntry> entries) {
  final sorted = [...entries];
  sorted.sort((a, b) => a.rank.compareTo(b.rank));
  return sorted;
}
