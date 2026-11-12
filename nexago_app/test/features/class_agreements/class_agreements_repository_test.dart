// Fakes implementam classes `@sealed` do cloud_firestore (só aviso do analyzer).
// ignore_for_file: subtype_of_sealed_class

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/class_agreements/domain/class_agreements.dart';
import 'package:nexago_app/features/class_agreements/infrastructure/class_agreements_repository.dart';

import 'class_agreements_test_support.dart';

const _slots = [
  ClassSlotChoice(classId: 'c1', weekday: 1),
  ClassSlotChoice(classId: 'c2', weekday: 2),
];

/// O que a tela manda para as callables de `arena-agreements.ts`: nomes,
/// payloads (o servidor exige `agreed: true` e o `sha256` do texto lido) e a
/// tradução dos erros.
void main() {
  late _FakeFunctions functions;
  late ClassAgreementsRepository repo;

  setUp(() {
    functions = _FakeFunctions();
    repo = ClassAgreementsRepository(
      firestore: _NoFirestore(),
      functions: functions,
    );
  });

  test('signupOptions: getArenaClassSignupOptions com o arenaId', () async {
    functions.result = signupOptionsJson();
    final o = await repo.signupOptions('arena-sul');
    _expectCall(functions.calls.single, 'getArenaClassSignupOptions',
        {'arenaId': 'arena-sul'});
    expect(o.arenaName, 'Arena Sul');
    expect(o.plans, hasLength(2));
  });

  test('preview: slots como lista de mapas; CPF só quando informado', () async {
    functions.result = previewJson();
    final p = await repo.preview(
        arenaId: 'arena-sul', planId: 'mensal-2x', slots: _slots);
    expect(p.sha256, sha);
    expect(functions.calls.single.$1, 'previewMyArenaClassEnrollment');
    expect(functions.calls.single.$2, {
      'arenaId': 'arena-sul',
      'planId': 'mensal-2x',
      'slots': [
        {'classId': 'c1', 'weekday': 1},
        {'classId': 'c2', 'weekday': 2},
      ],
      'cycle': 'monthly',
    });

    await repo.preview(
        arenaId: 'arena-sul', planId: 'mensal-2x', slots: _slots, cpf: '');
    expect(functions.calls.last.$2.containsKey('cpfCnpj'), isFalse);
    await repo.preview(
        arenaId: 'arena-sul',
        planId: 'mensal-2x',
        slots: _slots,
        cpf: '12345678901');
    expect(functions.calls.last.$2['cpfCnpj'], '12345678901');
  });

  test('enroll: agreed + sha256 + evidência do aparelho', () async {
    functions.result = {
      'enrollmentId': 'enr-1',
      'agreementId': 'ag-1',
      'online': true,
      'charges': [
        {
          'description': 'Mensalidade',
          'amountReais': 280,
          'dueDate': '2026-11-20'
        },
      ],
      'signedAt': '2026-11-12T15:00:00Z',
    };
    final r = await repo.enroll(
      arenaId: 'arena-sul',
      planId: 'mensal-2x',
      slots: _slots,
      sha256: sha,
      readSeconds: 42,
      platform: 'android',
      appVersion: '1.0.21+119',
      cpf: '12345678901',
    );
    expect(functions.calls.single.$1, 'enrollMeInArenaClassPlan');
    expect(functions.calls.single.$2, {
      'arenaId': 'arena-sul',
      'planId': 'mensal-2x',
      'slots': [
        {'classId': 'c1', 'weekday': 1},
        {'classId': 'c2', 'weekday': 2},
      ],
      'cycle': 'monthly',
      'agreed': true,
      'sha256': sha,
      'readSeconds': 42,
      'platform': 'android',
      'appVersion': '1.0.21+119',
      'cpfCnpj': '12345678901',
    });
    expect(r.agreementId, 'ag-1');
    expect(r.charges.single.amountReais, 280);
    expect(r.signedAt, DateTime.utc(2026, 11, 12, 15));
  });

  test('myAgreements / agreement / sign', () async {
    functions.result = {
      'agreements': [agreementJson(id: 'a'), agreementJson(id: 'b')],
    };
    expect((await repo.myAgreements()).map((a) => a.agreementId), ['a', 'b']);
    _expectCall(functions.calls.last, 'getMyArenaAgreements', {});

    functions.result = agreementJson(id: 'a');
    expect((await repo.agreement('a')).agreementId, 'a');
    _expectCall(
        functions.calls.last, 'getMyArenaAgreement', {'agreementId': 'a'});

    functions.result = {'ok': true};
    await repo.sign(
      agreementId: 'a',
      sha256: sha,
      readSeconds: 30,
      platform: 'ios',
      appVersion: '1.0.21+119',
    );
    _expectCall(functions.calls.last, 'signMyArenaAgreement', {
      'agreementId': 'a',
      'agreed': true,
      'sha256': sha,
      'readSeconds': 30,
      'platform': 'ios',
      'appVersion': '1.0.21+119',
    });
  });

  test('erro da callable vira ClassAgreementException com a frase e o código',
      () async {
    functions.error = FirebaseFunctionsException(
      code: 'failed-precondition',
      message: 'O contrato mudou. Leia a nova versão.',
    );
    await expectLater(
      repo.enroll(
        arenaId: 'arena-sul',
        planId: 'mensal-2x',
        slots: _slots,
        sha256: sha,
        readSeconds: 1,
        platform: 'ios',
        appVersion: '',
      ),
      throwsA(isA<ClassAgreementException>()
          .having((e) => e.code, 'code', 'failed-precondition')
          .having((e) => e.toString(), 'toString',
              'O contrato mudou. Leia a nova versão.')),
    );
  });

  test('callable não deployada ("NOT FOUND" cru) cai no texto padrão',
      () async {
    functions.error =
        FirebaseFunctionsException(code: 'not-found', message: 'NOT FOUND');
    await expectLater(
      repo.signupOptions('arena-sul'),
      throwsA(isA<ClassAgreementException>()
          .having((e) => e.message, 'message',
              'Não foi possível abrir os planos de aula.')
          .having((e) => e.code, 'code', 'not-found')),
    );
  });

  test('resposta nula não quebra o parse', () async {
    functions.result = null;
    expect(await repo.myAgreements(), isEmpty);
  });
}

void _expectCall(
  (String, Map<String, dynamic>) call,
  String name,
  Map<String, Object?> payload,
) {
  expect(call.$1, name);
  expect(call.$2, payload);
}

class _NoFirestore implements FirebaseFirestore {
  @override
  dynamic noSuchMethod(Invocation invocation) =>
      throw UnimplementedError('${invocation.memberName}');
}

class _FakeFunctions implements FirebaseFunctions {
  Object? result;
  FirebaseFunctionsException? error;
  final List<(String, Map<String, dynamic>)> calls = [];

  @override
  HttpsCallable httpsCallable(String name, {HttpsCallableOptions? options}) =>
      _FakeCallable(this, name);

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class _FakeCallable implements HttpsCallable {
  _FakeCallable(this._f, this._name);

  final _FakeFunctions _f;
  final String _name;

  @override
  Future<HttpsCallableResult<T>> call<T>([dynamic parameters]) async {
    _f.calls.add((_name, Map<String, dynamic>.from(parameters as Map)));
    final e = _f.error;
    if (e != null) throw e;
    return _FakeResult<T>(_f.result);
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
