import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/athlete/domain/achievements/achievement_metrics.dart';
import 'package:nexago_app/features/athlete/domain/achievements/achievement_state_resolver.dart';
import 'package:nexago_app/features/athlete/domain/achievements/achievement_status.dart';

void main() {
  test('3 of 10 games in 30d shows 0.3 progress', () {
    const metrics = AchievementMetrics(
      xp: 0,
      level: 0,
      streak: 0,
      totalGames: 3,
      invitesCount: 0,
      profileSharesCount: 0,
      gamesLast30Days: 3,
      gamesLast7Days: 0,
      favoriteArenasCount: 0,
      checkInsCount: 0,
      attendanceConfirmationsTotal: 0,
      attendanceConfirmationStreak: 0,
      totalBookings: 0,
      onboardingCompleted: false,
      profileStepsDone: 0,
      profileAllComplete: false,
      identityComplete: false,
    );

    final state = AchievementStateResolver.resolve(
      metrics: metrics,
      unlockedAtById: const {},
    );

    final tenGames =
        state.items.firstWhere((i) => i.definition.id == 'TEN_GAMES_30D');
    expect(tenGames.isInProgress, isTrue);
    final progress = tenGames.status;
    expect(progress, isA<AchievementInProgress>());
    expect((progress as AchievementInProgress).current, 3);
    expect(progress.target, 10);
    expect(progress.progress, closeTo(0.3, 0.01));
  });

  test('unlocked firestore doc counts as unlocked', () {
    const metrics = AchievementMetrics(
      xp: 0,
      level: 0,
      streak: 0,
      totalGames: 0,
      invitesCount: 0,
      profileSharesCount: 0,
      gamesLast30Days: 0,
      gamesLast7Days: 0,
      favoriteArenasCount: 0,
      checkInsCount: 0,
      attendanceConfirmationsTotal: 0,
      attendanceConfirmationStreak: 0,
      totalBookings: 0,
      onboardingCompleted: false,
      profileStepsDone: 0,
      profileAllComplete: false,
      identityComplete: false,
    );

    final state = AchievementStateResolver.resolve(
      metrics: metrics,
      unlockedAtById: {
        'FIRST_GAME': DateTime(2025, 1, 1),
      },
    );

    final first =
        state.items.firstWhere((i) => i.definition.id == 'FIRST_GAME');
    expect(first.isUnlocked, isTrue);
    expect(state.unlockedCount, greaterThanOrEqualTo(1));
  });

  test('legacy badge id maps via unlockedMapFromBadgeDocs', () {
    final map = AchievementStateResolver.unlockedMapFromBadgeDocs([
      {'id': 'attendance_pontual', 'unlockedAt': null},
    ]);
    expect(map.containsKey('ATTENDANCE_STREAK_5'), isTrue);
  });
}
