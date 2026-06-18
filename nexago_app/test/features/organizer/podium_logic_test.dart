import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/organizer/domain/category_ops/podium_logic.dart';

PodiumMatch m({
  required String type,
  String? winner,
  String a = 'a',
  String b = 'b',
  bool done = true,
}) =>
    (
      matchType: type,
      winnerId: winner,
      teamAId: a,
      teamBId: b,
      isCompleted: done,
    );

void main() {
  group('computeCategoryPodium', () {
    test('empty while the final is not decided', () {
      expect(
        computeCategoryPodium([m(type: 'Final', winner: null, done: false)]),
        CategoryPodium.empty,
      );
      expect(computeCategoryPodium(const []).isDecided, isFalse);
    });

    test('champion and runner-up come from the Final match', () {
      final podium = computeCategoryPodium([
        m(type: 'WB', winner: 't1', a: 't1', b: 't2'),
        m(type: 'Final', winner: 't1', a: 't1', b: 't3'),
      ]);
      expect(podium.isDecided, isTrue);
      expect(podium.championTeamId, 't1');
      expect(podium.runnerUpTeamId, 't3');
      expect(podium.thirdPlaceTeamId, isNull);
    });

    test('third place comes from a completed Third Place match', () {
      final podium = computeCategoryPodium([
        m(type: 'Final', winner: 'b', a: 'a', b: 'b'),
        m(type: 'Third Place', winner: 'c', a: 'c', b: 'd'),
      ]);
      expect(podium.championTeamId, 'b');
      expect(podium.runnerUpTeamId, 'a');
      expect(podium.thirdPlaceTeamId, 'c');
    });

    test('ignores an unfinished third place match', () {
      final podium = computeCategoryPodium([
        m(type: 'Final', winner: 'a'),
        m(type: '3rd place', winner: null, a: 'c', b: 'd', done: false),
      ]);
      expect(podium.championTeamId, 'a');
      expect(podium.thirdPlaceTeamId, isNull);
    });

    test('does not crown a champion when the final lacks a winnerId', () {
      expect(
        computeCategoryPodium([m(type: 'Final', winner: '  ')]).isDecided,
        isFalse,
      );
    });
  });
}
