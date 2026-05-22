import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/athlete/domain/gamification_models.dart';

void main() {
  test('UserBadgeProgress normalizes legacy attendance ids', () {
    final progress = UserBadgeProgress.fromMap({
      'id': 'attendance_pontual',
      'title': 'Pontual',
    });
    expect(progress.achievementId, 'ATTENDANCE_STREAK_5');
    expect(progress.title, 'Pontual');
  });

  test('UserBadgeProgress reads badgeId field', () {
    final progress = UserBadgeProgress.fromMap({
      'badgeId': 'FIRST_GAME',
      'title': 'Primeiro jogo',
    });
    expect(progress.achievementId, 'FIRST_GAME');
    expect(progress.legacyBadge, GamificationBadge.firstGame);
  });
}
