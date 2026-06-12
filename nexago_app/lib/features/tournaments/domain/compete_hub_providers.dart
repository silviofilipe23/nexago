import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/auth/auth_providers.dart';
import '../../athlete/data/athlete_discover_repository.dart';
import '../../athlete/domain/athlete_profile_providers.dart';
import '../data/my_tournament_registrations_repository.dart';
import '../data/team_discover_repository.dart';
import 'compete_hub_logic.dart';
import 'compete_hub_models.dart';
import 'team_discover_models.dart';
import 'team_follow_providers.dart';
import 'tournament_discovery_hub_logic.dart';
import 'tournament_discovery_models.dart';
import 'tournament_discovery_providers.dart';

final competeHubAthletesPreviewProvider =
    FutureProvider.autoDispose<List<CompeteHubAthletePreview>>((ref) async {
  final viewer = ref.watch(athleteProfileProvider).valueOrNull;
  final user = await ref.watch(authProvider.future);
  final profiles = await ref
      .read(athleteDiscoverRepositoryProvider)
      .fetchHubAthletesPreview(
        viewer: viewer,
        currentUserId: user?.uid,
      );
  final now = DateTime.now();
  return profiles
      .map((profile) => buildCompeteHubAthletePreview(profile, now: now))
      .toList();
});

final competeHubTeamDiscoverPreviewProvider =
    FutureProvider.autoDispose<List<TeamDiscoverEntry>>((ref) async {
  final user = await ref.watch(authProvider.future);
  final uid = user?.uid.trim();
  final following = uid != null && uid.isNotEmpty
      ? await ref.read(teamFollowServiceProvider).fetchFollowingTeamIds(uid)
      : const <String>{};

  return ref.read(teamDiscoverRepositoryProvider).fetchRandomPreview(
        currentUserId: uid,
        followingTeamIds: following,
      );
});

final competeHubTournamentPreviewProvider =
    Provider.autoDispose<List<DiscoveryTournament>>((ref) {
  final tournaments = ref.watch(discoveryTournamentsProvider).valueOrNull ??
      const <DiscoveryTournament>[];
  final athleteGender = ref.watch(athleteProfileProvider).valueOrNull?.gender;
  final regs = ref.watch(myTournamentRegistrationsProvider).valueOrNull ??
      const <MyTournamentRegistration>[];
  return pickTournamentsForHubPreview(
    tournaments,
    athleteGender: athleteGender,
    registeredCategoriesByTournamentId: registeredCategoriesByTournament(regs),
    limit: 5,
  );
});
