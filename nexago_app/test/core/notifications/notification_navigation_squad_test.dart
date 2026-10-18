import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/notifications/notification_navigation.dart';
import 'package:nexago_app/core/router/routes.dart';

/// Pushes do NexaSquad: `notifySquad` (squad-applications.ts) manda
/// `type: squad_program` com `kind`/`inviteId`; o repasse aprovado manda
/// `type: squad_payout`. Nenhum dos dois leva `url`.
void main() {
  group('resolveNotificationRoute — NexaSquad', () {
    test('convite (e os lembretes dele) abre a tela do convite', () {
      expect(
        resolveNotificationRoute({
          'type': 'squad_program',
          'kind': 'invite',
          'inviteId': 'inv-9',
        }),
        '/athlete/squad/convite/inv-9',
      );
    });

    test('inviteId com espaços é aparado', () {
      expect(
        resolveNotificationRoute({
          'type': 'squad_program',
          'kind': ' invite ',
          'inviteId': ' inv-9 ',
        }),
        AppRoutes.squadInvite.replaceAll(':inviteId', 'inv-9'),
      );
    });

    test('convite sem inviteId não inventa destino', () {
      expect(
        resolveNotificationRoute({'type': 'squad_program', 'kind': 'invite'}),
        isNull,
      );
      expect(
        resolveNotificationRoute({
          'type': 'squad_program',
          'kind': 'invite',
          'inviteId': '  ',
        }),
        isNull,
      );
    });

    test('aditivo abre o Squad, onde está o aceite', () {
      expect(
        resolveNotificationRoute({
          'type': 'squad_program',
          'kind': 'amendment',
        }),
        AppRoutes.squad,
      );
      expect(AppRoutes.squad, '/athlete/squad');
    });

    test('outros kinds (candidatura recusada etc.) só abrem o app', () {
      for (final kind in ['application_rejected', 'application_received', '']) {
        expect(
          resolveNotificationRoute({'type': 'squad_program', 'kind': kind}),
          isNull,
          reason: kind,
        );
      }
      expect(resolveNotificationRoute({'type': 'squad_program'}), isNull);
    });

    test('repasse aprovado abre os ganhos do Squad', () {
      expect(
        resolveNotificationRoute({
          'type': 'squad_payout',
          'amountCents': '18000',
        }),
        '/athlete/squad/ganhos',
      );
    });

    test('o tipo não diferencia maiúsculas', () {
      expect(
        resolveNotificationRoute({'type': 'SQUAD_PAYOUT'}),
        AppRoutes.squadEarnings,
      );
    });
  });

  group('resolveNotificationTapDestination — NexaSquad', () {
    const invite = {
      'type': 'squad_program',
      'kind': 'invite',
      'inviteId': 'inv-9',
    };

    test('com sessão, o convite abre direto', () {
      final destination = resolveNotificationTapDestination(
        data: invite,
        hasSession: true,
      );

      expect(destination?.path, '/athlete/squad/convite/inv-9');
      expect(destination?.requiresLogin, isFalse);
    });

    test('sem sessão, o convite fica pendente para depois do login', () {
      final destination = resolveNotificationTapDestination(
        data: invite,
        hasSession: false,
      );

      expect(destination?.path, '/athlete/squad/convite/inv-9');
      expect(destination?.requiresLogin, isTrue);
    });

    test('kind sem tela própria não gera destino', () {
      final destination = resolveNotificationTapDestination(
        data: const {'type': 'squad_program', 'kind': 'application_rejected'},
        hasSession: true,
      );

      expect(destination, isNull);
    });
  });
}
