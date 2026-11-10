import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/notifications/notification_navigation.dart';
import 'package:nexago_app/core/router/routes.dart';

/// Payload real do push "Como foi o jogo?" (`functions/src/arena-review-request.ts`).
void main() {
  const payload = {
    'type': 'arena_review_request',
    'bookingId': 'b1',
    'arenaId': 'a1',
    'url': '/my-bookings',
    'webUrl': '/agenda/reserva/b1',
  };

  test('abre o detalhe da reserva, não Minhas reservas', () {
    expect(resolveNotificationRoute(payload), '/booking/b1/details');
  });

  test('sem bookingId cai em Minhas reservas', () {
    expect(
      resolveNotificationRoute(
          {'type': 'arena_review_request', 'url': '/my-bookings'}),
      AppRoutes.myBookings,
    );
  });

  test('a rota existe no app com o mesmo formato', () {
    expect(AppRoutes.bookingDetailsById, '/booking/:bookingId/details');
  });
}
