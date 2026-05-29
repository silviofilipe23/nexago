import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/auth/auth_providers.dart';
import '../../../tournaments/domain/app_user_profile.dart';
import '../../../tournaments/data/users_repository.dart';
import '../../../tournaments/domain/tournament_discovery_providers.dart';
import '../athlete_profile_providers.dart';
import 'athlete_match_detail_mapper.dart';
import 'athlete_match_detail_models.dart';

final athleteMatchDetailProvider = FutureProvider.autoDispose
    .family<AthleteMatchDetail?, String>((ref, matchId) async {
  final uid = (ref.watch(authProvider).valueOrNull?.uid ?? '').trim();
  if (uid.isEmpty) return null;

  ref.watch(athleteProfileProvider);

  final match =
      await ref.read(tournamentMatchesRepositoryProvider).getById(matchId);
  if (match == null) return null;

  final teamIds =
      await ref.read(tournamentTeamsRepositoryProvider).teamIdsForAthlete(uid);
  final athleteTeamId = teamIds.contains(match.teamAId)
      ? match.teamAId
      : teamIds.contains(match.teamBId)
          ? match.teamBId
          : null;
  if (athleteTeamId == null || athleteTeamId.isEmpty) return null;

  final opponentTeamId = match.opponentTeamIdFor(athleteTeamId);
  if (opponentTeamId == null) return null;

  final teamsRepo = ref.read(tournamentTeamsRepositoryProvider);
  final teams = await teamsRepo.getTeamsByIds({
    athleteTeamId,
    opponentTeamId,
  });

  final userIds = <String>{};
  for (final team in teams.values) {
    if (team.player1Id.isNotEmpty) userIds.add(team.player1Id);
    if (team.player2Id.isNotEmpty) userIds.add(team.player2Id);
  }

  final usersRepo = ref.read(usersRepositoryProvider);
  final profiles = <String, AppUserProfile>{};
  await Future.wait(
    userIds.map((id) async {
      final profile = await usersRepo.getUserById(id);
      if (profile != null) profiles[id] = profile;
    }),
  );

  final tournamentNames = await ref
      .read(tournamentsRepositoryProvider)
      .getTournamentNames({match.tournamentId});

  final displayNameOverrides = <String, String>{};
  final athleteProfile = ref.read(athleteProfileProvider).valueOrNull;
  if (athleteProfile != null && athleteProfile.id == uid) {
    final athleteName = readableNameCandidate(athleteProfile.nickname) ??
        readableNameCandidate(athleteProfile.name);
    if (athleteName != null) {
      displayNameOverrides[uid] = athleteName;
    }
  }

  return mapMatchToDetail(
    match: match,
    context: AthleteMatchDetailMapperContext(
      athleteUid: uid,
      athleteTeamId: athleteTeamId,
      tournamentName: tournamentNames[match.tournamentId] ?? 'Torneio',
      venueLabel: '',
      teams: teams,
      profiles: profiles,
      displayNameOverrides: displayNameOverrides,
    ),
  );
});
