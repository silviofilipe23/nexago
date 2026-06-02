import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/auth/auth_providers.dart';
import '../../../tournaments/domain/app_user_profile.dart';
import '../../../tournaments/domain/tournament_match_display.dart';
import '../../../tournaments/domain/tournament_team.dart';
import '../../../tournaments/data/users_repository.dart';
import '../../../tournaments/domain/tournament_discovery_providers.dart';
import '../athlete_profile_providers.dart';
import 'athlete_match_detail_mapper.dart';
import 'athlete_match_detail_models.dart';
import 'match_detail_prototype_content.dart';

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

  final teamA = match.teamAId.trim();
  final teamB = match.teamBId.trim();
  final String? perspectiveTeamId;
  if (teamA.isNotEmpty && teamIds.contains(teamA)) {
    perspectiveTeamId = teamA;
  } else if (teamB.isNotEmpty && teamIds.contains(teamB)) {
    perspectiveTeamId = teamB;
  } else {
    perspectiveTeamId = null;
  }

  final idsToLoad = <String>{};
  if (perspectiveTeamId != null) {
    final opponent = match.opponentTeamIdFor(perspectiveTeamId);
    if (opponent != null && opponent.isNotEmpty) {
      idsToLoad.add(perspectiveTeamId);
      idsToLoad.add(opponent);
    } else if (perspectiveTeamId.isNotEmpty) {
      idsToLoad.add(perspectiveTeamId);
    }
  } else {
    if (teamA.isNotEmpty) idsToLoad.add(teamA);
    if (teamB.isNotEmpty) idsToLoad.add(teamB);
  }

  final teamsRepo = ref.read(tournamentTeamsRepositoryProvider);
  final teams = idsToLoad.isEmpty
      ? <String, TournamentTeam>{}
      : await teamsRepo.getTeamsByIds(idsToLoad);

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

  final categoryLabel = await _categoryLabelForMatch(
    ref: ref,
    tournamentId: match.tournamentId,
    categoryId: match.categoryId,
    stageLabel: matchRoundLabel(match),
  );

  final displayNameOverrides = <String, String>{};
  final athleteProfile = ref.read(athleteProfileProvider).valueOrNull;
  if (athleteProfile != null && athleteProfile.id == uid) {
    final athleteName = readableNameCandidate(athleteProfile.nickname) ??
        readableNameCandidate(athleteProfile.name);
    if (athleteName != null) {
      displayNameOverrides[uid] = athleteName;
    }
  }

  final mapped = mapMatchToDetail(
    match: match,
    context: AthleteMatchDetailMapperContext(
      athleteUid: uid,
      perspectiveTeamId: perspectiveTeamId,
      tournamentName: tournamentNames[match.tournamentId] ?? 'Torneio',
      venueLabel: '',
      teams: teams,
      profiles: profiles,
      displayNameOverrides: displayNameOverrides,
      categoryLabelOverride: categoryLabel,
    ),
  );

  if (mapped == null) return null;
  return enrichMatchDetailWithPrototypeDemo(mapped);
});

Future<String?> _categoryLabelForMatch({
  required Ref ref,
  required String tournamentId,
  required String categoryId,
  required String stageLabel,
}) async {
  final catId = categoryId.trim();
  if (catId.isEmpty) return null;

  try {
    final details = await ref
        .read(tournamentsRepositoryProvider)
        .getTournamentDetails({tournamentId});
    final tournament = details[tournamentId];
    if (tournament == null) return null;

    for (final offer in tournament.categoryOffers) {
      if (offer.id.trim() == catId) {
        final name = offer.name.trim();
        if (name.isEmpty) return null;
        final stage = stageLabel.trim();
        if (stage.isNotEmpty && !name.toLowerCase().contains(stage.toLowerCase())) {
          return '$name · $stage';
        }
        return name;
      }
    }
  } catch (_) {
    return null;
  }
  return null;
}
