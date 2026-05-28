import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/athlete/domain/athlete_quest/athlete_quest_logic.dart';
import 'package:nexago_app/features/athlete/domain/athlete_quest/athlete_quest_models.dart';
import 'package:nexago_app/features/athlete/domain/gamification_models.dart';

void main() {
  group('levelTitle', () {
    test('returns Estreante for display level 2', () {
      expect(levelTitle(2), 'Estreante');
    });

    test('returns Bola na rede for display level 3', () {
      expect(levelTitle(3), 'Bola na rede');
    });
  });

  group('buildStreakWeekDays', () {
    test('marks completed days from gameCompletionDays', () {
      final now = DateTime(2026, 5, 22);
      final summary = GamificationSummary(
        xp: 200,
        level: 2,
        streak: 3,
        totalGames: 8,
        lastGameDate: now,
        updatedAt: now,
        gameCompletionDays: ['2026-05-20', '2026-05-21', '2026-05-22'],
      );

      final days = buildStreakWeekDays(summary, now);
      final completed = days
          .where((d) => d.state == StreakWeekDayState.completed)
          .length;

      expect(completed, 3);
      expect(
        days.any((d) => d.state == StreakWeekDayState.today),
        isFalse,
      );
    });

    test('streak 3 with last game yesterday yields 3 completed and today', () {
      final now = DateTime(2026, 5, 22); // Thursday
      final yesterday = now.subtract(const Duration(days: 1));
      final summary = GamificationSummary(
        xp: 130,
        level: 1,
        streak: 3,
        totalGames: 5,
        lastGameDate: yesterday,
        updatedAt: now,
      );

      final days = buildStreakWeekDays(summary, now);
      expect(days, hasLength(7));

      final completed = days
          .where((d) => d.state == StreakWeekDayState.completed)
          .length;
      final todayCount = days
          .where((d) => d.state == StreakWeekDayState.today)
          .length;

      expect(completed, 3);
      expect(todayCount, 1);
      expect(days.any((d) => d.state == StreakWeekDayState.today), isTrue);
    });
  });

  group('missionXpReward', () {
    test('PLAY_TODAY grants 40 XP', () {
      expect(missionXpReward('PLAY_TODAY'), 40);
    });

    // test('INVITE_ONE_PLAYER grants 30 XP', () {
    //   expect(missionXpReward('INVITE_ONE_PLAYER'), 30);
    // });
  });
}
