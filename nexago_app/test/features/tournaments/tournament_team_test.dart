import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_team.dart';

void main() {
  group('memberIds', () {
    test('equipe nomeada usa memberUids, não o espelho player1/player2', () {
      const team = TournamentTeam(
        id: 't1',
        // Espelho legado guarda só os dois primeiros.
        player1Id: 'a',
        player2Id: 'b',
        memberUids: ['a', 'b', 'c', 'd'],
        teamSize: 4,
      );

      expect(team.memberIds, ['a', 'b', 'c', 'd']);
      expect(team.isLargeRoster, isTrue);
      expect(team.containsPlayer('d'), isTrue);
    });

    test('dupla legada (sem memberUids) cai em player1/player2', () {
      const team = TournamentTeam(id: 't2', player1Id: 'a', player2Id: 'b');

      expect(team.memberIds, ['a', 'b']);
      expect(team.isLargeRoster, isFalse);
    });

    test('dupla à procura de parceiro conta o atleta uma vez só', () {
      const team = TournamentTeam(id: 't3', player1Id: 'a', player2Id: 'a');

      expect(team.memberIds, ['a']);
      expect(team.isLookingForPartner, isTrue);
    });

    test('ignora vazios e duplicatas do elenco', () {
      const team = TournamentTeam(
        id: 't4',
        player1Id: 'a',
        player2Id: '',
        memberUids: ['a', '  ', 'b', 'a'],
        teamSize: 3,
      );

      expect(team.memberIds, ['a', 'b']);
      // teamSize manda: elenco incompleto de trio ainda é equipe, não dupla.
      expect(team.isLargeRoster, isTrue);
    });
  });

  group('captainId', () {
    test('usa captainUid quando gravado', () {
      const team = TournamentTeam(
        id: 't1',
        player1Id: 'a',
        player2Id: 'b',
        memberUids: ['a', 'b', 'c'],
        captainUid: 'c',
        teamSize: 3,
      );

      expect(team.captainId, 'c');
    });

    test('sem captainUid, é o primeiro do elenco', () {
      const team = TournamentTeam(id: 't2', player1Id: 'a', player2Id: 'b');

      expect(team.captainId, 'a');
    });
  });

  group('fromMap', () {
    test('lê elenco, tamanho e capitão', () {
      final team = TournamentTeam.fromMap('t1', {
        'player1Id': 'a',
        'player2Id': 'b',
        'memberUids': ['a', 'b', 'c', 1],
        'teamSize': 3,
        'captainUid': 'a',
        'teamName': 'Time da Praia',
      });

      expect(team.memberUids, ['a', 'b', 'c']);
      expect(team.teamSize, 3);
      expect(team.captainUid, 'a');
      expect(team.memberIds, ['a', 'b', 'c']);
    });

    test('teamSize de dupla (< 3) não é elenco nomeado', () {
      final team = TournamentTeam.fromMap('t2', {
        'player1Id': 'a',
        'player2Id': 'b',
        'teamSize': 2,
      });

      expect(team.teamSize, isNull);
      expect(team.isLargeRoster, isFalse);
    });
  });
}
