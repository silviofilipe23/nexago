import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../ranking/data/ranking_repository.dart';
import '../../tournaments/data/recent_partners_repository.dart';
import 'package:nexago_app/core/profiles/app_user_profile.dart';
import '../data/match_history/athlete_match_history_repository.dart';
import 'athlete_profile.dart';
import 'athlete_podiums.dart';
import 'athlete_public_profile_models.dart';
import 'match_history/athlete_match_history_models.dart';

/// Pódios do atleta — toda colocação até terceiro lugar em torneios.
///
/// Vem de `tournamentCategoryResults` + `teams`, ambos públicos, e não da
/// gamificação, que só o dono pode ler.
final athletePodiumsProvider =
    FutureProvider.autoDispose.family<List<AthletePodium>, String>(
  (ref, athleteId) =>
      ref.read(rankingRepositoryProvider).loadAthletePodiums(athleteId),
);

/// Posição do atleta no ranking individual de CADA modalidade, no formato
/// `{código do esporte: posição}`.
///
/// Só o ano corrente: o ranking por modalidade é calculado dos resultados
/// crus, e o geral pré-calculado não tem esporte. Esporte em que o atleta não
/// pontuou fica fora do mapa, e a UI mostra travessão.
final athleteSportRanksProvider =
    FutureProvider.autoDispose.family<Map<String, int>, String>(
  (ref, athleteId) async {
    final repo = ref.read(rankingRepositoryProvider);
    final bySport = await repo.loadAthleteRankingBySport(
      year: DateTime.now().year,
    );

    final out = <String, int>{};
    for (final entry in bySport.entries) {
      final row =
          entry.value.where((r) => r.athleteId == athleteId).firstOrNull;
      if (row != null) out[entry.key] = row.rank;
    }
    return out;
  },
);

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
