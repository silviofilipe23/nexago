import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/auth/auth_providers.dart';
import '../../../arenas/domain/arenas_providers.dart';
import '../../../arenas/domain/my_bookings_providers.dart';
import '../profile_completion_models.dart';
import '../profile_completion_providers.dart';
import 'achievement_metrics.dart';
import 'achievement_state_resolver.dart';
import 'achievement_status.dart';

/// Estado da tela Conquistas (catálogo + métricas + desbloqueios).
final achievementsScreenStateProvider =
    Provider.autoDispose<AchievementsScreenState>((ref) {
  final userId = ref.watch(authProvider).valueOrNull?.uid;
  if (userId == null || userId.isEmpty) {
    return AchievementsScreenState.empty;
  }

  final summaryMapAsync = ref.watch(_gamificationSummaryMapProvider);
  final badgeDocsAsync = ref.watch(_gamificationBadgeDocsProvider);
  final profile = ref.watch(profileCompletionStateProvider);
  final bookings = ref.watch(myBookingsStreamProvider).valueOrNull ?? const [];

  final summaryMap = summaryMapAsync.valueOrNull ?? const <String, dynamic>{};
  final badgeDocs = badgeDocsAsync.valueOrNull ?? const [];

  final totalBookings = bookings.where((b) {
    final s = b.rawStatus.trim().toLowerCase();
    return s != 'canceled' && s != 'cancelled';
  }).length;

  if (profile == null) {
    return AchievementsScreenState.empty;
  }

  final identityComplete = _isIdentityComplete(profile);

  final metrics = GamificationSummaryMetrics.fromFirestoreData(
    summaryMap: summaryMap.isEmpty ? null : summaryMap,
    onboardingCompleted: profile.profile.onboardingCompleted,
    profileStepsDone: profile.completedCount,
    profileAllComplete: profile.allComplete,
    identityComplete: identityComplete,
    totalBookings: totalBookings,
  );

  final unlockedAt = AchievementStateResolver.unlockedMapFromBadgeDocs(
    badgeDocs,
  );

  return AchievementStateResolver.resolve(
    metrics: metrics,
    unlockedAtById: unlockedAt,
  );
});

bool _isIdentityComplete(ProfileCompletionState profile) {
  final photo = profile.steps
      .firstWhere((s) => s.step == ProfileCompletionStep.photo)
      .isDone;
  final sport = profile.steps
      .firstWhere((s) => s.step == ProfileCompletionStep.sportLevel)
      .isDone;
  return photo && sport;
}

/// Mapa bruto do summary (campos extras de métricas).
final _gamificationSummaryMapProvider =
    StreamProvider.autoDispose<Map<String, dynamic>>((ref) {
  final userId = ref.watch(authProvider).valueOrNull?.uid;
  if (userId == null || userId.isEmpty) {
    return Stream<Map<String, dynamic>>.value(const {});
  }
  final firestore = ref.watch(firestoreProvider);
  return firestore
      .collection('users')
      .doc(userId)
      .collection('gamification')
      .doc('summary')
      .snapshots()
      .map((s) => s.data() ?? const {});
});

/// Documentos de badges desbloqueados.
final _gamificationBadgeDocsProvider =
    StreamProvider.autoDispose<List<Map<String, dynamic>>>((ref) {
  final userId = ref.watch(authProvider).valueOrNull?.uid;
  if (userId == null || userId.isEmpty) {
    return Stream<List<Map<String, dynamic>>>.value(const []);
  }
  return ref
      .watch(firestoreProvider)
      .collection('users')
      .doc(userId)
      .collection('gamification_badges')
      .orderBy('unlockedAt', descending: true)
      .snapshots()
      .map((snap) => snap.docs.map((d) => d.data()).toList(growable: false));
});
