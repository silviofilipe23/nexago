import '../../athlete/domain/athlete_discover_logic.dart';
import '../../athlete/domain/athlete_firestore_codes.dart';
import '../../athlete/domain/athlete_profile.dart';
import '../../ranking/domain/ranking_list_models.dart';
import '../../ranking/domain/ranking_logic.dart';
import 'team_discover_models.dart';
import 'tournament_team.dart';

bool isTeamPlayerOnline(AthleteProfile? profile, DateTime now) {
  if (profile == null) return false;
  return isAthleteOnline(profile, now);
}

bool isTeamOnline(TeamDiscoverEntry entry, DateTime now) {
  return isTeamPlayerOnline(entry.player1, now) ||
      isTeamPlayerOnline(entry.player2, now);
}

String normalizeTeamDiscoverSearch(String raw) => raw.trim().toLowerCase();

bool matchesTeamDiscoverSearch(TeamDiscoverEntry entry, String query) {
  if (query.isEmpty) return true;
  final q = normalizeTeamDiscoverSearch(query);
  final parts = <String>[
    entry.displayName,
    entry.membersLabel,
    entry.primarySportLabel,
    entry.player1?.city ?? '',
    entry.player1?.state ?? '',
    entry.player2?.city ?? '',
    entry.player2?.nickname ?? '',
    entry.player1?.nickname ?? '',
  ];
  return parts.any((p) => p.toLowerCase().contains(q));
}

RankingGenderFilter? _teamGender(TeamDiscoverEntry entry) {
  final fromTeam = normalizeRankingGender(entry.team.gender);
  if (fromTeam != null) return fromTeam;
  final g1 = normalizeRankingGender(entry.player1?.gender);
  final g2 = normalizeRankingGender(entry.player2?.gender);
  if (g1 != null && g2 != null && g1 == g2) return g1;
  if (g1 == RankingGenderFilter.male && g2 == RankingGenderFilter.female ||
      g1 == RankingGenderFilter.female && g2 == RankingGenderFilter.male) {
    return RankingGenderFilter.mixed;
  }
  return g1 ?? g2;
}

bool _matchesTeamGender(TeamDiscoverEntry entry, TeamDiscoverGenderFilter filter) {
  if (filter == TeamDiscoverGenderFilter.all) return true;
  final entity = _teamGender(entry);
  return matchesRankingGenderFilter(
    teamDiscoverGenderToRanking(filter)!,
    entity,
  );
}

bool _matchesSport(TeamDiscoverEntry entry, String? sportFirestoreId) {
  if (sportFirestoreId == null || sportFirestoreId.isEmpty) return true;
  for (final profile in [entry.player1, entry.player2]) {
    if (profile == null) continue;
    final primary = profile.primarySportFirestoreId?.trim() ?? '';
    if (primary == sportFirestoreId) return true;
    if (profile.secondarySportFirestoreIds.contains(sportFirestoreId)) {
      return true;
    }
  }
  return false;
}

bool _matchesCategory(TeamDiscoverEntry entry, TeamDiscoverFilters filters) {
  final quick = filters.quickCategory.label.trim();
  final cat = entry.displayCategory.trim().toLowerCase();
  if (quick.isNotEmpty) {
    if (cat.isEmpty || !cat.contains(quick.toLowerCase())) return false;
  }
  if (filters.categories.isEmpty) return true;
  if (cat.isEmpty) return false;
  return filters.categories.any((c) => cat.contains(c.toLowerCase()));
}

bool _matchesProximity(
  TeamDiscoverEntry entry,
  AthleteProfile? viewer,
  TeamDiscoverFilters filters,
) {
  if (filters.unlimitedDistance || viewer == null) return true;
  final profile = entry.player1 ?? entry.player2;
  if (profile == null) return filters.maxDistanceKm >= 50;
  return _matchesProximityProfile(profile, viewer, filters);
}

bool _matchesProximityProfile(
  AthleteProfile profile,
  AthleteProfile viewer,
  TeamDiscoverFilters filters,
) {
  final viewerCity = viewer.city.trim().toLowerCase();
  final viewerState = viewer.state?.trim().toLowerCase() ?? '';
  final city = profile.city.trim().toLowerCase();
  final state = profile.state?.trim().toLowerCase() ?? '';
  if (viewerCity.isNotEmpty && city == viewerCity) {
    if (viewerState.isEmpty || state.isEmpty || viewerState == state) {
      return true;
    }
  }
  return filters.maxDistanceKm >= 50;
}

bool _matchesPartnership(TeamDiscoverEntry entry, TeamDiscoverFilters filters) {
  return switch (filters.partnership) {
    TeamDiscoverPartnershipFilter.all => true,
    TeamDiscoverPartnershipFilter.active => !entry.isLookingForPartner,
    TeamDiscoverPartnershipFilter.lookingForPartner =>
      entry.isLookingForPartner,
  };
}

bool _matchesTrending(TeamDiscoverEntry entry, TeamDiscoverFilters filters) {
  if (!filters.trendingOnly) return true;
  return entry.ranking.tournamentsCount >= 3 ||
      entry.ranking.points >= 500;
}

