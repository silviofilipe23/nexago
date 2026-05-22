import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/athlete/domain/achievements/achievement_catalog.dart';
import 'package:nexago_app/features/athlete/domain/achievements/achievement_category.dart';

void main() {
  test('catalog has 24 unique achievement ids', () {
    expect(AchievementCatalog.totalCount, 24);
    expect(AchievementCatalog.all.length, 24);
    final ids = AchievementCatalog.all.map((d) => d.id).toList();
    expect(ids.toSet().length, 24, reason: 'duplicate ids: $ids');
  });

  test('each category has 8 achievements', () {
    for (final category in AchievementCategory.displayOrder) {
      final items = AchievementCatalog.forCategory(category);
      expect(items.length, 8, reason: category.name);
    }
  });

  test('legacy ids normalize to catalog ids', () {
    expect(
      AchievementCatalog.normalizeId('attendance_pontual'),
      'ATTENDANCE_STREAK_5',
    );
    expect(
      AchievementCatalog.normalizeId('attendance_comprometido'),
      'ATTENDANCE_TOTAL_10',
    );
    expect(AchievementCatalog.byId('FIRST_GAME')?.title, 'Primeiro jogo');
  });

  test('all achievements have positive xp', () {
    for (final def in AchievementCatalog.all) {
      expect(def.xpReward, greaterThan(0));
    }
  });
}
