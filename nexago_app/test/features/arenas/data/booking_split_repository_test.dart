import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/errors/friendly_error_message.dart';
import 'package:nexago_app/features/arenas/data/booking_split_repository.dart';

import '../../weather/weather_test_fakes.dart';

// Callable `splitArenaBookingPayment`: o payload que o servidor espera e os
// erros que chegam à tela (CPF faltando vem como frase pronta do servidor).

const _shares = [
  (athleteId: 'me', amountReais: 35.0),
  (athleteId: 'a', amountReais: 35.0),
];

BookingSplitRepository _repo(FakeWeatherFunctions functions) =>
    BookingSplitRepository(firestore: UnusedFirestore(), functions: functions);

void main() {
  test('manda bookingId e as fatias no formato do servidor', () async {
    final functions = FakeWeatherFunctions(responses: {
      'splitArenaBookingPayment': {
        'bookingId': 'b1',
        'shareIds': ['s1', 's2'],
      },
    });

    final ids =
        await _repo(functions).split(bookingId: ' b1 ', shares: _shares);

    expect(ids, ['s1', 's2']);
    expect(functions.payloadOf('splitArenaBookingPayment'), {
      'bookingId': 'b1',
      'shares': [
        {'athleteId': 'me', 'amountReais': 35.0},
        {'athleteId': 'a', 'amountReais': 35.0},
      ],
    });
  });

  test('resposta sem shareIds vira erro legível, não crash', () async {
    final functions = FakeWeatherFunctions(responses: {
      'splitArenaBookingPayment': {'bookingId': 'b1'},
    });

    final call = _repo(functions).split(bookingId: 'b1', shares: _shares);

    await expectLater(call, throwsA(isA<BookingSplitException>()));
  });

  test('reserva sem id nem chama a callable', () async {
    final functions = FakeWeatherFunctions();

    await expectLater(
      _repo(functions).split(bookingId: '  ', shares: _shares),
      throwsA(isA<BookingSplitException>()),
    );
    expect(functions.calls, isEmpty);
  });

  test('mais de 20 fatias nem chama a callable', () async {
    final functions = FakeWeatherFunctions();
    final many = [
      for (var i = 0; i < 21; i++) (athleteId: 'a$i', amountReais: 1.0),
    ];

    await expectLater(
      _repo(functions).split(bookingId: 'b1', shares: many),
      throwsA(isA<BookingSplitException>()),
    );
    expect(functions.calls, isEmpty);
  });

  test('CPF faltando: a frase do servidor chega inteira na tela', () async {
    const cpfMessage = 'Joana ainda não tem CPF cadastrado no NexaGO e por '
        'isso não pode receber a cobrança PIX.';
    final functions = FakeWeatherFunctions(errors: {
      'splitArenaBookingPayment': FirebaseFunctionsException(
        code: 'failed-precondition',
        message: cpfMessage,
      ),
    });

    Object? caught;
    try {
      await _repo(functions).split(bookingId: 'b1', shares: _shares);
    } on Exception catch (e) {
      caught = e;
    }

    final text = friendlyErrorMessage(
      caught!,
      action: 'Não foi possível dividir o pagamento',
    );
    expect(text, 'Não foi possível dividir o pagamento. $cpfMessage');
    expect(text, isNot(contains('firebase_functions')));
  });

  test('erro técnico vira "tente de novo", sem o código', () async {
    final functions = FakeWeatherFunctions(errors: {
      'splitArenaBookingPayment': FirebaseFunctionsException(
        code: 'internal',
        message: 'INTERNAL',
      ),
    });

    Object? caught;
    try {
      await _repo(functions).split(bookingId: 'b1', shares: _shares);
    } on Exception catch (e) {
      caught = e;
    }

    final text = friendlyErrorMessage(
      caught!,
      action: 'Não foi possível dividir o pagamento',
    );
    expect(text,
        'Não foi possível dividir o pagamento. Tente de novo em instantes.');
  });
}