bool _matchesSameRankingRange(
  TeamDiscoverEntry entry,
  TeamDiscoverFilters filters,
  int? viewerTeamPoints,
) {
  if (!filters.sameRankingRangeOnly) return true;
  if (viewerTeamPoints == null || viewerTeamPoints <= 0) return true;
  final pts = entry.ranking.points;
  if (pts <= 0) return false;
  final diff = (pts - viewerTeamPoints).abs();
  return diff <= (viewerTeamPoints * 0.35).round().clamp(200, 2000);
}

List<TeamDiscoverEntry> applyTeamDiscoverFilters({
  required List<TeamDiscoverEntry> entries,
  required TeamDiscoverFilters filters,
  AthleteProfile? viewerProfile,
  String searchQuery = '',
  DateTime? now,
  int? viewerTeamPoints,
}) {
  final reference = now ?? DateTime.now();
  final q = normalizeTeamDiscoverSearch(searchQuery);

  return entries.where((entry) {
    if (!matchesTeamDiscoverSearch(entry, q)) return false;
    if (!_matchesTeamGender(entry, filters.gender)) return false;
    if (!_matchesSport(entry, filters.sportFirestoreId)) return false;
    if (!_matchesCategory(entry, filters)) return false;
    if (!_matchesProximity(entry, viewerProfile, filters)) return false;
    if (!_matchesPartnership(entry, filters)) return false;
    if (!_matchesTrending(entry, filters)) return false;
    if (!_matchesSameRankingRange(entry, filters, viewerTeamPoints)) {
      return false;
    }
    if (filters.availableNowOnly && !isTeamOnline(entry, reference)) {
      return false;
    }
    return true;
  }).toList();
}

int _proximityScore(TeamDiscoverEntry entry, AthleteProfile? viewer) {
  if (viewer == null) return 0;
  final profile = entry.player1 ?? entry.player2;
  if (profile == null) return 0;
  var score = 0;
  final viewerCity = viewer.city.trim().toLowerCase();
  final city = profile.city.trim().toLowerCase();
  if (viewerCity.isNotEmpty && city == viewerCity) score += 2;
  final viewerState = viewer.state?.trim().toLowerCase() ?? '';
  final state = profile.state?.trim().toLowerCase() ?? '';
  if (viewerState.isNotEmpty && state.isNotEmpty && viewerState == state) {
    score += 1;
  }
  return score;
}

List<TeamDiscoverEntry> sortTeamDiscoverEntries({
  required List<TeamDiscoverEntry> entries,
  required TeamDiscoverSort sort,
  AthleteProfile? viewerProfile,
}) {
  final sorted = [...entries];
  switch (sort) {
    case TeamDiscoverSort.ranking:
      sorted.sort((a, b) {
        final ar = a.rankPosition ?? 999999;
        final br = b.rankPosition ?? 999999;
        if (ar != br) return ar.compareTo(br);
        return b.rankPoints.compareTo(a.rankPoints);
      });
    case TeamDiscoverSort.proximity:
      sorted.sort((a, b) {
        final cmp = _proximityScore(b, viewerProfile)
            .compareTo(_proximityScore(a, viewerProfile));
        if (cmp != 0) return cmp;
        return a.displayName.compareTo(b.displayName);
      });
    case TeamDiscoverSort.trending:
      sorted.sort((a, b) {
        final cmp = b.ranking.tournamentsCount
            .compareTo(a.ranking.tournamentsCount);
        if (cmp != 0) return cmp;
        return b.rankPoints.compareTo(a.rankPoints);
      });
  }
  return sorted;
}

int countOnlineTeams(
  List<TeamDiscoverEntry> entries, {
  DateTime? now,
}) {
  final reference = now ?? DateTime.now();
  return entries.where((e) => isTeamOnline(e, reference)).length;
}

List<String> teamDiscoverSportFilterOptions() {
  const ids = [
    'VOLEI_PRAIA',
    'BEACH_TENNIS',
    'VOLEI_QUADRA',
    'FUTEBOL',
    'BASQUETE',
    'TENIS',
  ];
  return ids
      .map(AthleteFirestoreCodes.sportFirestoreToLabel)
      .whereType<String>()
      .where((s) => s.isNotEmpty)
      .toList();
}

String? teamSportFirestoreIdForLabel(String label) {
  const ids = [
    'VOLEI_PRAIA',
    'BEACH_TENNIS',
    'VOLEI_QUADRA',
    'FUTEBOL',
    'BASQUETE',
    'TENIS',
    'CORRIDA',
    'OUTROS',
  ];
  for (final id in ids) {
    if (AthleteFirestoreCodes.sportFirestoreToLabel(id) == label) {
      return id;
    }
  }
  return null;
}

TeamDiscoverEntry buildTeamDiscoverEntry({
  required TournamentTeam team,
  AthleteProfile? player1,
  AthleteProfile? player2,
  TeamDiscoverRankingSnapshot ranking = const TeamDiscoverRankingSnapshot(),
  bool isFollowing = false,
  bool isCurrentUserTeam = false,
}) {
  return TeamDiscoverEntry(
    teamId: team.id,
    team: team,
    player1: player1,
    player2: player2,
    ranking: ranking,
    isFollowing: isFollowing,
    isCurrentUserTeam: isCurrentUserTeam,
  );
}
