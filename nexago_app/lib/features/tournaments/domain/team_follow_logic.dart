import 'tournament_team.dart';

/// Atletas que devem receber follow/unfollow ao seguir a dupla.
Set<String> teamFollowTargetAthleteIds(TournamentTeam team, String? viewerUid) {
  final viewer = viewerUid?.trim() ?? '';
  final targets = <String>{team.player1Id.trim()};
  if (!team.isLookingForPartner) {
    targets.add(team.player2Id.trim());
  }
  targets.remove('');
  if (viewer.isNotEmpty) targets.remove(viewer);
  return targets;
}

bool canFollowTeam(TournamentTeam team, String? viewerUid) {
  final viewer = viewerUid?.trim() ?? '';
  if (viewer.isEmpty) return false;
  if (team.containsPlayer(viewer)) return false;
  return teamFollowTargetAthleteIds(team, viewer).isNotEmpty;
}

bool isTeamFollowed(Set<String> followingTeamIds, String teamId) {
  final id = teamId.trim();
  if (id.isEmpty) return false;
  return followingTeamIds.contains(id);
}
