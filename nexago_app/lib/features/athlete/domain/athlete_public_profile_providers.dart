import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../ranking/data/ranking_repository.dart';
import '../../tournaments/data/recent_partners_repository.dart';
import '../../tournaments/domain/app_user_profile.dart';
import '../data/match_history/athlete_match_history_repository.dart';
import 'athlete_profile.dart';
import 'athlete_public_profile_models.dart';
import 'match_history/athlete_match_history_models.dart';

final athletePublicRankingProvider =
    FutureProvider.autoDispose.family<AthletePublicRankingSnapshot, String>(
  (ref, athleteId) async {
    final repo = ref.read(rankingRepositoryProvider);
    final year = DateTime.now().year;

    var rows = await repo.loadAthleteRankingByYear(year);
    var row = rows.where((r) => r.athleteId == athleteId).firstOrNull;
    if (row != null) {
      return AthletePublicRankingSnapshot(
        rank: row.rank,
        points: row.totalPoints,
        tournamentsCount: row.tournamentsCount,
        seasonYear: year,
      );
    }

    final general = await repo.loadAthleteRankingGeneral();
    row = general.where((r) => r.athleteId == athleteId).firstOrNull;
    if (row != null) {
      return AthletePublicRankingSnapshot(
        rank: row.rank,
        points: row.totalPoints,
        tournamentsCount: row.tournamentsCount,
      );
    }

    final entry = await repo.getAthleteRankingEntry(athleteId);
    if (entry != null && entry.totalPoints > 0) {
      return AthletePublicRankingSnapshot(
        points: entry.totalPoints,
        tournamentsCount: entry.tournamentsCount,
      );
    }

    return const AthletePublicRankingSnapshot();
  },
);

final athletePublicPartnersProvider =
    FutureProvider.autoDispose.family<List<AthletePublicPartnerEntry>, String>(
  (ref, athleteId) async {
    final partners = await ref
        .read(recentPartnersRepositoryProvider)
        .loadRecentPartners(currentUserId: athleteId, categoryGenderType: null);

    return partners.map(_mapPartner).toList();
  },
);

AthletePublicPartnerEntry _mapPartner(AppUserProfile profile) {
  final name = appUserDisplayName(profile);
  return AthletePublicPartnerEntry(
    userId: profile.uid,
    name: name,
    initials: appUserInitials(profile),
    avatarUrl: profile.profilePhotoUrl,
    subtitle: profile.gender?.trim() ?? '',
  );
}

final athletePublicSportEntriesProvider =
    Provider.autoDispose.family<List<AthletePublicSportEntry>, AthleteProfile>(
  (ref, profile) => buildPublicSportEntries(profile),
);

final athletePublicMatchHistoryProvider =
    FutureProvider.autoDispose.family<AthleteMatchHistoryBundle, String>(
  (ref, athleteId) async {
    return ref
        .read(athleteMatchHistoryRepositoryProvider)
        .fetchHistory(athleteId);
  },
);
