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

/// Mesmo dublê de `payment_service_cashback_test.dart`, guardando também o
/// nome da callable.
class _FakeFirebaseFunctions implements FirebaseFunctions {
  _FakeFirebaseFunctions({required this.responses});

  final Map<String, Object?> responses;
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
