import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/arenas/data/booking_service.dart';
import 'package:nexago_app/features/arenas/domain/arena_booking_confirm_args.dart';

import '../../weather/weather_test_fakes.dart';

/// Crédito de chuva no checkout (A5): campos opcionais no payload e na
/// resposta — sem eles tudo segue como antes.
void main() {
  final args = ArenaBookingConfirmArgs(
    arenaId: 'a1',
    arenaName: 'Arena CFC',
    courtId: 'q2',
    courtName: 'Quadra 2',
    date: DateTime(2026, 11, 8),
    startTime: '19:00',
    endTime: '20:00',
    amountReais: 70,
    selectedSlotStartTimes: const ['19:00'],
  );

  group('quoteArenaBooking', () {
    test('com useWeatherCredit: manda a chave e a forma de pagamento',
        () async {
      final f = FakeWeatherFunctions(responses: {
        'quoteArenaBooking': {
          'amountReais': 70.0,
          'lineItems': <dynamic>[],
          'weatherCreditAvailableReais': 60.0,
          'weatherCreditNextExpiresAt': '2027-01-27T15:00:00.000Z',
          'weatherCreditAppliedReais': 60.0,
          'amountAfterCreditReais': 10.0,
        },
      });
      final quote =
          await BookingService(UnusedFirestore(), functions: f).quoteBooking(
        args: args,
        useWeatherCredit: true,
        paymentMode: 'pix',
      );
      final payload = f.payloadOf('quoteArenaBooking')!;
      expect(payload['useWeatherCredit'], isTrue);
      expect(payload['paymentMode'], 'pix');
      expect(payload['paymentFraction'], 1.0);
      expect(quote.hasWeatherCredit, isTrue);
      expect(quote.weatherCreditAvailableReais, 60);
      expect(quote.weatherCreditNextExpiresAt,
          DateTime.utc(2027, 1, 27, 15).toLocal());
      expect(quote.weatherCreditAppliedReais, 60);
      expect(quote.amountDueAfterWeatherCreditReais, 10);
    });

    test('sem useWeatherCredit: payload igual ao de antes', () async {
      final f = FakeWeatherFunctions(responses: {
        'quoteArenaBooking': {'amountReais': 70.0, 'lineItems': <dynamic>[]},
      });
      final quote = await BookingService(UnusedFirestore(), functions: f)
          .quoteBooking(args: args);
      final payload = f.payloadOf('quoteArenaBooking')!;
      expect(payload.containsKey('useWeatherCredit'), isFalse);
      expect(payload.containsKey('paymentMode'), isFalse);
      // Servidor antigo: sem os campos, sem crédito.
      expect(quote.hasWeatherCredit, isFalse);
      expect(quote.weatherCreditAppliedReais, 0);
      expect(quote.amountDueAfterWeatherCreditReais, 70);
    });
  });

  group('createArenaBooking', () {
    test('crédito cobriu tudo: weather_credit, sem Pix, e avisa o gestor',
        () async {
      final f = FakeWeatherFunctions(responses: {
        'createArenaBooking': {
          'bookingId': 'b9',
          'amountReais': 50.0,
          'amountToPayNowReais': 0.0,
          'amountDueOnsiteReais': 0.0,
          'paymentMode': 'weather_credit',
          'weatherCreditAppliedReais': 50.0,
        },
        'notifyArenaBookingCreated': {'ok': true},
      });
      final result = await BookingService(UnusedFirestore(), functions: f)
          .createBookingAtomically(
        args: args,
        athleteId: 'u1',
        paymentMode: 'pix',
        useWeatherCredit: true,
      );
      expect(f.payloadOf('createArenaBooking')!['useWeatherCredit'], isTrue);
      expect(result.isCoveredByWeatherCredit, isTrue);
      expect(result.isPix, isFalse);
      expect(result.weatherCreditAppliedReais, 50);
      expect(f.calls.map((c) => c.name), contains('notifyArenaBookingCreated'));
    });

    test('crédito parcial no Pix: segue o Pix, sem aviso extra', () async {
      final f = FakeWeatherFunctions(responses: {
        'createArenaBooking': {
          'bookingId': 'b9',
          'amountReais': 70.0,
          'amountToPayNowReais': 10.0,
          'amountDueOnsiteReais': 0.0,
          'paymentMode': 'pix',
          'weatherCreditAppliedReais': 60.0,
        },
      });
      final result = await BookingService(UnusedFirestore(), functions: f)
          .createBookingAtomically(
        args: args,
        athleteId: 'u1',
        paymentMode: 'pix',
        useWeatherCredit: true,
      );
      expect(result.isPix, isTrue);
      expect(result.isCoveredByWeatherCredit, isFalse);
      expect(result.amountToPayNowReais, 10);
      expect(f.calls.map((c) => c.name),
          isNot(contains('notifyArenaBookingCreated')));
    });

    test('sem crédito: payload sem a chave', () async {
      final f = FakeWeatherFunctions(responses: {
        'createArenaBooking': {'bookingId': 'b1', 'amountReais': 70.0},
      });
      final result = await BookingService(UnusedFirestore(), functions: f)
          .createBookingAtomically(args: args, athleteId: 'u1');
      expect(f.payloadOf('createArenaBooking')!.containsKey('useWeatherCredit'),
          isFalse);
      expect(result.weatherCreditAppliedReais, 0);
      expect(result.isCoveredByWeatherCredit, isFalse);
    });
  });
}
