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

    // Achado do review v2: nem o push original nem o lembrete (mesmo tipo,
    // ver `resendSubstitutionInvite`) tinham mapeamento — o toque não ia a
    // lugar nenhum. O convite de substituição mora na mesma coleção/tela do
    // convite de parceiro (`/torneios-convite/:inviteId`).
    test('tournament_substitution_invite opens the invite page by id', () {
      final route = resolveNotificationRoute({
        'type': 'tournament_substitution_invite',
        'inviteId': 'inv-1',
        'tournamentId': 't1',
        'categoryId': 'masc',
        'inviterUid': 'u1',
      });
      expect(route, '/torneios-convite/inv-1');
    });

    test('tournament_substitution_invite without inviteId resolves nothing',
        () {
      final route = resolveNotificationRoute({
        'type': 'tournament_substitution_invite',
        'tournamentId': 't1',
      });
      expect(route, isNull);
    });

    // O push de convite de dupla (`sendTournamentPartnerInvite` e
    // `sendTournamentTeamInvite`) manda `type` + `inviteId`, sem `url`.
    test('tournament_partner_invite opens the invite page by id', () {
      final route = resolveNotificationRoute({
        'type': 'tournament_partner_invite',
        'inviteId': 'inv-9',
        'tournamentId': 't1',
        'categoryId': 'masc-a',
        'categoryName': 'Masculina A',
        'inviterUid': 'u1',
      });
      expect(route, '/torneios-convite/inv-9');
    });

    test('tournament_partner_invite without inviteId resolves nothing', () {
      final route = resolveNotificationRoute({
        'type': 'tournament_partner_invite',
        'tournamentId': 't1',
      });
      expect(route, isNull);
    });
  });

  group('resolveNotificationTapDestination', () {
    test('com sessão, o convite de dupla abre direto', () {
      final destination = resolveNotificationTapDestination(
        data: const {
          'type': 'tournament_partner_invite',
          'inviteId': 'inv-9',
        },
        hasSession: true,
      );

      expect(destination?.path, '/torneios-convite/inv-9');
      expect(destination?.requiresLogin, isFalse);
    });

    // Sem sessão restaurada o redirect do router engolia o destino: o atleta
    // caía na home depois do login e o convite nunca aparecia.
    test('sem sessão, o convite de dupla fica pendente para depois do login',
        () {
      final destination = resolveNotificationTapDestination(
        data: const {
          'type': 'tournament_partner_invite',
          'inviteId': 'inv-9',
        },
        hasSession: false,
      );

      expect(destination?.path, '/torneios-convite/inv-9');
      expect(destination?.requiresLogin, isTrue);
    });

    test('payload sem rota conhecida não gera destino', () {
      final destination = resolveNotificationTapDestination(
        data: const {'type': 'tipo_desconhecido'},
        hasSession: true,
      );

      expect(destination, isNull);
    });
  });
}
