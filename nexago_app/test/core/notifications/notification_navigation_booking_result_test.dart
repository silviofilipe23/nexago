import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/notifications/notification_navigation.dart';
import 'package:nexago_app/core/router/routes.dart';

/// Pushes do placar do pós-jogo (`booking-result-write.ts`): só `bookingId`,
/// sem `url` — o app de antes da tela cai no fallback de reserva.
void main() {
  group('resolveNotificationRoute — placar do pós-jogo', () {
    for (final type in [
      'booking_result_pending',
      'booking_result_confirmed',
      'booking_result_disputed',
    ]) {
      test('$type abre a conferência do placar', () {
        expect(
          resolveNotificationRoute({'type': type, 'bookingId': ' bk 1 '}),
          '/reservar/resultado/bk%201',
        );
      });
    }

    test('sem bookingId cai no Histórico, não em Minhas reservas', () {
      expect(
        resolveNotificationRoute({'type': 'booking_result_pending'}),
        AppRoutes.athleteMatchHistory,
      );
    });

    test('o convite de reserva segue no destino dele', () {
      expect(
        resolveNotificationRoute({'type': 'booking_invite', 'inviteId': 'i1'}),
        AppRoutes.bookingInvite.replaceAll(':inviteId', 'i1'),
      );
    });
  });
}
