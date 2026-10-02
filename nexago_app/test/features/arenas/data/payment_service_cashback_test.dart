import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/arenas/data/payment_service.dart';

/// Resposta comum das callables de PIX; cada teste soma o preço e, se for o
/// caso, os campos de cashback.
const _pix = <String, Object?>{
  'paymentId': 'pay_1',
  'qrCode': '00020101021226860014br.gov.bcb.pix',
  'qrCodeBase64': '',
  'expiresAt': '2026-10-02T15:00:00.000Z',
};

void main() {
  group('createArenaBookingPixPayment — cashback', () {
    test('manda useCashback só quando o atleta ligou o toggle', () async {
      final functions = _FakeFirebaseFunctions(responses: {
        'createArenaBookingPixPayment': {..._pix, 'amountToPayNowReais': 20.0},
      });
      final service = PaymentService(functions: functions);

      await service.createArenaBookingPixPayment(
        bookingId: 'b1',
        useCashback: true,
      );
      await service.createArenaBookingPixPayment(bookingId: 'b1');

      expect(functions.calledPayloads[0]?['useCashback'], isTrue);
      expect(
        functions.calledPayloads[1]?.containsKey('useCashback'),
        isFalse,
      );
    });

    test('lê o aplicado e o cobrado; amountToPayNowReais segue sendo o preço',
        () async {
      final functions = _FakeFirebaseFunctions(responses: {
        'createArenaBookingPixPayment': {
          ..._pix,
          'amountToPayNowReais': 20.0,
          'cashbackAppliedReais': 15.0,
          'chargedReais': 5.0,
        },
      });
      final service = PaymentService(functions: functions);

      final pix = await service.createArenaBookingPixPayment(
        bookingId: 'b1',
        useCashback: true,
      );

      expect(pix.amountToPayNowReais, 20.0);
      expect(pix.cashbackAppliedReais, 15.0);
      expect(pix.chargedReais, 5.0);
    });

    test('functions antigas (sem chargedReais): o PIX vale o preço', () async {
      final functions = _FakeFirebaseFunctions(responses: {
        'createArenaBookingPixPayment': {..._pix, 'amountToPayNowReais': 20.0},
      });
      final service = PaymentService(functions: functions);

      final pix = await service.createArenaBookingPixPayment(
        bookingId: 'b1',
        useCashback: true,
      );

      expect(pix.cashbackAppliedReais, 0);
      expect(pix.chargedReais, 20.0);
    });
  });

  group('createTournamentRegistrationPixPayment — cashback', () {
    test('manda useCashback e lê o cobrado; amountReais segue sendo o preço',
        () async {
      final functions = _FakeFirebaseFunctions(responses: {
        'createTournamentRegistrationPixPayment': {
          ..._pix,
          'amountReais': 100.0,
          'cashbackAppliedReais': 10.0,
          'chargedReais': 90.0,
        },
      });
      final service = PaymentService(functions: functions);

      final pix = await service.createTournamentRegistrationPixPayment(
        registrationId: 'r1',
        useCashback: true,
      );

      expect(functions.calledPayloads.single?['useCashback'], isTrue);
      expect(pix.amountToPayNowReais, 100.0);
      expect(pix.cashbackAppliedReais, 10.0);
      expect(pix.chargedReais, 90.0);
    });

    test('toggle desligado e functions antigas: payload e valor de antes',
        () async {
      final functions = _FakeFirebaseFunctions(responses: {
        'createTournamentRegistrationPixPayment': {..._pix, 'amountReais': 100.0},
      });
      final service = PaymentService(functions: functions);

      final pix = await service.createTournamentRegistrationPixPayment(
        registrationId: 'r1',
      );

      expect(
        functions.calledPayloads.single?.containsKey('useCashback'),
        isFalse,
      );
      expect(pix.chargedReais, 100.0);
    });
  });
}

/// Mesmo dublê de `booking_service_coupon_test.dart`: registra o payload de
/// cada chamada e devolve a resposta encenada por nome de callable.
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
