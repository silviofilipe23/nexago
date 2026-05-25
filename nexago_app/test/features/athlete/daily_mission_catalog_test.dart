import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/athlete/domain/athlete_quest/athlete_quest_logic.dart';
import 'package:nexago_app/features/athlete/domain/daily_mission_catalog.dart';
import 'package:nexago_app/features/athlete/domain/gamification_models.dart';

void main() {
  test('catalog has six missions', () {
    expect(DailyMissionCatalog.all.length, 6);
  });

  test('total XP matches sum of rewards', () {
    expect(dailyMissionsTotalXp(), 160);
    expect(DailyMissionCatalog.totalXpReward(), 160);
  });

  test('missionXpReward returns catalog values', () {
    expect(missionXpReward('PLAY_TODAY'), 40);
    // expect(missionXpReward('INVITE_ONE_PLAYER'), 30);
    expect(missionXpReward('RESERVE_TODAY'), 35);
    expect(missionXpReward('FAVORITE_ARENA'), 15);
    expect(missionXpReward('EXPLORE_TOURNAMENT'), 20);
    expect(missionXpReward('SHARE_PROFILE'), 20);
  });

  test('GamificationMission.fromId resolves all catalog ids', () {
    for (final def in DailyMissionCatalog.all) {
      expect(GamificationMission.fromId(def.id), isNotNull);
    }
  });
}
