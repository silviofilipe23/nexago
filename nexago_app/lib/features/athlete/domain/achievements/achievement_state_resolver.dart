import 'package:cloud_firestore/cloud_firestore.dart';

import 'achievement_catalog.dart';
import 'achievement_metrics.dart';
import 'achievement_status.dart';
import 'achievement_unlock_rule.dart';

/// Resolve progresso e desbloqueio a partir do catálogo + métricas + docs Firestore.
abstract final class AchievementStateResolver {
  AchievementStateResolver._();

  static AchievementsScreenState resolve({
    required AchievementMetrics metrics,
    required Map<String, DateTime> unlockedAtById,
  }) {
    final items = <AchievementViewModel>[];
    var unlocked = 0;
    var inProgress = 0;

    for (final def in AchievementCatalog.all) {
      final unlockedAt = unlockedAtById[def.id];
      if (unlockedAt != null) {
        items.add(
          AchievementViewModel(
            definition: def,
            status: AchievementUnlocked(unlockedAt: unlockedAt),
          ),
        );
        unlocked++;
        continue;
      }

      final progress = _evaluateProgress(def.rule, metrics);
      if (progress.met) {
        items.add(
          AchievementViewModel(
            definition: def,
            status: const AchievementUnlocked(),
          ),
        );
        unlocked++;
      } else if (progress.current > 0) {
        items.add(
          AchievementViewModel(
            definition: def,
            status: AchievementInProgress(
              current: progress.current,
              target: progress.target,
              progress: progress.fraction,
            ),
          ),
        );
        inProgress++;
      } else {
        items.add(
          AchievementViewModel(
            definition: def,
            status: const AchievementLocked(),
          ),
        );
      }
    }

    return AchievementsScreenState(
      items: items,
      unlockedCount: unlocked,
      inProgressCount: inProgress,
      totalCount: AchievementCatalog.totalCount,
    );
  }

  static bool isRuleMet(AchievementUnlockRule rule, AchievementMetrics m) {
    return _evaluateProgress(rule, m).met;
  }

  static _Progress _evaluateProgress(
    AchievementUnlockRule rule,
    AchievementMetrics m,
  ) {
    return switch (rule) {
      OnboardingCompletedRule() => _boolProgress(
          met: m.onboardingCompleted,
          current: m.onboardingCompleted ? 1 : 0,
          target: 1,
        ),
      TotalGamesRule(:final target) => _intProgress(m.totalGames, target),
      StreakRule(:final target) => _intProgress(m.streak, target),
      GamesInLastDaysRule(:final days, :final target) => _intProgress(
          days == 7 ? m.gamesLast7Days : m.gamesLast30Days,
          target,
        ),
      ProfileStepsDoneRule(:final target) =>
        _intProgress(m.profileStepsDone, target),
      ProfileAllCompleteRule() => _boolProgress(
          met: m.profileAllComplete,
          current: m.profileAllComplete ? 1 : 0,
          target: 1,
        ),
      IdentityCompleteRule() => _boolProgress(
          met: m.identityComplete,
          current: m.identityComplete ? 1 : 0,
          target: 1,
        ),
      InvitesCountRule(:final target) => _intProgress(m.invitesCount, target),
      ProfileSharesCountRule(:final target) =>
        _intProgress(m.profileSharesCount, target),
      AttendanceConfirmationsRule(:final target) =>
        _intProgress(m.attendanceConfirmationsTotal, target),
      AttendanceStreakRule(:final target) =>
        _intProgress(m.attendanceConfirmationStreak, target),
      TotalBookingsRule(:final target) => _intProgress(m.totalBookings, target),
      FavoriteArenasCountRule(:final target) =>
        _intProgress(m.favoriteArenasCount, target),
      CheckInsCountRule(:final target) => _intProgress(m.checkInsCount, target),
    };
  }

  static _Progress _intProgress(int current, int target) {
    final t = target <= 0 ? 1 : target;
    final c = current.clamp(0, t);
    return _Progress(
      current: c,
      target: t,
      met: current >= target,
      fraction: (c / t).clamp(0.0, 1.0),
    );
  }

  static _Progress _boolProgress({
    required bool met,
    required int current,
    required int target,
  }) {
    return _Progress(
      current: current,
      target: target,
      met: met,
      fraction: met ? 1.0 : 0.0,
    );
  }

  static Map<String, DateTime> unlockedMapFromBadgeDocs(
    Iterable<Map<String, dynamic>> docs,
  ) {
    final map = <String, DateTime>{};
    for (final data in docs) {
      final rawId = (data['badgeId'] as String?) ??
          (data['id'] as String?) ??
          '';
      final id = AchievementCatalog.normalizeId(rawId);
      if (id.isEmpty) continue;
      final ts = data['unlockedAt'];
      final at = ts is Timestamp ? ts.toDate() : DateTime.now();
      map[id] = at;
    }
    return map;
  }
}

class _Progress {
  const _Progress({
    required this.current,
    required this.target,
    required this.met,
    required this.fraction,
  });

  final int current;
  final int target;
  final bool met;
  final double fraction;
}
