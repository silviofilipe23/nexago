import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/auth/auth_providers.dart';
import '../../arenas/domain/arenas_providers.dart';
import '../data/gamification_service.dart';
import 'gamification_models.dart';

final gamificationServiceProvider = Provider<GamificationService>((ref) {
  return GamificationService(ref.watch(firestoreProvider));
});

final gamificationSummaryProvider =
    StreamProvider.autoDispose<GamificationSummary>((ref) {
  final userId = ref.watch(authProvider).valueOrNull?.uid;
  if (userId == null || userId.isEmpty) {
    return Stream<GamificationSummary>.value(GamificationSummary.initial());
  }
  return ref.watch(gamificationServiceProvider).watchSummary(userId);
});

final gamificationBadgesProvider =
    StreamProvider.autoDispose<List<UserBadgeProgress>>((ref) {
  final userId = ref.watch(authProvider).valueOrNull?.uid;
  if (userId == null || userId.isEmpty) {
    return Stream<List<UserBadgeProgress>>.value(const []);
  }
  return ref.watch(gamificationServiceProvider).watchBadges(userId);
});

final dailyMissionsProvider =
    StreamProvider.autoDispose<DailyMissionBundle>((ref) {
  final userId = ref.watch(authProvider).valueOrNull?.uid;
  if (userId == null || userId.isEmpty) {
    return Stream<DailyMissionBundle>.value(
      DailyMissionBundle(dayKey: '', missions: const []),
    );
  }
  return ref.watch(gamificationServiceProvider).watchDailyMissions(
        userId,
        DateTime.now(),
      );
});

final gamificationNudgeProvider = Provider.autoDispose<String?>((ref) {
  final summary = ref.watch(gamificationSummaryProvider).valueOrNull;
  return summary?.motivationalNudge;
});
