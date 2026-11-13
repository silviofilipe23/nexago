import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/arena/data/manual_booking_service.dart';

/// "Criar reserva" no detalhe do horário: o app chama as mesmas callables do
/// modal de reserva de balcão do portal (`quoteArenaManualBooking` e
/// `createArenaManualBooking`). Antes o botão era só um "em breve".
void main() {
  group('ArenaManualBookingService.create', () {
    test('manda o payload que a callable valida e devolve o bookingId',
        () async {
      final functions = _FakeFirebaseFunctions(result: {'bookingId': 'bk1'});
      final service = ArenaManualBookingService(functions: functions);

      final id = await service.create(
        arenaId: 'a1',
        courtId: 'c1',
        dateKey: '2026-11-14',
        startTime: '19:00',
        endTime: '20:00',
        customerName: '  João  ',
        amountReais: 120,
        note: '   ',
      );

      final (name, payload) = functions.calls.single;
      expect(name, 'createArenaManualBooking');
      expect(payload, {
        'arenaId': 'a1',
        'courtId': 'c1',
        'date': '2026-11-14',
        'startTime': '19:00',
        'endTime': '20:00',
        'customerName': 'João',
        'amountReais': 120.0,
      });
      expect(id, 'bk1');
    });

    test('nota preenchida vai no payload', () async {
      final functions = _FakeFirebaseFunctions(result: {'bookingId': 'bk1'});
      final service = ArenaManualBookingService(functions: functions);

      await service.create(
        arenaId: 'a1',
        courtId: 'c1',
        dateKey: '2026-11-14',
        startTime: '19:00',
        endTime: '20:00',
        customerName: 'João',
        amountReais: 0,
        note: 'paga no balcão',
      );

      expect(functions.calls.single.$2['note'], 'paga no balcão');
    });

    test('resposta sem bookingId é erro', () async {
      final service = ArenaManualBookingService(
        functions: _FakeFirebaseFunctions(result: {}),
      );

      await expectLater(
        service.create(
          arenaId: 'a1',
          courtId: 'c1',
          dateKey: '2026-11-14',
          startTime: '19:00',
          endTime: '20:00',
          customerName: 'João',
          amountReais: 0,
        ),
        throwsA(isA<StateError>()),
      );
    });

    test('recusa do servidor sobe como veio (vira texto na tela)', () async {
      final service = ArenaManualBookingService(
        functions: _FakeFirebaseFunctions(
          error: FirebaseFunctionsException(
            code: 'failed-precondition',
            message: 'Esse horário está bloqueado; desbloqueie antes de reservar.',
          ),
        ),
      );

      await expectLater(
        service.create(
          arenaId: 'a1',
          courtId: 'c1',
          dateKey: '2026-11-14',
          startTime: '19:00',
          endTime: '20:00',
          customerName: 'João',
          amountReais: 0,
        ),
        throwsA(isA<FirebaseFunctionsException>()),
      );
    });
  });

  group('ArenaManualBookingService.quote', () {
    test('devolve o preço sugerido da quadra', () async {
      final functions = _FakeFirebaseFunctions(result: {'amountReais': 90});
      final service = ArenaManualBookingService(functions: functions);

      final amount = await service.quote(
        arenaId: 'a1',
        courtId: 'c1',
        dateKey: '2026-11-14',
        startTime: '19:00',
        endTime: '20:00',
      );

      final (name, payload) = functions.calls.single;
      expect(name, 'quoteArenaManualBooking');
      expect(payload, {
        'arenaId': 'a1',
        'courtId': 'c1',
        'date': '2026-11-14',
        'startTime': '19:00',
        'endTime': '20:00',
      });
      expect(amount, 90.0);
    });

    test('resposta sem valor vira null (gestor digita)', () async {
      final service = ArenaManualBookingService(
        functions: _FakeFirebaseFunctions(result: null),
      );

      final amount = await service.quote(
        arenaId: 'a1',
        courtId: 'c1',
        dateKey: '2026-11-14',
        startTime: '19:00',
        endTime: '20:00',
      );

      expect(amount, isNull);
    });
  });
}

class _FakeFirebaseFunctions implements FirebaseFunctions {
  _FakeFirebaseFunctions({this.error, this.result});

  final FirebaseFunctionsException? error;
  final Object? result;
  final List<(String, Map<String, dynamic>)> calls = [];

  @override
  HttpsCallable httpsCallable(String name, {HttpsCallableOptions? options}) {
    return _FakeHttpsCallable(this, name);
  }

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class _FakeHttpsCallable implements HttpsCallable {
  _FakeHttpsCallable(this._functions, this._name);

  final _FakeFirebaseFunctions _functions;
  final String _name;

  @override
  Future<HttpsCallableResult<T>> call<T>([dynamic parameters]) async {
    _functions.calls.add(
      (_name, Map<String, dynamic>.from(parameters as Map)),
    );
    final error = _functions.error;
    if (error != null) throw error;
    return _FakeHttpsCallableResult<T>(_functions.result);
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
