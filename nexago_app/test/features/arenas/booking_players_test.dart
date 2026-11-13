import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/arenas/domain/booking_players.dart';

void main() {
  group('bookingResultPlayersOf', () {
    test('lê o espelho do placar, sem repetir e ignorando entrada sem uid', () {
      final players = bookingResultPlayersOf({
        'resultPlayers': [
          {'uid': 'a', 'name': 'Ana', 'avatarUrl': 'https://x/a.jpg'},
          {'uid': 'a', 'name': 'Ana de novo'},
          {'name': 'Sem uid'},
          'lixo',
          {'uid': ' b ', 'name': '  '},
        ],
      });
      expect(players.map((p) => p.userId), ['a', 'b']);
      expect(players.first.avatarUrl, 'https://x/a.jpg');
      expect(players.last.displayName, isNull);
    });

    test('reserva sem placar: lista vazia', () {
      expect(bookingResultPlayersOf({}), isEmpty);
      expect(bookingResultPlayersOf({'resultPlayers': 'x'}), isEmpty);
    });
  });

  group('bookingGuestsOf', () {
    test('convidados primeiro, depois o placar; dono e repetidos ficam de fora',
        () {
      final guests = bookingGuestsOf(
        {
          'participants': [
            {'uid': 'g1', 'name': 'Convidado', 'via': 'link'},
          ],
          'guestAthleteId': 'legado',
          'guestAthleteName': 'Legado',
          'resultPlayers': [
            {'uid': 'owner', 'name': 'Dono'},
            {'uid': 'g1', 'name': 'Convidado'},
            {'uid': 'p1', 'name': 'Só no placar'},
          ],
        },
        ownerUid: 'owner',
      );
      expect(guests.map((g) => g.athlete.userId), ['g1', 'legado', 'p1']);
      expect(guests.map((g) => g.fromResult), [false, false, true]);
    });

    test('convidado que também está no placar continua convidado', () {
      final guests = bookingGuestsOf(
        {
          'participants': [
            {'uid': 'g1', 'name': 'Convidado'},
          ],
          'resultPlayers': [
            {'uid': 'g1', 'name': 'Convidado'},
          ],
        },
        ownerUid: 'owner',
      );
      expect(guests, hasLength(1));
      expect(guests.single.fromResult, isFalse);
    });
  });
}
