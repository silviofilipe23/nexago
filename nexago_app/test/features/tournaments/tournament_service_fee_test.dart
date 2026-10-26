import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/arenas/data/payment_service.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_service_fee.dart';

/// Regra padrão da plataforma (8% com piso de R$ 1,50) com cada "Quem paga".
TournamentServiceFeeRule _regra(TournamentServiceFeePayer payer) =>
    TournamentServiceFeeRule(percent: 8, floorReais: 1.5, payer: payer);

const _atleta = TournamentServiceFeePayer.athlete;
const _dividido = TournamentServiceFeePayer.split;
const _organizador = TournamentServiceFeePayer.organizer;

const _pix = <String, Object?>{
  'paymentId': 'pay_1',
  'qrCode': '00020101021226860014br.gov.bcb.pix',
  'qrCodeBase64': '',
  'expiresAt': '2026-10-02T15:00:00.000Z',
  'amountReais': 50.0,
};

const _card = <String, Object?>{
  'paymentId': 'pay_c1',
  'invoiceUrl': 'https://www.asaas.com/i/pay_c1',
  'expiresAt': '2026-10-19T15:00:00.000Z',
  'amountReais': 50.0,
};

void main() {
  // Espelho de `athleteFeeReais` (functions/src/tournament-fees.ts): os mesmos
  // exemplos do servidor têm que bater centavo a centavo.
  group('athleteServiceFeeReais — espelho do servidor', () {
    test('preço 50, 8% com piso 1,50: atleta 4,00, dividido 2,00', () {
      expect(athleteServiceFeeReais(50, _regra(_atleta)), 4.0);
      expect(athleteServiceFeeReais(50, _regra(_dividido)), 2.0);
      expect(athleteServiceFeeCents(50, _regra(_atleta)), 400);
      expect(athleteServiceFeeCents(50, _regra(_dividido)), 200);
    });

    test('organizador pagando: o atleta não paga nada', () {
      expect(athleteServiceFeeReais(50, _regra(_organizador)), 0);
      expect(athleteServiceFeeCents(50, _regra(_organizador)), 0);
      expect(athleteServiceFeeCents(50, TournamentServiceFeeRule.none), 0);
    });

    test('dividido com centavo ímpar: o atleta fica com a metade de baixo', () {
      // 19,37 × 8% = 1,5496 → 1,55; metade de 155 centavos = 77.
      expect(athleteServiceFeeReais(19.37, _regra(_dividido)), 0.77);
    });

    test('o piso vale quando o percentual fica abaixo dele', () {
      expect(athleteServiceFeeReais(10, _regra(_atleta)), 1.5);
      expect(athleteServiceFeeReais(30, _regra(_atleta)), 2.4);
    });

    test('a taxa nunca passa do preço menos um centavo', () {
      expect(tournamentServiceFeeReais(1, _regra(_atleta)), 0.99);
      expect(athleteServiceFeeReais(1, _regra(_atleta)), 0.99);
    });

    test('preço ou percentual zerados: sem taxa', () {
      expect(athleteServiceFeeReais(0, _regra(_atleta)), 0);
      expect(
        athleteServiceFeeReais(
          50,
          const TournamentServiceFeeRule(
            percent: 0,
            floorReais: 1.5,
            payer: _atleta,
          ),
        ),
        0,
      );
    });
  });

  group('TournamentServiceFeeRule.fromMap', () {
    test('lê percentual, piso e quem paga', () {
      final atleta = TournamentServiceFeeRule.fromMap(
        {'percent': 8, 'floorReais': 1.5, 'payer': 'atleta'},
      );
      expect(atleta.percent, 8);
      expect(atleta.floorReais, 1.5);
      expect(atleta.payer, _atleta);
      expect(
        TournamentServiceFeeRule.fromMap(
          {'percent': 10, 'floorReais': 2, 'payer': 'dividido'},
        ).payer,
        _dividido,
      );
    });

    test('organizador, payer desconhecido ou resposta torta: sem taxa', () {
      for (final raw in <Object?>[
        {'percent': 0, 'floorReais': 0, 'payer': 'organizador'},
        {'percent': 8, 'floorReais': 1.5, 'payer': 'organizador'},
        {'percent': 8, 'floorReais': 1.5, 'payer': 'outro'},
        {'percent': 8, 'floorReais': 1.5},
        {'percent': -1, 'floorReais': 1.5, 'payer': 'atleta'},
        {'percent': 8, 'floorReais': -1, 'payer': 'atleta'},
        null,
        'x',
      ]) {
        final rule = TournamentServiceFeeRule.fromMap(raw);
        expect(rule.payer, _organizador, reason: '$raw');
        expect(athleteServiceFeeCents(50, rule), 0, reason: '$raw');
      }
    });
  });

  group('PaymentService.getTournamentServiceFee', () {
    test('chama a callable com o torneio e lê a regra', () async {
      final functions = _FakeFirebaseFunctions(responses: {
        'getTournamentServiceFee': {
          'percent': 8,
          'floorReais': 1.5,
          'payer': 'dividido',
        },
      });
      final service = PaymentService(functions: functions);

      final rule = await service.getTournamentServiceFee(tournamentId: ' t1 ');

      expect(functions.calledNames, ['getTournamentServiceFee']);
      expect(functions.calledPayloads.single, {'tournamentId': 't1'});
      expect(rule.payer, _dividido);
      expect(athleteServiceFeeCents(50, rule), 200);
    });

    test('backend antigo sem a callable (NOT FOUND): sem taxa, sem erro',
        () async {
      final functions = _FakeFirebaseFunctions(
        responses: const {},
        error:
            FirebaseFunctionsException(message: 'NOT FOUND', code: 'not-found'),
      );
      final service = PaymentService(functions: functions);

      final rule = await service.getTournamentServiceFee(tournamentId: 't1');

      expect(rule.payer, _organizador);
      expect(rule.percent, 0);
    });

    test('qualquer outra falha também vale como sem taxa', () async {
      final functions = _FakeFirebaseFunctions(
        responses: const {},
        error: StateError('sem rede'),
      );
      final service = PaymentService(functions: functions);

      final rule = await service.getTournamentServiceFee(tournamentId: 't1');

      expect(rule.payer, _organizador);
    });

    test('torneio vazio não chama o servidor', () async {
      final functions = _FakeFirebaseFunctions(responses: const {});
      final service = PaymentService(functions: functions);

      final rule = await service.getTournamentServiceFee(tournamentId: '  ');

      expect(functions.calledNames, isEmpty);
      expect(rule.payer, _organizador);
    });
  });

  group('serviceFeeReais na resposta da cobrança da inscrição', () {
    test('PIX: lê a taxa; amountReais segue o preço e o QR vale o cobrado',
        () async {
      final functions = _FakeFirebaseFunctions(responses: {
        'createTournamentRegistrationPixPayment': {
          ..._pix,
          'serviceFeeReais': 4.0,
          'chargedReais': 54.0,
        },
      });
      final service = PaymentService(functions: functions);

      final pix = await service.createTournamentRegistrationPixPayment(
        registrationId: 'r1',
      );

      expect(pix.amountToPayNowReais, 50.0);
      expect(pix.serviceFeeReais, 4.0);
      expect(pix.chargedReais, 54.0);
    });

    test('PIX sem o campo (organizador paga ou functions antigas): taxa 0',
        () async {
      final functions = _FakeFirebaseFunctions(responses: {
        'createTournamentRegistrationPixPayment': {
          ..._pix,
          'chargedReais': 50.0,
        },
      });
      final service = PaymentService(functions: functions);

      final pix = await service.createTournamentRegistrationPixPayment(
        registrationId: 'r1',
      );

      expect(pix.serviceFeeReais, 0);
      expect(pix.chargedReais, 50.0);
    });

    test('cartão: lê a taxa junto do desconto e do cashback', () async {
      final functions = _FakeFirebaseFunctions(responses: {
        'createTournamentRegistrationCardPayment': {
          ..._card,
          'serviceFeeReais': 2.0,
          'squadDiscountReais': 4.0,
          'cashbackAppliedReais': 5.0,
          'chargedReais': 43.0,
        },
      });
      final service = PaymentService(functions: functions);

      final card = await service.createTournamentRegistrationCardPayment(
        registrationId: 'r1',
      );

      expect(card.amountReais, 50.0);
      expect(card.serviceFeeReais, 2.0);
      expect(card.squadDiscountReais, 4.0);
      expect(card.cashbackAppliedReais, 5.0);
      expect(card.chargedReais, 43.0);
    });

    test('cartão sem o campo: taxa 0 e o cartão cobra o preço', () async {
      final functions = _FakeFirebaseFunctions(responses: {
        'createTournamentRegistrationCardPayment': _card,
      });
      final service = PaymentService(functions: functions);

      final card = await service.createTournamentRegistrationCardPayment(
        registrationId: 'r1',
      );

      expect(card.serviceFeeReais, 0);
      expect(card.chargedReais, 50.0);
    });

    test('com a taxa e sem chargedReais, o cobrado é preço + taxa', () async {
      final functions = _FakeFirebaseFunctions(responses: {
        'createTournamentRegistrationCardPayment': {
          ..._card,
          'serviceFeeReais': 4.0,
        },
      });
      final service = PaymentService(functions: functions);

      final card = await service.createTournamentRegistrationCardPayment(
        registrationId: 'r1',
      );

      expect(card.chargedReais, 54.0);
    });
  });
}

/// Dublê das Functions (o mesmo de `payment_service_cashback_test.dart`), com
/// a opção de a callable falhar.
class _FakeFirebaseFunctions implements FirebaseFunctions {
  _FakeFirebaseFunctions({required this.responses, this.error});

  final Map<String, Object?> responses;
  final Object? error;
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
      error: error,
    );
  }

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class _FakeHttpsCallable implements HttpsCallable {
  _FakeHttpsCallable({required this.onCall, required this.result, this.error});

  final void Function(dynamic parameters) onCall;
  final Object? result;
  final Object? error;

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
