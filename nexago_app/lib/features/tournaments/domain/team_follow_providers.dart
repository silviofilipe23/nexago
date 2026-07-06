import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/auth/auth_providers.dart';
import 'package:nexago_app/core/firebase/firebase_providers.dart';
import '../../athlete/domain/athlete_follow_providers.dart';
import '../data/team_follow_service.dart';

final teamFollowServiceProvider = Provider<TeamFollowService>((ref) {
  return TeamFollowService(
    ref.watch(firestoreProvider),
    ref.watch(athleteFollowServiceProvider),
  );
});

final teamIsFollowedProvider = StreamProvider.autoDispose
    .family<bool, String>((ref, teamId) {
  final uid = ref.watch(authProvider).valueOrNull?.uid.trim();
  if (uid == null || uid.isEmpty) return Stream<bool>.value(false);
  return ref.watch(teamFollowServiceProvider).watchIsFollowingTeam(
        followerId: uid,
        teamId: teamId,
      );
});
