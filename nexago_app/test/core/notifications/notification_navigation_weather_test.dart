import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/notifications/notification_navigation.dart';
import 'package:nexago_app/core/router/routes.dart';

/// Pushes do cancelamento por chuva: o `url` é `/my-bookings` (existe nos
/// apps da loja); este build reconhece o tipo + `bookingId` ANTES do `url`.
void main() {
  group('resolveNotificationRoute — chuva', () {
    for (final type in [
      'arena_weather_release',
      'arena_weather_credit',
      'arena_weather_request_decided',
    ]) {
      test('$type com bookingId abre a escolha da reserva', () {
        expect(
          resolveNotificationRoute({
            'type': type,
            'bookingId': ' bk 1 ',
            'url': '/my-bookings',
            'arenaId': 'a1',
          }),
          '/booking/bk%201/rain',
        );
      });
    }

    test('liberação sem bookingId cai em Minhas reservas', () {
      expect(
        resolveNotificationRoute(
            {'type': 'arena_weather_release', 'url': '/my-bookings'}),
        AppRoutes.myBookings,
      );
    });

    test('crédito sem bookingId abre os créditos', () {
      expect(
        resolveNotificationRoute({'type': 'arena_weather_credit'}),
        AppRoutes.athleteWeatherCredits,
      );
    });

    test('crédito vencendo abre os créditos (mesmo com url antiga)', () {
      expect(
        resolveNotificationRoute({
          'type': 'arena_weather_credit_expiring',
          'url': '/my-bookings',
          'bookingId': 'b1',
        }),
        '/weather-credits',
      );
    });

    test('cancelada por chuva abre Minhas reservas', () {
      expect(
        resolveNotificationRoute({
          'type': 'arena_weather_canceled',
          'bookingId': 'b1',
          'arenaId': 'a1',
        }),
        '/my-bookings',
      );
    });

    test('tipo de chuva desconhecido segue o url; sem url, Minhas reservas',
        () {
      expect(
        resolveNotificationRoute(
            {'type': 'arena_weather_outro', 'url': '/cashback'}),
        AppRoutes.athleteCashback,
      );
      expect(
        resolveNotificationRoute(
            {'type': 'arena_weather_outro', 'arenaId': 'a1'}),
        AppRoutes.myBookings,
      );
    });

    test('o ramo genérico de arena não engole o push de chuva', () {
      // Sem o caso próprio, `arenaId` + tipo com "arena" abria a agenda do gestor.
      expect(
        resolveNotificationRoute(
            {'type': 'arena_weather_release', 'arenaId': 'a1'}),
        isNot(AppRoutes.arenaSchedule),
      );
    });
  });
}
