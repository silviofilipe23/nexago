import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/auth/auth_providers.dart';
import 'package:nexago_app/core/firebase/firebase_providers.dart';
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

final gamificationSummaryByUserIdProvider = StreamProvider.autoDispose
    .family<GamificationSummary, String>((ref, userId) {
  if (userId.trim().isEmpty) {
    return Stream<GamificationSummary>.value(GamificationSummary.initial());
  }
  return ref.watch(gamificationServiceProvider).watchSummary(userId.trim());
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

/// XP creditado no Firestore para vitória em partida de torneio (`gamification_events`).
final tournamentMatchXpAwardProvider = StreamProvider.autoDispose
    .family<int?, String>((ref, matchId) {
  final userId = ref.watch(authProvider).valueOrNull?.uid;
  final id = matchId.trim();
  if (userId == null || userId.isEmpty || id.isEmpty) {
    return Stream.value(null);
  }
  return ref.watch(gamificationServiceProvider).watchTournamentMatchXpAwarded(
        userId: userId,
        matchId: id,
      );
});
