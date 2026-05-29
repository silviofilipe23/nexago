import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/auth/auth_providers.dart';
import '../../arenas/domain/arenas_providers.dart';
import '../data/athlete_follow_service.dart';

final athleteFollowServiceProvider = Provider<AthleteFollowService>((ref) {
  return AthleteFollowService(ref.watch(firestoreProvider));
});

final athleteIsFollowingProvider =
    StreamProvider.autoDispose.family<bool, String>((ref, athleteId) {
  final user = ref.watch(authProvider).valueOrNull;
  final uid = user?.uid.trim();
  if (uid == null || uid.isEmpty) return Stream<bool>.value(false);
  return ref.watch(athleteFollowServiceProvider).watchIsFollowing(
        followerId: uid,
        athleteId: athleteId,
      );
});

final athleteFollowersCountProvider =
    StreamProvider.autoDispose.family<int, String>((ref, athleteId) {
  return ref
      .watch(athleteFollowServiceProvider)
      .watchFollowersCount(athleteId);
});

final athleteFollowingCountProvider =
    StreamProvider.autoDispose.family<int, String>((ref, athleteId) {
  return ref
      .watch(athleteFollowServiceProvider)
      .watchFollowingCount(athleteId);
});
