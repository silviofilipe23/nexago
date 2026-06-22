import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../tournaments/data/tournament_inscriptions_repository.dart';
import '../tournament_ops/tournament_ops_logic.dart';
import '../tournament_ops/tournament_ops_providers.dart';
import 'tournament_uniforms_logic.dart';
import 'tournament_uniforms_models.dart';

final organizerTournamentUniformsFilterProvider =
    StateProvider.autoDispose<OrganizerUniformsFilter>(
  (ref) => const OrganizerUniformsFilter(),
);

final organizerTournamentUniformsProvider = StreamProvider.autoDispose
    .family<OrganizerUniformsState, String>((ref, tournamentId) {
  final tid = tournamentId.trim();
  if (tid.isEmpty) return Stream.value(OrganizerUniformsState.empty);

  final tournamentRepo = ref.watch(organizerTournamentOpsRepositoryProvider);
  final inscriptionsRepo = ref.watch(tournamentInscriptionsRepositoryProvider);
  final profilesRepo = ref.watch(organizerUserProfilesRepositoryProvider);

  return tournamentRepo.watchTournament(tid).asyncExpand((tournament) {
    if (tournament == null) {
      return Stream.value(
        const OrganizerUniformsState(
          isLoading: false,
          error: 'Torneio não encontrado',
        ),
      );
    }

    final categoryConfigs = parseUniformCategoryConfigs(tournament['categories']);
    final uniformEnabled = tournamentUniformEnabled(
      tournament: tournament,
      categoryConfigs: categoryConfigs,
    );
    final tournamentName = (tournament['name'] as String?)?.trim() ?? 'Torneio';
    final locationLine = tournamentMetaLine(
      locationName: (tournament['locationName'] as String?) ?? '',
      city: (tournament['city'] as String?) ?? '',
      state: (tournament['state'] as String?) ?? '',
      dateLabel: (tournament['dateLabel'] as String?) ?? '',
    );
    final sizeOrder = uniformSizeOrderForConfigs(categoryConfigs);

    return inscriptionsRepo.watchByTournament(tid).asyncMap((inscriptions) async {
      if (!uniformEnabled) {
        return OrganizerUniformsState(
          isLoading: false,
          isUniformEnabled: false,
          tournamentName: tournamentName,
          locationLine: locationLine,
        );
      }

      final uids = <String>{};
      for (final row in inscriptions) {
        final team = row.team;
        if (team == null) continue;
        final p1 = (team['player1Id'] as String?)?.trim();
        final p2 = (team['player2Id'] as String?)?.trim();
        if (p1 != null && p1.isNotEmpty) uids.add(p1);
        if (p2 != null && p2.isNotEmpty) uids.add(p2);
      }
      final profiles = await profilesRepo.batchGetProfiles(uids);
      final rows = flattenInscriptionsToUniformRows(
        inscriptions: inscriptions,
        categoryConfigs: categoryConfigs,
        profilesByUid: profiles,
      );
      final summary = buildUniformsSummary(rows, sizeOrder: sizeOrder);
      final chips = buildUniformCategoryChips(rows);

      return OrganizerUniformsState(
        isLoading: false,
        isUniformEnabled: true,
        tournamentName: tournamentName,
        locationLine: locationLine,
        rows: rows,
        summary: summary,
        categoryChips: chips,
      );
    });
  });
});

final organizerTournamentUniformsFilteredProvider = Provider.autoDispose
    .family<List<OrganizerUniformAthleteRow>, String>((ref, tournamentId) {
  final state = ref.watch(organizerTournamentUniformsProvider(tournamentId));
  final filter = ref.watch(organizerTournamentUniformsFilterProvider);
  final rows = state.valueOrNull?.rows ?? const [];
  return filterUniformRows(
    rows,
    categoryId: filter.categoryId,
    sizeTop: filter.sizeTop,
    pendingOnly: filter.pendingOnly,
  );
});

bool organizerTournamentHasUniformKit(Map<String, dynamic>? tournament) {
  if (tournament == null) return false;
  final configs = parseUniformCategoryConfigs(tournament['categories']);
  return tournamentUniformEnabled(
    tournament: tournament,
    categoryConfigs: configs,
  );
}
