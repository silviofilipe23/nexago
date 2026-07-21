import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/arenas/data/booking_service.dart';
import 'package:nexago_app/features/arenas/domain/arena_booking_confirm_args.dart';

void main() {
  final args = ArenaBookingConfirmArgs(
    arenaId: 'arena1',
    arenaName: 'Arena Beach',
    courtId: 'court1',
    courtName: 'Quadra 1',
    date: DateTime(2026, 8, 10),
    startTime: '19:00',
    endTime: '20:00',
    amountReais: 100,
    selectedSlotStartTimes: const ['19:00'],
  );

  group('BookingService.quoteBooking — cupom', () {
    test('inclui couponCode no payload quando informado', () async {
      final functions = _FakeFirebaseFunctions(responses: {
        'quoteArenaBooking': {'amountReais': 85.0, 'lineItems': <dynamic>[]},
      });
      final service = BookingService(_UnusedFirestore(), functions: functions);

      await service.quoteBooking(args: args, couponCode: 'VERAO10');

      expect(functions.calledPayloads.single?['couponCode'], 'VERAO10');
    });

    test('omite couponCode do payload quando não informado', () async {
      final functions = _FakeFirebaseFunctions(responses: {
        'quoteArenaBooking': {'amountReais': 100.0, 'lineItems': <dynamic>[]},
      });
      final service = BookingService(_UnusedFirestore(), functions: functions);

      await service.quoteBooking(args: args);

      expect(functions.calledPayloads.single?.containsKey('couponCode'), isFalse);
    });

    test('parseia couponApplied/couponId/couponDiscountReais da resposta', () async {
      final functions = _FakeFirebaseFunctions(responses: {
        'quoteArenaBooking': {
          'amountReais': 85.0,
          'lineItems': <dynamic>[],
          'couponApplied': true,
          'couponId': 'c1',
          'couponDiscountReais': 15.0,
        },
      });
      final service = BookingService(_UnusedFirestore(), functions: functions);

      final quote = await service.quoteBooking(args: args, couponCode: 'VERAO10');

      expect(quote.couponApplied, isTrue);
      expect(quote.couponId, 'c1');
      expect(quote.couponDiscountReais, 15.0);
    });

    test('cupom pior que promoção: couponApplied false e desconto zero', () async {
      final functions = _FakeFirebaseFunctions(responses: {
        'quoteArenaBooking': {
          'amountReais': 100.0,
          'lineItems': <dynamic>[],
          'couponApplied': false,
          'couponId': null,
          'couponDiscountReais': 0.0,
        },
      });
      final service = BookingService(_UnusedFirestore(), functions: functions);

      final quote = await service.quoteBooking(args: args, couponCode: 'PIOR5');

      expect(quote.couponApplied, isFalse);
      expect(quote.couponDiscountReais, 0);
    });
  });

  group('BookingService.createBookingAtomically — cupom', () {
    test('inclui couponCode no payload e parseia campos de cupom da resposta', () async {
      final functions = _FakeFirebaseFunctions(responses: {
        'createArenaBooking': {
          'bookingId': 'b1',
          'amountReais': 85.0,
          'amountToPayNowReais': 85.0,
          'amountDueOnsiteReais': 0.0,
          'paymentMode': 'onsite',
          'paymentFraction': 1.0,
          'couponApplied': true,
          'couponId': 'c1',
          'couponDiscountReais': 15.0,
        },
      });
      final service = BookingService(_UnusedFirestore(), functions: functions);

      final result = await service.createBookingAtomically(
        args: args,
        athleteId: 'u1',
        couponCode: 'VERAO10',
      );

      // paymentMode default é 'onsite': createBookingAtomically também chama
      // notifyArenaBookingCreated depois (comportamento pré-existente, alheio
      // a cupom); a chamada a createArenaBooking é sempre a primeira.
      expect(functions.calledPayloads.first?['couponCode'], 'VERAO10');
      expect(result.couponApplied, isTrue);
      expect(result.couponId, 'c1');
      expect(result.couponDiscountReais, 15.0);
    });

    test('sem cupom: payload sem couponCode e resultado com couponApplied false', () async {
      final functions = _FakeFirebaseFunctions(responses: {
        'createArenaBooking': {'bookingId': 'b1', 'amountReais': 100.0},
      });
      final service = BookingService(_UnusedFirestore(), functions: functions);

      final result = await service.createBookingAtomically(args: args, athleteId: 'u1');

      // Idem: primeira chamada registrada é sempre createArenaBooking.
      expect(functions.calledPayloads.first?.containsKey('couponCode'), isFalse);
      expect(result.couponApplied, isFalse);
      expect(result.couponId, isNull);
      expect(result.couponDiscountReais, 0);
    });
  });
}

/// Fake mínimo de [FirebaseFunctions]: registra o payload de toda callable
/// disparada e devolve a resposta configurada em [responses], sem rede real.
/// Mesmo padrão de `test/features/athlete/athlete_profile_repository_test.dart`.
class _FakeFirebaseFunctions implements FirebaseFunctions {
  _FakeFirebaseFunctions({required this.responses});

  final Map<String, Object?> responses;
  final List<Map<String, dynamic>?> calledPayloads = [];

  @override
  HttpsCallable httpsCallable(String name, {HttpsCallableOptions? options}) {
    return _FakeHttpsCallable(
      onCall: (parameters) {
        calledPayloads.add(
          parameters is Map ? Map<String, dynamic>.from(parameters) : null,
        );
      },
      result: responses[name],
    );
  }

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class _FakeHttpsCallable implements HttpsCallable {
  _FakeHttpsCallable({required this.onCall, required this.result});

  final void Function(dynamic parameters) onCall;
  final Object? result;

  @override
  Future<HttpsCallableResult<T>> call<T>([dynamic parameters]) async {
    onCall(parameters);
    return _FakeHttpsCallableResult<T>(result);
  }

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class _FakeHttpsCallableResult<T> implements HttpsCallableResult<T> {
  _FakeHttpsCallableResult(this._data);

  final Object? _data;

  @override
  T get data => _data as T;

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

/// `BookingService` exige um `FirebaseFirestore`, mas `quoteBooking`/
/// `createBookingAtomically` não o tocam — nunca deve ser chamado aqui.
class _UnusedFirestore implements FirebaseFirestore {
  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}
