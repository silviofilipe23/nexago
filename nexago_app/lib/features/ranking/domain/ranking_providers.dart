import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/auth/auth_providers.dart';
import 'package:nexago_app/core/profiles/users_repository.dart';
import 'package:nexago_app/core/profiles/app_user_profile.dart';
import '../../tournaments/domain/compete_hub_models.dart';
import '../data/ranking_repository.dart';
import 'ranking_display_helpers.dart';
import 'ranking_list_mapper.dart';
import 'ranking_list_models.dart';
import 'ranking_logic.dart';
import 'ranking_models.dart';

const _rankingCacheTtl = Duration(minutes: 2);

final rankingSeasonYearProvider = Provider<int>((ref) {
  return DateTime.now().year;
});

final rankingYearOptionsProvider = Provider<List<int>>((ref) {
  return rankingYearOptions(currentYear: ref.watch(rankingSeasonYearProvider));
});

class _RankingCacheEntry {
  _RankingCacheEntry(this.rows, this.expiresAt);

  final List<AthleteRankingRow> rows;
  final DateTime expiresAt;

  bool get isValid => DateTime.now().isBefore(expiresAt);
}

class HubAthleteRankingSnapshot {
  const HubAthleteRankingSnapshot({
    required this.rows,
    required this.isSeasonMode,
    required this.seasonYear,
  });

  final List<AthleteRankingRow> rows;
  final bool isSeasonMode;
  final int seasonYear;
}

final _athleteRankingCacheProvider =
    StateProvider<Map<String, _RankingCacheEntry>>((ref) => {});

Future<List<AthleteRankingRow>> _loadSeasonRanking(
  Ref ref,
  int year,
) async {
  final cacheKey = 'season:$year';
  final cache = ref.read(_athleteRankingCacheProvider);
  final cached = cache[cacheKey];
  if (cached != null && cached.isValid) {
    return cached.rows;
  }

  final rows =
      await ref.read(rankingRepositoryProvider).loadAthleteRankingByYear(year);
  ref.read(_athleteRankingCacheProvider.notifier).update((state) {
    final next = Map<String, _RankingCacheEntry>.from(state);
    next[cacheKey] = _RankingCacheEntry(
      rows,
      DateTime.now().add(_rankingCacheTtl),
    );
    return next;
  });
  return rows;
}

final athleteRankingBySeasonProvider = FutureProvider.autoDispose
    .family<List<AthleteRankingRow>, int>((ref, year) {
  return _loadSeasonRanking(ref, year);
});

/// Ranking do hub: temporada atual, com fallback para ranking geral.
final hubAthleteRankingSnapshotProvider =
    FutureProvider.autoDispose<HubAthleteRankingSnapshot>((ref) async {
  final year = ref.watch(rankingSeasonYearProvider);
  final seasonRows = await _loadSeasonRanking(ref, year);
  if (seasonRows.isNotEmpty) {
    return HubAthleteRankingSnapshot(
      rows: seasonRows,
      isSeasonMode: true,
      seasonYear: year,
    );
  }

  final generalRows =
      await ref.read(rankingRepositoryProvider).loadAthleteRankingGeneral();
  return HubAthleteRankingSnapshot(
    rows: generalRows,
    isSeasonMode: false,
    seasonYear: year,
  );
});

final currentAthleteRankingProvider =
    FutureProvider.autoDispose<AthleteRankingRow?>((ref) async {
  final user = await ref.watch(authProvider.future);
  final uid = user?.uid.trim();
  if (uid == null || uid.isEmpty) return null;

  final snapshot = await ref.watch(hubAthleteRankingSnapshotProvider.future);
  return snapshot.rows.where((row) => row.athleteId == uid).firstOrNull;
});

final competeHubUserRankingProvider =
    FutureProvider.autoDispose<CompeteHubUserRanking?>((ref) async {
  final user = await ref.watch(authProvider.future);
  final uid = user?.uid.trim();
  if (uid == null || uid.isEmpty) return null;

  final year = ref.watch(rankingSeasonYearProvider);
  final repo = ref.read(rankingRepositoryProvider);

  var seasonRows = await _loadSeasonRanking(ref, year);
  var userRow = seasonRows.where((row) => row.athleteId == uid).firstOrNull;
  var rankingRows = seasonRows;
  var isSeasonMode = true;

  if (userRow == null) {
    final generalRows = await repo.loadAthleteRankingGeneral();
    userRow = generalRows.where((row) => row.athleteId == uid).firstOrNull;
    if (userRow != null) {
      rankingRows = generalRows;
      isSeasonMode = false;
    }
  }

  if (userRow == null) {
    final entry = await repo.getAthleteRankingEntry(uid);
    if (entry != null && entry.totalPoints > 0) {
      final generalRows = await repo.loadAthleteRankingGeneral();
      userRow = generalRows.where((row) => row.athleteId == uid).firstOrNull;
      if (userRow != null) {
        rankingRows = generalRows;
        isSeasonMode = false;
      } else {
        userRow = AthleteRankingRow(
          rank: 0,
          athleteId: uid,
          totalPoints: entry.totalPoints,
          tournamentsCount: entry.tournamentsCount,
          pointsByYear: entry.pointsByYear,
        );
        rankingRows = [userRow];
        isSeasonMode = false;
      }
    }
  }

  if (userRow == null) {
    return CompeteHubUserRanking.unranked(
      seasonYear: year,
      isSeasonMode: seasonRows.isNotEmpty,
    );
  }

  final pointsRemaining = pointsToNextRank(rankingRows, uid);
  final progress = promotionProgressTowardNextRank(rankingRows, uid);

  return CompeteHubUserRanking(
    rank: userRow.rank > 0 ? userRow.rank : 0,
    seasonLabel: isSeasonMode ? 'TEMPORADA $year' : 'RANKING GERAL',
    subtitle: isSeasonMode
        ? 'Ranking de atletas · melhores 5 resultados'
        : 'Ranking de atletas · soma total de pontos',
    points: userRow.totalPoints,
    tournamentsCount: userRow.tournamentsCount,
    promotionPointsRemaining: userRow.rank > 0 ? pointsRemaining : null,
    promotionProgress: userRow.rank > 0 ? progress : 1,
    isUnranked: userRow.rank <= 0,
  );
});

