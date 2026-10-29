import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/weather/domain/weather_models.dart';
import 'package:nexago_app/features/weather/infrastructure/weather_service.dart';

import '../weather_test_fakes.dart';

void main() {
  WeatherService serviceWith(FakeWeatherFunctions f) =>
      WeatherService(UnusedFirestore(), functions: f);

  group('chooseArenaWeatherOption', () {
    test('crédito: payload e resposta', () async {
      final f = FakeWeatherFunctions(responses: {
        'chooseArenaWeatherOption': {
          'creditId': 'wx_b1',
          'creditReais': 60,
          'expiresAt': '2027-01-27T15:00:00.000Z',
        },
      });
      final r = await serviceWith(f).chooseOption(
        bookingId: ' b1 ',
        choice: WeatherChoice.credit,
      );
      expect(f.payloadOf('chooseArenaWeatherOption'), {
        'bookingId': 'b1',
        'choice': 'credit',
      });
      expect(r.creditId, 'wx_b1');
      expect(r.creditReais, 60);
      expect(r.expiresAt, DateTime.utc(2027, 1, 27, 15).toLocal());
    });

    test('manter: só a escolha', () async {
      final f = FakeWeatherFunctions(responses: {
        'chooseArenaWeatherOption': {'kept': true},
      });
      final r = await serviceWith(f)
          .chooseOption(bookingId: 'b1', choice: WeatherChoice.keep);
      expect(f.payloadOf('chooseArenaWeatherOption')!['choice'], 'keep');
      expect(r.choice, WeatherChoice.keep);
    });

    test('remarcar: manda o horário novo e lê o acerto', () async {
      final f = FakeWeatherFunctions(responses: {
        'chooseArenaWeatherOption': {
          'newBookingId': 'b2',
          'newAmountReais': 70,
          'coveredByCreditReais': 60,
          'dueOnsiteReais': 10,
          'leftoverCreditReais': 0,
          'creditId': null,
        },
      });
      final r = await serviceWith(f).chooseOption(
        bookingId: 'b1',
        choice: WeatherChoice.reschedule,
        reschedule: const WeatherReschedulePick(
          courtId: 'q1',
          courtName: 'Quadra 1',
          dateKey: '2026-11-01',
          startTime: '19:00',
          endTime: '20:00',
          selectedSlotStartTimes: ['19:00'],
        ),
      );
      expect(f.payloadOf('chooseArenaWeatherOption'), {
        'bookingId': 'b1',
        'choice': 'reschedule',
        'reschedule': {
          'courtId': 'q1',
          'courtName': 'Quadra 1',
          'date': '2026-11-01',
          'startTime': '19:00',
          'endTime': '20:00',
          'selectedSlotStartTimes': ['19:00'],
        },
      });
      expect(r.newBookingId, 'b2');
      expect(r.newAmountReais, 70);
      expect(r.coveredByCreditReais, 60);
      expect(r.dueOnsiteReais, 10);
      expect(r.leftoverCreditReais, 0);
      expect(r.creditId, isNull);
    });

    test('remarcar sem horário: erro antes de chamar', () async {
      final f = FakeWeatherFunctions();
      await expectLater(
        serviceWith(f)
            .chooseOption(bookingId: 'b1', choice: WeatherChoice.reschedule),
        throwsA(isA<WeatherException>()),
      );
      expect(f.calls, isEmpty);
    });

    test('already-exists = horário tomado', () async {
      final f = FakeWeatherFunctions(errors: {
        'chooseArenaWeatherOption': FirebaseFunctionsException(
          code: 'already-exists',
          message: 'Esse horário acabou de ser reservado. Escolha outro.',
        ),
      });
      await expectLater(
        serviceWith(f).chooseOption(
          bookingId: 'b1',
          choice: WeatherChoice.reschedule,
          reschedule: const WeatherReschedulePick(
            courtId: 'q1',
            courtName: null,
            dateKey: '2026-11-01',
            startTime: '19:00',
            endTime: '20:00',
          ),
        ),
        throwsA(
          isA<WeatherException>()
              .having((e) => e.isSlotTaken, 'isSlotTaken', isTrue)
              .having((e) => e.message, 'message', contains('Escolha outro')),
        ),
      );
    });
  });

  group('requestArenaWeatherRelease / withdraw', () {
    test('pedido com observação: pendente', () async {
      final f = FakeWeatherFunctions(responses: {
        'requestArenaWeatherRelease': {
          'status': 'pending',
          'weather': {'probability': 80, 'precipitationMm': 1.5},
        },
      });
      final r = await serviceWith(f)
          .requestRelease(bookingId: 'b1', note: ' quadra alagada ');
      expect(f.payloadOf('requestArenaWeatherRelease'), {
        'bookingId': 'b1',
        'note': 'quadra alagada',
      });
      expect(r.status, WeatherRequestStatus.pending);
      expect(r.weather!.probability, 80);
    });

    test('sem observação: payload sem a chave; aprovado na hora', () async {
      final f = FakeWeatherFunctions(responses: {
        'requestArenaWeatherRelease': {'status': 'approved', 'weather': null},
      });
      final r =
          await serviceWith(f).requestRelease(bookingId: 'b1', note: '  ');
      expect(f.payloadOf('requestArenaWeatherRelease')!.containsKey('note'),
          isFalse);
      expect(r.status, WeatherRequestStatus.approved);
    });

    test('desistir', () async {
      final f = FakeWeatherFunctions(responses: {
        'withdrawArenaWeatherRequest': {'status': 'withdrawn'},
      });
      await serviceWith(f).withdrawRequest(bookingId: 'b1');
      expect(f.calls.single.name, 'withdrawArenaWeatherRequest');
      expect(f.payloadOf('withdrawArenaWeatherRequest'), {'bookingId': 'b1'});
    });
  });

  group('mapWeatherFunctionsError', () {
    test('NOT FOUND cru do SDK = callable ainda não publicada', () {
      for (final raw in ['NOT FOUND', 'NOT_FOUND', null]) {
        final e = mapWeatherFunctionsError('not-found', raw);
        expect(e.isUnavailable, isTrue, reason: '$raw');
        expect(e.message, WeatherService.unavailableMessage);
      }
    });

    test('not-found com mensagem do servidor: repassa a mensagem', () {
      final e =
          mapWeatherFunctionsError('not-found', 'Reserva não encontrada.');
      expect(e.isUnavailable, isFalse);
      expect(e.message, 'Reserva não encontrada.');
    });

    test('regra de negócio em português passa direto; código cru vira copy',
        () {
      expect(
        mapWeatherFunctionsError(
                'failed-precondition', 'O prazo para escolher acabou.')
            .message,
        'O prazo para escolher acabou.',
      );
      expect(
        mapWeatherFunctionsError('failed-precondition', 'FAILED PRECONDITION')
            .message,
        'Não dá para fazer isso nesta reserva agora.',
      );
      expect(
        mapWeatherFunctionsError('unauthenticated', 'UNAUTHENTICATED').message,
        'Faça login para continuar.',
      );
    });

    test('erro da callable chega como WeatherException', () async {
      final f = FakeWeatherFunctions(errors: {
        'withdrawArenaWeatherRequest': FirebaseFunctionsException(
          code: 'not-found',
          message: 'NOT FOUND',
        ),
      });
      await expectLater(
        WeatherService(UnusedFirestore(), functions: f)
            .withdrawRequest(bookingId: 'b1'),
        throwsA(isA<WeatherException>()
            .having((e) => e.isUnavailable, 'unavailable', isTrue)),
      );
    });
  });
}
