import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../arenas/domain/arenas_providers.dart';
import '../../athlete/domain/athlete_display_name.dart';
import '../../athlete/domain/athlete_profile_providers.dart';
import '../data/league_team_rankings_repository.dart';
import 'league_ranking_logic.dart';
import 'league_ranking_models.dart';
import 'tournament_discovery_providers.dart';

typedef LeagueCategoryRankingsKey = ({String leagueId, String categoryId});

enum LeagueRankingViewMode { teams, athletes }

final leagueRankingsRepositoryProvider = Provider<LeagueRankingsRepository>((ref) {
  return LeagueRankingsRepository(ref.watch(firestoreProvider));
});

final leagueTeamRankingsProvider = StreamProvider.autoDispose
    .family<List<LeagueTeamRankingEntry>, String>((ref, leagueId) {
  final league = ref.watch(leagueDetailProvider(leagueId)).valueOrNull;
  return ref.watch(leagueRankingsRepositoryProvider).watchTeamsByLeague(
        leagueId,
        fallbackMode:
            league?.countingStagesMode ?? LeaguePointsCountingMode.best4Of6,
      );
});

final leagueAthleteRankingsProvider = StreamProvider.autoDispose
    .family<List<LeagueAthleteRankingEntry>, String>((ref, leagueId) {
  final league = ref.watch(leagueDetailProvider(leagueId)).valueOrNull;
  return ref.watch(leagueRankingsRepositoryProvider).watchAthletesByLeague(
        leagueId,
        fallbackMode:
            league?.countingStagesMode ?? LeaguePointsCountingMode.best4Of6,
      );
});

final leagueCategoryRankingRowsProvider = FutureProvider.autoDispose
    .family<List<LeagueTeamRankingRow>, LeagueCategoryRankingsKey>((ref, key) async {
  final entries =
      await ref.watch(leagueTeamRankingsProvider(key.leagueId).future);
  final filtered =
      entries.where((entry) => entry.categoryId == key.categoryId).toList();
  if (filtered.isEmpty) return const [];

  final enrichment = ref.read(tournamentMatchEnrichmentServiceProvider);
  final names = <String, String>{};
  await Future.wait(
    filtered.map((entry) async {
      names[entry.teamId] = await enrichment.teamDisplayName(
        teamId: entry.teamId,
        fallback: 'Dupla',
      );
    }),
  );
  return buildLeagueTeamRankingRows(filtered, names);
});

final leagueCategoryAthleteRankingRowsProvider = FutureProvider.autoDispose
    .family<List<LeagueAthleteRankingRow>, LeagueCategoryRankingsKey>((ref, key) async {
  final entries =
      await ref.watch(leagueAthleteRankingsProvider(key.leagueId).future);
  final filtered =
      entries.where((entry) => entry.categoryId == key.categoryId).toList();
  if (filtered.isEmpty) return const [];

  final names = <String, String>{};
  await Future.wait(
    filtered.map((entry) async {
      final profile =
          await ref.watch(athleteProfileByIdProvider(entry.athleteId).future);
      if (profile == null) return;
      names[entry.athleteId] = athleteDisplayName(profile, fallback: 'Atleta');
    }),
  );
  return buildLeagueAthleteRankingRows(filtered, names);
});
