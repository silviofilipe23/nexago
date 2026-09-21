import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_podium_logic.dart';

PodiumMatch m({
  required String type,
  String? winner,
  String a = 'a',
  String b = 'b',
  bool done = true,
  List<String> standing = const [],
}) =>
    (
      matchType: type,
      winnerId: winner,
      teamAId: a,
      teamBId: b,
      isCompleted: done,
      standingTeamIds: standing,
    );

/// Rodada final do King of the Court: sem dois lados, com tabela.
PodiumMatch kocFinal({
  required List<String> standing,
  bool done = true,
}) =>
    m(
      type: 'koc_final',
      a: '',
      b: '',
      winner: standing.isEmpty ? null : standing.first,
      done: done,
      standing: standing,
    );

void main() {
  group('computeCategoryPodium — King of the Court', () {
    test('o pódio inteiro sai da tabela da rodada final', () {
      // Não há disputa de 3º lugar: sem eliminação, a tabela já ordena todos.
      final podium = computeCategoryPodium([
        m(type: 'koc_round', a: '', b: '', winner: 'x'),
        kocFinal(standing: ['campea', 'vice', 'terceira', 'quarta']),
      ]);
      expect(podium.championTeamId, 'campea');
      expect(podium.runnerUpTeamId, 'vice');
      expect(podium.thirdPlaceTeamId, 'terceira');
      expect(podium.isDecided, isTrue);
    });

    test('rodada de 3 duplas dá pódio sem 3º lugar', () {
      final podium = computeCategoryPodium([
        kocFinal(standing: ['campea', 'vice']),
      ]);
      expect(podium.thirdPlaceTeamId, isNull);
      expect(podium.isDecided, isTrue);
    });

    test('sem tabela não há pódio, mesmo com a rodada concluída', () {
      // Pódio torto é pior que pódio ausente.
      expect(computeCategoryPodium([kocFinal(standing: const [])]),
          CategoryPodium.empty);
    });

    test('final em andamento não decide nada', () {
      expect(
        computeCategoryPodium([
          kocFinal(standing: ['campea', 'vice'], done: false),
        ]),
        CategoryPodium.empty,
      );
    });

    test('as fases anteriores do KOTC não viram pódio', () {
      expect(
        computeCategoryPodium([
          m(type: 'koc_semifinal', a: '', b: '', winner: 'x',
              standing: ['x', 'y']),
        ]),
        CategoryPodium.empty,
      );
    });
  });

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
