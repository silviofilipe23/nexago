// O dublê precisa construir a exceção do plugin, que é `@protected`.
// ignore_for_file: invalid_use_of_protected_member

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/firebase/fresh_connection_callable.dart';
import 'package:nexago_app/features/tournaments/data/tournament_partner_invite_service.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_uniform_selection.dart';

/// "DEADLINE_EXCEEDED ao colocar o nome na camisa" (Android, 24/11).
///
/// A callable responde em ~0,1 s (até ~7 s com cold start), mas a chamada do
/// atleta nunca chegou ao servidor: o SDK reaproveitou uma conexão HTTP/2 que
/// a rede tinha derrubado em silêncio e esperou os 60 s inteiros. Repetir pelo
/// SDK cai no mesmo socket morto — a segunda tentativa tem de sair por uma
/// conexão nova.
void main() {
  const uniform = TournamentUniformSelection(
    sizeTop: 'M',
    jerseyNumber: 10,
    jerseyName: 'SILVIO',
  );
  const expectedPayload = {
    'registrationId': 'reg-1',
    'uniform': {'sizeTop': 'M', 'jerseyNumber': 10, 'jerseyName': 'SILVIO'},
  };

  late _FakeFunctions functions;
  late _FakeFreshCallable fresh;

  TournamentPartnerInviteService build() => TournamentPartnerInviteService(
        firestore: _UnusedFirestore(),
        functions: functions,
        auth: _UnusedAuth(),
        freshCallable: fresh,
      );

  setUp(() {
    functions = _FakeFunctions();
    fresh = _FakeFreshCallable();
  });

  test('caminho feliz: uma chamada pelo SDK, com teto curto, e nada mais',
      () async {
    await build().setRegistrationUniform(
      registrationId: 'reg-1',
      uniform: uniform,
    );

    expect(functions.calls.single.name, 'setRegistrationUniform');
    expect(functions.calls.single.payload, expectedPayload);
    expect(functions.calls.single.timeout, kRegistrationUniformTimeout);
    expect(
      kRegistrationUniformTimeout,
      lessThan(const Duration(seconds: 60)),
      reason: 'o padrão do SDK (60 s) é o spinner que o atleta via girando',
    );
    expect(fresh.calls, isEmpty);
  });

  for (final code in ['deadline-exceeded', 'unavailable']) {
    test('$code no SDK: regrava por conexão nova e dá certo', () async {
      functions.error =
          _sdkError(code, code.toUpperCase().replaceAll('-', '_'));

      await build().setRegistrationUniform(
        registrationId: 'reg-1',
        uniform: uniform,
      );

      expect(fresh.calls.single.name, 'setRegistrationUniform');
      expect(fresh.calls.single.data, expectedPayload);
    });
  }

  test(
      'as duas tentativas falham por rede: mensagem humana, nunca o código cru',
      () async {
    functions.error = _sdkError('deadline-exceeded', 'DEADLINE_EXCEEDED');
    fresh.error = const FreshCallableException(
      code: 'deadline-exceeded',
      message: 'deadline-exceeded',
    );

    await expectLater(
      build().setRegistrationUniform(registrationId: 'reg-1', uniform: uniform),
      throwsA(
        isA<TournamentPartnerInviteException>()
            .having((e) => e.message, 'message', isNot(contains('DEADLINE')))
            .having((e) => e.message, 'message', isNot(contains('deadline')))
            .having((e) => e.message, 'message', contains('internet')),
      ),
    );
  });

  test('regra de negócio na segunda tentativa: mostra a mensagem do servidor',
      () async {
    functions.error = _sdkError('deadline-exceeded', 'DEADLINE_EXCEEDED');
    fresh.error = const FreshCallableException(
      code: 'invalid-argument',
      message: 'Informe o nome para a camisa.',
    );

    await expectLater(
      build().setRegistrationUniform(registrationId: 'reg-1', uniform: uniform),
      throwsA(
        isA<TournamentPartnerInviteException>().having(
          (e) => e.message,
          'message',
          'Informe o nome para a camisa.',
        ),
      ),
    );
  });

  test('erro de regra de negócio no SDK não tenta de novo', () async {
    functions.error = _sdkError(
      'permission-denied',
      'Você não é um dos atletas desta inscrição.',
    );

    await expectLater(
      build().setRegistrationUniform(registrationId: 'reg-1', uniform: uniform),
      throwsA(
        isA<TournamentPartnerInviteException>().having(
          (e) => e.message,
          'message',
          'Você não é um dos atletas desta inscrição.',
        ),
      ),
    );
    expect(fresh.calls, isEmpty);
  });

  test('NOT_FOUND cru do SDK também não vaza para a tela', () async {
    functions.error = _sdkError('not-found', 'NOT_FOUND');

    await expectLater(
      build().setRegistrationUniform(registrationId: 'reg-1', uniform: uniform),
      throwsA(
        isA<TournamentPartnerInviteException>()
            .having((e) => e.message, 'message', isNot('NOT_FOUND')),
      ),
    );
  });
}

FirebaseFunctionsException _sdkError(String code, String message) =>
    FirebaseFunctionsException(code: code, message: message);

class _FakeFunctions implements FirebaseFunctions {
  final calls = <({String name, Object? payload, Duration? timeout})>[];
  FirebaseFunctionsException? error;

  @override
  HttpsCallable httpsCallable(String name, {HttpsCallableOptions? options}) {
    return _FakeCallable((payload) {
      calls.add((name: name, payload: payload, timeout: options?.timeout));
      final e = error;
      if (e != null) throw e;
    });
  }

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class _FakeCallable implements HttpsCallable {
  _FakeCallable(this.onCall);

  final void Function(Object? payload) onCall;

  @override
  Future<HttpsCallableResult<T>> call<T>([dynamic parameters]) async {
    onCall(parameters);
    return _FakeResult<T>();
  }

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class _FakeResult<T> implements HttpsCallableResult<T> {
  @override
  T get data => null as T;

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class _FakeFreshCallable implements FreshConnectionCallable {
  final calls = <({String name, Map<String, dynamic> data})>[];
  FreshCallableException? error;

  @override
  Future<Object?> call(String name, Map<String, dynamic> data) async {
    calls.add((name: name, data: data));
    final e = error;
    if (e != null) throw e;
    return {'ok': true};
  }

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class _UnusedFirestore implements FirebaseFirestore {
  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class _UnusedAuth implements FirebaseAuth {
  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}