Future<List<CompeteHubRankingEntry>> _buildPreviewEntries(
  Ref ref, {
  required int topCount,
}) async {
  final user = await ref.watch(authProvider.future);
  final uid = user?.uid.trim();
  final snapshot = await ref.watch(hubAthleteRankingSnapshotProvider.future);
  final rows = snapshot.rows;
  if (rows.isEmpty) return const [];

  final preview = previewRankingRows(
    rows,
    topCount: topCount,
    currentAthleteId: uid,
  );

  final profiles = await _loadProfiles(
    ref.read(usersRepositoryProvider),
    preview.map((row) => row.athleteId),
  );

  return preview
      .map(
        (row) => _mapRankingEntry(
          row: row,
          profile: profiles[row.athleteId],
          isCurrentUser: row.athleteId == uid,
        ),
      )
      .toList();
}

final competeHubRankingEntriesProvider =
    FutureProvider.autoDispose<List<CompeteHubRankingEntry>>((ref) {
  return _buildPreviewEntries(ref, topCount: 3);
});

/// Ranking em destaque da aba Comunidade: top 10 + usuário (se fora do top).
final communityRankingEntriesProvider =
    FutureProvider.autoDispose<List<CompeteHubRankingEntry>>((ref) {
  return _buildPreviewEntries(ref, topCount: 10);
});

Future<Map<String, AppUserProfile>> _loadProfiles(
  UsersRepository users,
  Iterable<String> athleteIds,
) {
  return users.getUsersByIds(athleteIds);
}

CompeteHubRankingEntry _mapRankingEntry({
  required AthleteRankingRow row,
  required AppUserProfile? profile,
  required bool isCurrentUser,
}) {
  return CompeteHubRankingEntry(
    rank: row.rank,
    initials: rankingInitials(profile, row.athleteId),
    name: rankingDisplayName(profile, row.athleteId),
    points: row.totalPoints,
    tournamentsCount: row.tournamentsCount,
    avatarColor: rankingAvatarColor(row.athleteId),
    avatarUrl: rankingAvatarUrl(profile),
    isCurrentUser: isCurrentUser,
  );
}

/// Filtros da tela completa de ranking.
final rankingPageFilterProvider =
    StateProvider<RankingPageFilter>((ref) {
  return RankingPageFilter(year: DateTime.now().year);
});

/// Lista enriquecida para a tela de ranking (atletas ou equipes).
final rankingListEntriesProvider =
    FutureProvider.autoDispose<List<RankingListEntry>>((ref) async {
  final filter = ref.watch(rankingPageFilterProvider);
  final user = await ref.watch(authProvider.future);
  final currentUid = user?.uid.trim();
  final repo = ref.read(rankingRepositoryProvider);
  final users = ref.read(usersRepositoryProvider);

  if (filter.mode == RankingListMode.teams) {
    return buildTeamRankingListEntries(
      repo: repo,
      users: users,
      filter: filter,
      currentUid: currentUid,
    );
  }

  return buildAthleteRankingListEntries(
    repo: repo,
    users: users,
    filter: filter,
    currentUid: currentUid,
  );
});

/// Lista completa enriquecida para a tela de ranking (legado hub).
final athleteRankingListProvider = FutureProvider.autoDispose
    .family<List<CompeteHubRankingEntry>, int>((ref, year) async {
  final uid = ref.watch(authProvider).valueOrNull?.uid.trim();
  final rows = await ref.watch(athleteRankingBySeasonProvider(year).future);
  if (rows.isEmpty) return const [];

  final profiles = await _loadProfiles(
    ref.read(usersRepositoryProvider),
    rows.map((row) => row.athleteId),
  );

  return rows
      .map(
        (row) => _mapRankingEntry(
          row: row,
          profile: profiles[row.athleteId],
          isCurrentUser: row.athleteId == uid,
        ),
      )
      .toList();
});

void invalidateAthleteRankingCache(WidgetRef ref, {int? year}) {
  if (year != null) {
    ref.read(_athleteRankingCacheProvider.notifier).update((state) {
      final next = Map<String, _RankingCacheEntry>.from(state);
      next.remove('season:$year');
      return next;
    });
    ref.invalidate(athleteRankingBySeasonProvider(year));
    ref.invalidate(athleteRankingListProvider(year));
  } else {
    ref.read(_athleteRankingCacheProvider.notifier).state = {};
    for (final y in ref.read(rankingYearOptionsProvider)) {
      ref.invalidate(athleteRankingBySeasonProvider(y));
      ref.invalidate(athleteRankingListProvider(y));
    }
  }
  ref.invalidate(competeHubUserRankingProvider);
  ref.invalidate(competeHubRankingEntriesProvider);
  ref.invalidate(communityRankingEntriesProvider);
  ref.invalidate(currentAthleteRankingProvider);
  ref.invalidate(hubAthleteRankingSnapshotProvider);
  ref.invalidate(rankingListEntriesProvider);
}

void invalidateRankingListCache(WidgetRef ref) {
  invalidateAthleteRankingCache(ref);
  ref.invalidate(rankingListEntriesProvider);
}
