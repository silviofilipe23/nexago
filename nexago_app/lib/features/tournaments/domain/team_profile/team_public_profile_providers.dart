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
  final enrichment = ref.read(tournamentMatchEnrichmentServiceProvider);

  final matches = await matchRepo.getByTeamId(id);
  final tournamentIds = <String>{
    for (final match in matches)
      if (match.tournamentId.trim().isNotEmpty) match.tournamentId.trim(),
  };
  final tournamentNames = tournamentIds.isEmpty
      ? const <String, String>{}
      : await tournamentsRepo.getTournamentNames(tournamentIds);

  final opponentTeamIds = <String>{};
  final descriptionsByTeamId = <String, String>{};
  for (final match in matches) {
    final opponentId = match.opponentTeamIdFor(id)?.trim();
    if (opponentId == null || opponentId.isEmpty) continue;
    opponentTeamIds.add(opponentId);
    if (!descriptionsByTeamId.containsKey(opponentId)) {
      final desc = match.teamAId.trim() == id
          ? match.teamBDescription?.trim()
          : match.teamADescription?.trim();
      if (desc != null && desc.isNotEmpty) {
        descriptionsByTeamId[opponentId] = desc;
      }
    }
  }

  final teamDisplayNames = opponentTeamIds.isEmpty
      ? const <String, String>{}
      : await enrichment.resolveTeamDisplayNames(
          opponentTeamIds,
          descriptionsByTeamId: descriptionsByTeamId,
        );

  return TeamMatchHistoryBundle(
    matches: matches,
    tournamentNames: tournamentNames,
    teamDisplayNames: teamDisplayNames,
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

  // Elenco inteiro: equipe nomeada (trio pra cima) espelha só os dois
  // primeiros em player1Id/player2Id, então ler o espelho esconderia o resto.
  final memberIds = team.memberIds;
  final profiles = await Future.wait(
    memberIds.map((uid) => _loadProfile(ref, uid)),
  );
  final captainId = team.captainId;
  final members = [
    for (var i = 0; i < memberIds.length; i++)
      TeamMemberEntry(
        uid: memberIds[i],
        profile: profiles[i],
        isCaptain: memberIds[i] == captainId,
      ),
  ];

  final ranking = await discoverRepo.rankingFor(id);
  final isCurrentUserTeam = currentUid != null &&
      currentUid.isNotEmpty &&
      team.containsPlayer(currentUid);

  return TeamPublicProfile(
    team: team,
    members: members,
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
