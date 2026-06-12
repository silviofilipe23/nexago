import 'package:cloud_firestore/cloud_firestore.dart';

import '../../athlete/data/athlete_follow_service.dart';
import '../domain/team_follow_logic.dart';
import '../domain/tournament_team.dart';

/// Seguir / deixar de seguir duplas.
///
/// Fonte de verdade: `users/{followerId}/followingTeams/{teamId}`
/// Efeito colateral: follow/unfollow dos atletas da dupla.
class TeamFollowService {
  TeamFollowService(this._firestore, this._athleteFollowService);

  final FirebaseFirestore _firestore;
  final AthleteFollowService _athleteFollowService;

  CollectionReference<Map<String, dynamic>> _followingTeamsRef(
    String followerId,
  ) {
    return _firestore
        .collection('users')
        .doc(followerId)
        .collection('followingTeams');
  }

  Stream<bool> watchIsFollowingTeam({
    required String followerId,
    required String teamId,
  }) {
    final follower = followerId.trim();
    final team = teamId.trim();
    if (follower.isEmpty || team.isEmpty) {
      return Stream<bool>.value(false);
    }
    return _followingTeamsRef(follower).doc(team).snapshots().map((snap) {
      return snap.exists;
    });
  }

  Future<Set<String>> fetchFollowingTeamIds(String followerId) async {
    final id = followerId.trim();
    if (id.isEmpty) return {};
    final snap = await _followingTeamsRef(id).get();
    return snap.docs.map((d) => d.id).toSet();
  }

  Future<void> setTeamFollowing({
    required String followerId,
    required TournamentTeam team,
    required bool follow,
  }) async {
    final follower = followerId.trim();
    final teamId = team.id.trim();
    if (follower.isEmpty || teamId.isEmpty) return;
    if (!canFollowTeam(team, follower) && follow) return;

    final teamDoc = _followingTeamsRef(follower).doc(teamId);
    if (follow) {
      await teamDoc.set(
        <String, dynamic>{
          'teamId': teamId,
          'player1Id': team.player1Id.trim(),
          'player2Id': team.player2Id.trim(),
          'followedAt': FieldValue.serverTimestamp(),
        },
        SetOptions(merge: true),
      );
    } else {
      await teamDoc.delete();
    }

    final athleteIds = teamFollowTargetAthleteIds(team, follower);
    for (final athleteId in athleteIds) {
      await _athleteFollowService.setFollowing(
        followerId: follower,
        athleteId: athleteId,
        follow: follow,
      );
    }
  }
}
