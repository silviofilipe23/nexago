import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/profiles/app_user_profile.dart';
import 'package:nexago_app/features/ranking/domain/ranking_list_mapper.dart';
import 'package:nexago_app/features/ranking/domain/ranking_models.dart';

AppUserProfile _user({required String uid, required String fullName}) {
  return AppUserProfile(uid: uid, fullName: fullName);
}

void main() {
  group('teamDisplayName', () {
    test('uses team name when present', () {
      final name = teamDisplayName(
        team: const RankingTeamPlayers(teamId: 't1', teamName: 'Furacão'),
        player1: _user(uid: 'p1', fullName: 'Carlos Silva'),
        player2: _user(uid: 'p2', fullName: 'Carlos Mendes'),
      );
      expect(name, 'Furacão');
    });

    test('shows both first names with last-initial when they differ', () {
      final name = teamDisplayName(
        team: const RankingTeamPlayers(teamId: 't1'),
        player1: _user(uid: 'p1', fullName: 'Carlos Silva'),
        player2: _user(uid: 'p2', fullName: 'Carlos Mendes'),
      );
      expect(name, 'Carlos S. / Carlos M.');
    });

    test('falls back to full names when players share the same first name', () {
      final name = teamDisplayName(
        team: const RankingTeamPlayers(teamId: 't1'),
        player1: _user(uid: 'p1', fullName: 'Atleta Intermediário 20'),
        player2: _user(uid: 'p2', fullName: 'Atleta Open 24'),
      );
      expect(name, isNot(contains('Atleta / Atleta')));
      expect(name, contains('/'));
    });
  });
}
