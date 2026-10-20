import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/arenas/data/booking_service.dart';
import 'package:nexago_app/features/arenas/domain/arena_booking_confirm_args.dart';

/// Reserva como professor (`createArenaBooking` com `asProfessor`, PR #798):
/// a chave só vai quando o atleta liga a opção, e a recusa do vínculo vira um
/// código próprio para a tela voltar à reserva de atleta.
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

  const ok = {'bookingId': 'b1', 'amountReais': 100.0};

  test('liga: envia asProfessor true', () async {
    final functions = _FakeFunctions(responses: {'createArenaBooking': ok});
    final service = BookingService(_UnusedFirestore(), functions: functions);

    await service.createBookingAtomically(
      args: args,
      athleteId: 'u1',
      asProfessor: true,
    );

    expect(functions.payloads.first?['asProfessor'], isTrue);
  });

  test('padrão: reserva de atleta, sem a chave no payload', () async {
    final functions = _FakeFunctions(responses: {'createArenaBooking': ok});
    final service = BookingService(_UnusedFirestore(), functions: functions);

    await service.createBookingAtomically(args: args, athleteId: 'u1');

    expect(functions.payloads.first?.containsKey('asProfessor'), isFalse);
  });

  for (final reason in ['no_link', 'not_active', 'permission_off']) {
    test('recusa do vínculo ($reason): código próprio e a copy do servidor',
        () async {
      final functions = _FakeFunctions(
        errors: {
          'createArenaBooking': FirebaseFunctionsException(
            code: 'permission-denied',
            message: 'A Arena Beach não liberou reservar como professor no seu '
                'vínculo. Você ainda pode reservar como atleta.',
            details: {'reason': reason, 'linkId': 'arena1_u1'},
          ),
        },
      );
      final service = BookingService(_UnusedFirestore(), functions: functions);

      final error = await service
          .createBookingAtomically(
              args: args, athleteId: 'u1', asProfessor: true)
          .then<BookingException?>((_) => null)
          .catchError((Object e) => e as BookingException);

      expect(error, isNotNull);
      expect(error!.isProfessorDenied, isTrue);
      expect(error.isBlockedAthlete, isFalse);
      expect(error.message, contains('Você ainda pode reservar como atleta.'));
    });
  }

  test('atleta bloqueado continua sendo bloqueio, não recusa de professor',
      () async {
    final functions = _FakeFunctions(
      errors: {
        'createArenaBooking': FirebaseFunctionsException(
          code: 'permission-denied',
          message: 'Sua conta está bloqueada nesta arena.',
        ),
      },
    );
    final service = BookingService(_UnusedFirestore(), functions: functions);

    final error = await service
        .createBookingAtomically(args: args, athleteId: 'u1')
        .then<BookingException?>((_) => null)
        .catchError((Object e) => e as BookingException);

    expect(error!.isBlockedAthlete, isTrue);
    expect(error.isProfessorDenied, isFalse);
  });
}

class _FakeFunctions implements FirebaseFunctions {
  _FakeFunctions({this.responses = const {}, this.errors = const {}});

  final Map<String, Object?> responses;
  final Map<String, FirebaseFunctionsException> errors;
  final List<Map<String, dynamic>?> payloads = [];

  @override
  HttpsCallable httpsCallable(String name, {HttpsCallableOptions? options}) =>
      _FakeCallable(this, name);

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class _FakeCallable implements HttpsCallable {
  _FakeCallable(this._owner, this._name);

  final _FakeFunctions _owner;
  final String _name;

  @override
  Future<HttpsCallableResult<T>> call<T>([dynamic parameters]) async {
    _owner.payloads.add(
      parameters is Map ? Map<String, dynamic>.from(parameters) : null,
    );
    final error = _owner.errors[_name];
    if (error != null) throw error;
    return _FakeResult<T>(_owner.responses[_name]);
  }

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class _FakeResult<T> implements HttpsCallableResult<T> {
  _FakeResult(this._data);

  final Object? _data;

  @override
  T get data => _data as T;

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class _UnusedFirestore implements FirebaseFirestore {
  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}
