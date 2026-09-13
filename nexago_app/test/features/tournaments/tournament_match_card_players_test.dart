import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/profiles/app_user_profile.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_match_card_players.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_team.dart';

AppUserProfile _profile(String uid, String name, {String? photo}) {
  return AppUserProfile(uid: uid, fullName: name, profilePhotoUrl: photo);
}

void main() {
  group('playersFromTeam', () {
    test('names each player and carries the profile photo', () {
      final players = playersFromTeam(
        const TournamentTeam(id: 'e1', player1Id: 'u1', player2Id: 'u2'),
        {
          'u1': _profile('u1', 'Bruno Silva', photo: 'https://foto/bruno.jpg'),
          'u2': _profile('u2', 'Lucas Souza'),
        },
      );

      expect(players.map((p) => p.name), ['Bruno Silva', 'Lucas Souza']);
      expect(players.first.avatarUrl, 'https://foto/bruno.jpg');
      expect(players.last.avatarUrl, isNull);
    });

    test('a player without a profile still gets a name, never an empty label',
        () {
      final players = playersFromTeam(
        const TournamentTeam(id: 'e1', player1Id: 'u1', player2Id: ''),
        const {},
      );

      expect(players, hasLength(1));
      expect(players.single.name, isNotEmpty);
    });

    test('skips empty player slots (reserva solo sem parceiro)', () {
      final players = playersFromTeam(
        const TournamentTeam(id: 'e1', player1Id: 'u1', player2Id: ''),
        {'u1': _profile('u1', 'Ana Lima')},
      );

      expect(players.map((p) => p.name), ['Ana Lima']);
    });
  });

  group('playersFromDisplayName', () {
    test('splits the pair label and names each side', () {
      final players = playersFromDisplayName('Bruno / Lucas');

      expect(players.map((p) => p.name), ['Bruno', 'Lucas']);
    });

    test('a single label yields one player with that name', () {
      final players = playersFromDisplayName('Os Invencíveis');

      expect(players.map((p) => p.name), ['Os Invencíveis']);
    });

    test('an empty label yields one unnamed placeholder', () {
      final players = playersFromDisplayName('');

      expect(players, hasLength(1));
      expect(players.single.initials, '?');
      expect(players.single.name, isEmpty);
    });
  });
}
