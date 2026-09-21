import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/ranking/domain/ranking_models.dart';

void main() {
  // Esta é a regra que a consulta de pódios TEM de espelhar. Ela não testa a
  // consulta — o projeto não tem fake de Firestore —, mas fixa a semântica que
  // eu quebrei: dupla não tem `memberUids`.
  group('RankingTeamPlayers.memberIds', () {
    test('dupla legada resolve por player1/player2, sem memberUids', () {
      final dupla = RankingTeamPlayers.fromDoc('t1', {
        'player1Id': 'goret',
        'player2Id': 'parceiro',
      });

      expect(dupla.memberUids, isEmpty, reason: 'dupla não grava memberUids');
      expect(dupla.memberIds, ['goret', 'parceiro']);
    });

    test('equipe nomeada resolve por memberUids', () {
      final trio = RankingTeamPlayers.fromDoc('t2', {
        'player1Id': 'a',
        'player2Id': 'b',
        'memberUids': ['a', 'b', 'c'],
        'teamSize': 3,
      });

      expect(trio.memberIds, ['a', 'b', 'c']);
    });

    test('dupla incompleta não conta o atleta duas vezes', () {
      final solo = RankingTeamPlayers.fromDoc('t3', {
        'player1Id': 'goret',
        'player2Id': 'goret',
      });

      expect(solo.memberIds, ['goret']);
    });

    test('equipe sem ninguém devolve lista vazia', () {
      expect(RankingTeamPlayers.fromDoc('t4', const {}).memberIds, isEmpty);
    });
  });
}
