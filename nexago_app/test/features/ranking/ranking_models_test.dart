import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/ranking/domain/ranking_models.dart';

void main() {
  // Espelha `extractTeamMemberUids` (functions/src/tournament-team-category.ts):
  // `memberUids` vence; dupla legada sem o campo cai em player1Id/player2Id.
  group('RankingTeamPlayers.fromDoc', () {
    test('usa memberUids quando existir (equipe trio/quarteto/quinteto)', () {
      final team = RankingTeamPlayers.fromDoc('team-1', {
        'memberUids': ['cap', 'm2', 'm3', 'm4'],
        'player1Id': 'cap',
        'player2Id': 'm2',
      });
      expect(team.memberIds, ['cap', 'm2', 'm3', 'm4']);
    });

    test('deduplica e ignora entradas vazias de memberUids', () {
      final team = RankingTeamPlayers.fromDoc('team-1', {
        'memberUids': ['cap', ' ', 'cap', 'm2'],
      });
      expect(team.memberIds, ['cap', 'm2']);
    });

    test('cai em player1Id/player2Id na dupla legada sem memberUids', () {
      final team = RankingTeamPlayers.fromDoc('team-1', {
        'player1Id': 'p1',
        'player2Id': 'p2',
      });
      expect(team.memberIds, ['p1', 'p2']);
      expect(team.player1Id, 'p1');
      expect(team.player2Id, 'p2');
    });

    test('não repete o atleta da dupla incompleta (player1 == player2)', () {
      final team = RankingTeamPlayers.fromDoc('team-1', {
        'player1Id': 'solo',
        'player2Id': 'solo',
      });
      expect(team.memberIds, ['solo']);
    });

    test('cai no fallback legado quando memberUids existe mas está vazio', () {
      final team = RankingTeamPlayers.fromDoc('team-1', {
        'memberUids': <dynamic>[],
        'player1Id': 'p1',
        'player2Id': 'p2',
      });
      expect(team.memberIds, ['p1', 'p2']);
    });

    test('cai no fallback legado quando memberUids só tem valores inválidos',
        () {
      final team = RankingTeamPlayers.fromDoc('team-1', {
        'memberUids': [1, null, true, {'uid': 'x'}, '  '],
        'player1Id': 'p1',
        'player2Id': 'p2',
      });
      expect(team.memberIds, ['p1', 'p2']);
    });

    test('ignora não-strings, faz trim e NÃO mescla com player1/player2', () {
      final team = RankingTeamPlayers.fromDoc('team-1', {
        'memberUids': [42, 'cap', null, ' m2 '],
        'player1Id': 'legacy1',
        'player2Id': 'legacy2',
      });
      // memberUids venceu: legacy1/legacy2 não entram no elenco.
      expect(team.memberIds, ['cap', 'm2']);
    });

    test('trata memberUids não-lista como ausente (fallback legado)', () {
      final team = RankingTeamPlayers.fromDoc('team-1', {
        'memberUids': 'cap,m2',
        'player1Id': 'p1',
        'player2Id': 'p2',
      });
      expect(team.memberIds, ['p1', 'p2']);
    });

    test('documento sem jogadores devolve elenco vazio (não credita ninguém)',
        () {
      final team = RankingTeamPlayers.fromDoc('team-1', {});
      expect(team.memberIds, isEmpty);
      expect(team.player1Id, isNull);
      expect(team.player2Id, isNull);
    });
  });
}
