import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../data/my_tournament_registrations_repository.dart';
import 'tournament_discovery_hub_logic.dart';
import 'tournament_discovery_models.dart';
import 'tournament_discovery_providers.dart';

class TournamentHubStats {
  const TournamentHubStats({
    required this.subscriptions,
    required this.liveNow,
    required this.openRegistrations,
  });

  final int subscriptions;
  final int liveNow;
  final int openRegistrations;
}

final myRegisteredTournamentIdsProvider = Provider.autoDispose<Set<String>>(
  (ref) {
    final regs = ref.watch(myTournamentRegistrationsProvider).valueOrNull ??
        const <MyTournamentRegistration>[];
    return regs.map((r) => r.tournamentId).where((id) => id.trim().isNotEmpty).toSet();
  },
);

final myRegistrationsCountProvider = Provider.autoDispose<int>((ref) {
  final regs = ref.watch(myTournamentRegistrationsProvider).valueOrNull ??
      const <MyTournamentRegistration>[];
  return regs.length;
});

final myRegistrationsByTournamentProvider =
    Provider.autoDispose<Map<String, MyTournamentRegistration>>((ref) {
  final regs = ref.watch(myTournamentRegistrationsProvider).valueOrNull ??
      const <MyTournamentRegistration>[];
  return registrationsByTournamentId(regs);
});

final tournamentHubStatsProvider = Provider.autoDispose<TournamentHubStats>((ref) {
  final stats = ref.watch(discoveryLiveStatsProvider);
  final subs = ref.watch(myRegistrationsCountProvider);
  return TournamentHubStats(
    subscriptions: subs,
    liveNow: stats.matchesLiveNow,
    openRegistrations: stats.openRegistrations,
  );
});

