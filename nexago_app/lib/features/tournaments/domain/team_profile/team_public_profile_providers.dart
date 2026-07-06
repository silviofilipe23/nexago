import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/auth/auth_providers.dart';
import 'package:nexago_app/core/firebase/firebase_providers.dart';
import '../../../athlete/domain/athlete_profile.dart';
import '../../data/team_discover_repository.dart';
import '../tournament_discovery_providers.dart';
import 'team_public_profile_models.dart';

final teamMatchHistoryProvider = FutureProvider.autoDispose
    .family<TeamMatchHistoryBundle, String>((ref, teamId) async {
  final id = teamId.trim();
  if (id.isEmpty) {
    return const TeamMatchHistoryBundle();
  }

  final matchRepo = ref.watch(tournamentMatchesRepositoryProvider);
  final tournamentsRepo = ref.read(tournamentsRepositoryProvider);

  final matches = await matchRepo.getByTeamId(id);
  final tournamentIds = <String>{
    for (final match in matches)
      if (match.tournamentId.trim().isNotEmpty) match.tournamentId.trim(),
  };
  final tournamentNames = tournamentIds.isEmpty
      ? const <String, String>{}
      : await tournamentsRepo.getTournamentNames(tournamentIds);

  return TeamMatchHistoryBundle(
    matches: matches,
    tournamentNames: tournamentNames,
  );
});

final teamPublicProfileProvider = FutureProvider.autoDispose
    .family<TeamPublicProfile?, String>((ref, teamId) async {
  final id = teamId.trim();
  if (id.isEmpty) return null;

  final teamsRepo = ref.watch(tournamentTeamsRepositoryProvider);
  final discoverRepo = ref.read(teamDiscoverRepositoryProvider);
  final currentUid = ref.read(authProvider).valueOrNull?.uid.trim();

  final teams = await teamsRepo.getTeamsByIds({id});
  final team = teams[id];
  if (team == null) return null;

  final player1 = await _loadProfile(ref, team.player1Id);
  final player2 = team.isLookingForPartner
      ? null
      : await _loadProfile(ref, team.player2Id);
  final ranking = await discoverRepo.rankingFor(id);
  final isCurrentUserTeam = currentUid != null &&
      currentUid.isNotEmpty &&
      team.containsPlayer(currentUid);

  return TeamPublicProfile(
    team: team,
    player1: player1,
    player2: player2,
    ranking: ranking,
    isCurrentUserTeam: isCurrentUserTeam,
  );
});

Future<AthleteProfile?> _loadProfile(Ref ref, String uid) async {
  final id = uid.trim();
  if (id.isEmpty) return null;
  final snap =
      await ref.read(firestoreProvider).collection('public_profiles').doc(id).get();
  if (!snap.exists) return null;
  return AthleteProfile.fromFirestore(snap);
}
