import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/auth/auth_providers.dart';
import '../../data/match_history/athlete_match_history_repository.dart';
import 'athlete_match_history_logic.dart';
import 'athlete_match_history_models.dart';

final athleteMatchHistoryBundleProvider = FutureProvider.autoDispose
    .family<AthleteMatchHistoryBundle, String>((ref, uid) async {
  final id = uid.trim();
  if (id.isEmpty) {
    throw StateError('Usuário inválido.');
  }
  return ref.read(athleteMatchHistoryRepositoryProvider).fetchHistory(id);
});

final currentAthleteMatchHistoryBundleProvider =
    FutureProvider.autoDispose<AthleteMatchHistoryBundle>((ref) async {
  final uid = ref.watch(authProvider).valueOrNull?.uid;
  if (uid == null || uid.isEmpty) {
    throw StateError('Usuário não autenticado.');
  }
  return ref.watch(athleteMatchHistoryBundleProvider(uid).future);
});

final matchHistoryTabProvider =
    StateProvider.autoDispose<MatchHistoryTab>((ref) => MatchHistoryTab.matches);

final matchHistoryFilterProvider = StateProvider.autoDispose<MatchHistoryFilter>(
  (ref) => MatchHistoryFilter.all,
);

class MatchHistoryDerived {
  const MatchHistoryDerived({
    required this.bundle,
    required this.tab,
    required this.filter,
  });

  final AthleteMatchHistoryBundle bundle;
  final MatchHistoryTab tab;
  final MatchHistoryFilter filter;

  List<AthleteMatchHistoryItem> get filteredMatches =>
      filterMatches(bundle.matches, filter);

  List<MatchHistoryMonthGroup> get monthGroups =>
      groupMatchesByMonth(filteredMatches);

  TournamentMedalCounts get medalCounts =>
      countTournamentMedals(bundle.tournaments);

  int get matchCount => bundle.matches.length;

  int get tournamentCount => bundle.tournaments.length;

  List<AthleteMatchHistoryItem> get profilePreviewMatches {
    final sorted = [...bundle.matches]
      ..sort((a, b) => b.playedAt.compareTo(a.playedAt));
    return sorted.take(3).toList();
  }

  String get settingsSubtitle => matchHistorySettingsSubtitle(
        matchCount: matchCount,
        tournamentCount: tournamentCount,
      );
}

final matchHistoryDerivedProvider =
    Provider.autoDispose<MatchHistoryDerived?>((ref) {
  final uid = ref.watch(authProvider).valueOrNull?.uid;
  if (uid == null || uid.isEmpty) return null;
  final bundleAsync = ref.watch(athleteMatchHistoryBundleProvider(uid));
  return bundleAsync.whenOrNull(
    data: (bundle) => MatchHistoryDerived(
      bundle: bundle,
      tab: ref.watch(matchHistoryTabProvider),
      filter: ref.watch(matchHistoryFilterProvider),
    ),
  );
});

final athleteMatchHistorySettingsSubtitleProvider =
    Provider.autoDispose<String>((ref) {
  final derived = ref.watch(matchHistoryDerivedProvider);
  if (derived != null) return derived.settingsSubtitle;
  final uid = ref.watch(authProvider).valueOrNull?.uid;
  if (uid == null || uid.isEmpty) return 'Histórico indisponível';
  final bundleAsync = ref.watch(athleteMatchHistoryBundleProvider(uid));
  return bundleAsync.when(
    data: (b) => matchHistorySettingsSubtitle(
      matchCount: b.matches.length,
      tournamentCount: b.tournaments.length,
    ),
    loading: () => 'Carregando…',
    error: (error, stackTrace) => 'Histórico indisponível',
  );
});
