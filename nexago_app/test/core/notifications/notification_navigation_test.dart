import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/notifications/notification_navigation.dart';

void main() {
  group('resolveNotificationRoute', () {
    test('tournament_partner_invite_accepted prefers url field', () {
      final route = resolveNotificationRoute({
        'type': 'tournament_partner_invite_accepted',
        'url':
            '/torneios/t1/inscricao?registrationId=r1&categoryId=c1&inviteId=i1&step=payment',
      });
      expect(route, contains('/torneios/t1/inscricao'));
      expect(route, contains('step=payment'));
    });

    test('tournament_partner_invite_accepted builds route from ids', () {
      final route = resolveNotificationRoute({
        'type': 'tournament_partner_invite_accepted',
        'tournamentId': 't1',
        'registrationId': 'r1',
        'categoryId': 'catA',
        'inviteId': 'inv1',
      });
      expect(route, '/torneios/t1/inscricao?registrationId=r1&step=payment&categoryId=catA&inviteId=inv1');
    });

    test('tournament_bracket_published opens bracket url from payload', () {
      final route = resolveNotificationRoute({
        'type': 'tournament_bracket_published',
        'tournamentId': 't1',
        'categoryId': 'Masc A',
        'url': '/torneios/t1/chave?categoryId=Masc%20A',
      });
      expect(route, '/torneios/t1/chave?categoryId=Masc%20A');
    });

    test('tournament_cancelled falls back to tournament detail', () {
      final route = resolveNotificationRoute({
        'type': 'tournament_cancelled',
        'tournamentId': 't1',
      });
      expect(route, '/torneios/t1');
    });
  });
}
