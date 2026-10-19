import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/arenas/data/payment_service.dart';

/// Resposta de `createTournamentRegistrationCardPayment`: o checkout HOSPEDADO
/// do Asaas (`invoiceUrl`) no lugar do QR do PIX.
const _card = <String, Object?>{
  'paymentId': 'pay_c1',
  'invoiceUrl': 'https://www.asaas.com/i/pay_c1',
  'expiresAt': '2026-10-19T15:00:00.000Z',
  'amountReais': 100.0,
};

void main() {
  bookingCardTests();

  group('createTournamentRegistrationCardPayment', () {
    test('chama a callable do cartão com o mesmo payload do PIX', () async {
      final functions = _FakeFirebaseFunctions(responses: {
        'createTournamentRegistrationCardPayment': _card,
      });
      final service = PaymentService(functions: functions);

      await service.createTournamentRegistrationCardPayment(
        registrationId: 'r1',
        cpfCnpj: '529.982.247-25',
        amountType: 'full',
        useCashback: true,
        squadCode: ' joao10 ',
      );

      expect(functions.calledNames, ['createTournamentRegistrationCardPayment']);
      expect(functions.calledPayloads.single, {
        'registrationId': 'r1',
        'amountType': 'full',
        'cpfCnpj': '52998224725',
        'useCashback': true,
        'squadCode': 'JOAO10',
      });
    });

    test('parcela, sem saldo e sem código: payload mínimo', () async {
      final functions = _FakeFirebaseFunctions(responses: {
        'createTournamentRegistrationCardPayment': _card,
      });
      final service = PaymentService(functions: functions);

      await service.createTournamentRegistrationCardPayment(
        registrationId: 'r1',
        squadCode: '  ',
      );

      expect(functions.calledPayloads.single, {'registrationId': 'r1'});
    });

    test('lê o checkout, o prazo e os valores da resposta', () async {
      final functions = _FakeFirebaseFunctions(responses: {
        'createTournamentRegistrationCardPayment': {
          ..._card,
          'cashbackAppliedReais': 5.0,
          'squadDiscountReais': 10.0,
          'chargedReais': 85.0,
        },
      });
      final service = PaymentService(functions: functions);

      final card = await service.createTournamentRegistrationCardPayment(
        registrationId: 'r1',
      );

      expect(card.paymentId, 'pay_c1');
      expect(card.invoiceUrl, 'https://www.asaas.com/i/pay_c1');
      expect(card.expiresAt, DateTime.utc(2026, 10, 19, 15));
      expect(card.amountReais, 100.0);
      expect(card.cashbackAppliedReais, 5.0);
      expect(card.squadDiscountReais, 10.0);
      expect(card.chargedReais, 85.0);
    });

    test('resposta sem chargedReais: o cartão cobra o preço', () async {
      final functions = _FakeFirebaseFunctions(responses: {
        'createTournamentRegistrationCardPayment': _card,
      });
      final service = PaymentService(functions: functions);

      final card = await service.createTournamentRegistrationCardPayment(
        registrationId: 'r1',
      );

      expect(card.chargedReais, 100.0);
      expect(card.cashbackAppliedReais, 0);
      expect(card.squadDiscountReais, 0);
    });

    test('sem link do checkout não há o que abrir', () async {
      final functions = _FakeFirebaseFunctions(responses: {
        'createTournamentRegistrationCardPayment': {..._card, 'invoiceUrl': ''},
      });
      final service = PaymentService(functions: functions);

      expect(
        () => service.createTournamentRegistrationCardPayment(
          registrationId: 'r1',
        ),
        throwsA(isA<PaymentException>()),
      );
    });

    test('inscrição vazia não chama o servidor', () async {
      final functions = _FakeFirebaseFunctions(responses: const {});
      final service = PaymentService(functions: functions);

      expect(
        () => service.createTournamentRegistrationCardPayment(
          registrationId: '',
        ),
        throwsA(isA<PaymentException>()),
      );
      expect(functions.calledNames, isEmpty);
    });
  });
}

void bookingCardTests() {
  group('createArenaBookingCardPayment', () {
    const bookingCard = <String, Object?>{
      'paymentId': 'pay_b1',
      'invoiceUrl': 'https://www.asaas.com/i/pay_b1',
      'expiresAt': '2026-10-19T20:15:00.000Z',
      'amountToPayNowReais': 60.0,
    };

    test('chama a callable da reserva com o sinal, o CPF e o código', () async {
      final functions = _FakeFirebaseFunctions(responses: {
        'createArenaBookingCardPayment': bookingCard,
      });
      final service = PaymentService(functions: functions);

      final card = await service.createArenaBookingCardPayment(
        bookingId: 'b1',
        cpfCnpj: '529.982.247-25',
        paymentFraction: 0.5,
        useCashback: true,
        squadCode: 'joao10',
      );

      expect(functions.calledNames, ['createArenaBookingCardPayment']);
      expect(functions.calledPayloads.single, {
        'bookingId': 'b1',
        'cpfCnpj': '52998224725',
        'paymentFraction': 0.5,
        'useCashback': true,
        'squadCode': 'JOAO10',
      });
      expect(card.invoiceUrl, 'https://www.asaas.com/i/pay_b1');
      expect(card.amountReais, 60.0);
      expect(card.chargedReais, 60.0);
      expect(card.expiresAt, DateTime.utc(2026, 10, 19, 20, 15));
    });

    test('soltar a reserva do cartão repassa a recusa (cartão aprovado)', () async {
      final functions = _FakeFirebaseFunctions(
        responses: const {},
        errors: {
          'cancelPendingArenaBookingPayment': FirebaseFunctionsException(
            code: 'failed-precondition',
            message: 'Seu pagamento com cartão já foi aprovado — a reserva está confirmada.',
          ),
        },
      );
      final service = PaymentService(functions: functions);

      await expectLater(
        service.releasePendingArenaBookingCardPayment(bookingId: 'b1'),
        throwsA(
          isA<PaymentException>().having((e) => e.message, 'message', contains('já foi aprovado')),
        ),
      );
    });

    test('reserva vazia não chama o servidor', () async {
      final functions = _FakeFirebaseFunctions(responses: const {});
      final service = PaymentService(functions: functions);

      expect(
        () => service.createArenaBookingCardPayment(bookingId: ''),
        throwsA(isA<PaymentException>()),
      );
      expect(functions.calledNames, isEmpty);
    });
  });
}

/// Mesmo dublê de `payment_service_cashback_test.dart`, guardando também o
/// nome da callable.
class _FakeFirebaseFunctions implements FirebaseFunctions {
  _FakeFirebaseFunctions({required this.responses, this.errors = const {}});

  final Map<String, Object?> responses;
  final Map<String, FirebaseFunctionsException> errors;
  final List<String> calledNames = [];
  final List<Map<String, dynamic>?> calledPayloads = [];

  @override
  HttpsCallable httpsCallable(String name, {HttpsCallableOptions? options}) {
    return _FakeHttpsCallable(
      onCall: (parameters) {
        calledNames.add(name);
        calledPayloads.add(
          parameters is Map ? Map<String, dynamic>.from(parameters) : null,
        );
      },
      result: responses[name],
      error: errors[name],
    );
  }

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class _FakeHttpsCallable implements HttpsCallable {
  _FakeHttpsCallable({required this.onCall, required this.result, this.error});

  final void Function(dynamic parameters) onCall;
  final Object? result;
  final FirebaseFunctionsException? error;

  @override
  Future<HttpsCallableResult<T>> call<T>([dynamic parameters]) async {
    onCall(parameters);
    final e = error;
    if (e != null) throw e;
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
