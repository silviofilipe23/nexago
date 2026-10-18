import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/squad/domain/squad_models.dart';
import 'package:nexago_app/features/squad/domain/squad_repository.dart';
import 'package:nexago_app/features/squad/infrastructure/firebase_squad_repository.dart';

void main() {
  group('callables do atleta', () {
    test('getMySquad: lê a resposta Map<Object?, Object?> do plugin', () async {
      final functions = _FakeFunctions(
        responses: {
          'getMySquad': <Object?, Object?>{
            'member': null,
            'invite': <Object?, Object?>{'id': 'inv-1', 'tier': 'amb'},
          },
        },
      );
      final repo = FirebaseSquadRepository(
        _FakeFirestore(),
        functions: functions,
      );

      final squad = await repo.fetchMySquad();

      expect(functions.calls.single.name, 'getMySquad');
      expect(squad.member, isNull);
      expect(squad.invite!.id, 'inv-1');
      expect(squad.invite!.tier, SquadTier.amb);
    });

    test('resposta que não é mapa vira "nada" em vez de quebrar', () async {
      final repo = FirebaseSquadRepository(
        _FakeFirestore(),
        functions: _FakeFunctions(responses: {'getMySquad': null}),
      );

      final squad = await repo.fetchMySquad();

      expect(squad.member, isNull);
      expect(squad.invite, isNull);
    });

    test(
      'viewSquadInvite e acceptSquadInvite mandam o id e o código',
      () async {
        final functions = _FakeFunctions(
          responses: {
            'viewSquadInvite': <Object?, Object?>{
              'id': 'inv-9',
              'status': 'opened',
              'suggestedCode': 'JOAO10',
            },
            'acceptSquadInvite': <Object?, Object?>{'ok': true},
          },
        );
        final repo = FirebaseSquadRepository(
          _FakeFirestore(),
          functions: functions,
        );

        final invite = await repo.viewInvite('inv-9');
        await repo.acceptInvite(inviteId: 'inv-9', code: 'JOAO10');

        expect(invite.isOpen, isTrue);
        expect(functions.calls.map((c) => c.name), [
          'viewSquadInvite',
          'acceptSquadInvite',
        ]);
        expect(functions.calls[0].data, {'inviteId': 'inv-9'});
        expect(functions.calls[1].data, {
          'inviteId': 'inv-9',
          'code': 'JOAO10',
        });
      },
    );

    test('checkSquadCode manda código, atletas e inscrição', () async {
      final functions = _FakeFunctions(
        responses: {
          'checkSquadCode': <Object?, Object?>{
            'ambassadorName': 'João Victor',
            'code': 'JOAO10',
            'origin': 'code',
            'discountPct': 10,
            'feePercent': 8,
          },
        },
      );
      final repo = FirebaseSquadRepository(
        _FakeFirestore(),
        functions: functions,
      );

      final check = await repo.checkCode(
        code: 'JOAO10',
        athleteUids: const ['atleta-1', 'parceiro-2'],
        registrationId: 'reg-1',
      );

      expect(functions.calls.single.data, {
        'code': 'JOAO10',
        'athleteUids': ['atleta-1', 'parceiro-2'],
        'registrationId': 'reg-1',
      });
      expect(check.code, 'JOAO10');
      expect(check.feePercent, 8);
    });

    test('ranking e aditivo chamam as callables certas', () async {
      final functions = _FakeFunctions(
        responses: {
          'getSquadRanking': <Object?, Object?>{
            'entries': <Object?>[],
            'me': null,
            'level': 'Bronze',
            'levels': <Object?>[],
          },
          'acceptSquadAmendment': <Object?, Object?>{},
        },
      );
      final repo = FirebaseSquadRepository(
        _FakeFirestore(),
        functions: functions,
      );

      final ranking = await repo.fetchRanking();
      await repo.acceptAmendment();

      expect(ranking.level, 'Bronze');
      expect(functions.calls.map((c) => c.name), [
        'getSquadRanking',
        'acceptSquadAmendment',
      ]);
    });
  });

  group('erros viram SquadException com a copy e o campo', () {
    Future<SquadException> acceptError(FirebaseFunctionsException e) async {
      final repo = FirebaseSquadRepository(
        _FakeFirestore(),
        functions: _FakeFunctions(error: e),
      );
      try {
        await repo.acceptInvite(inviteId: 'inv-1', code: 'JOAO10');
      } on SquadException catch (error) {
        return error;
      }
      fail('acceptInvite deveria lançar SquadException');
    }

    test(
      'details.fields = ["code"] (invalid() do backend) → field "code"',
      () async {
        final error = await acceptError(
          FirebaseFunctionsException(
            code: 'invalid-argument',
            message: 'Esse código já está em uso. Escolha outro.',
            details: {
              'fields': ['code'],
            },
          ),
        );

        expect(error.field, 'code');
        expect(error.message, 'Esse código já está em uso. Escolha outro.');
      },
    );

    test('details.field = "code" também vale', () async {
      final error = await acceptError(
        FirebaseFunctionsException(
          code: 'failed-precondition',
          message: 'Código indisponível.',
          details: {'field': 'code'},
        ),
      );

      expect(error.field, 'code');
    });

    test('sem details: sem campo, só a mensagem', () async {
      final error = await acceptError(
        FirebaseFunctionsException(
          code: 'failed-precondition',
          message: 'Este convite expirou.',
        ),
      );

      expect(error.field, isNull);
      expect(error.message, 'Este convite expirou.');
      expect(error.toString(), 'Este convite expirou.');
    });

    test('mensagem crua ("NOT FOUND" = callable não deployada) vira a copy '
        'padrão', () async {
      final error = await acceptError(
        FirebaseFunctionsException(code: 'not-found', message: 'NOT FOUND'),
      );

      expect(
        error.message,
        'Não foi possível falar com o NexaSquad. Tente de novo em instantes.',
      );
    });
  });

  group('flag appConfig/squad', () {
    test('enabled: true liga; doc ausente ou sem o campo desliga', () async {
      Future<bool> enabled(Map<String, dynamic>? data) {
        final db = _FakeFirestore(docData: data);
        final repo = FirebaseSquadRepository(db, functions: _FakeFunctions());
        return repo.watchEnabled().first;
      }

      expect(await enabled({'enabled': true}), isTrue);
      expect(await enabled({'enabled': false}), isFalse);
      expect(await enabled({'enabled': 'true'}), isFalse);
      expect(await enabled({}), isFalse);
      expect(await enabled(null), isFalse);
    });

    test('lê o doc appConfig/squad', () async {
      final db = _FakeFirestore(docData: {'enabled': true});
      final repo = FirebaseSquadRepository(db, functions: _FakeFunctions());

      await repo.watchEnabled().first;

      expect(db.paths, ['appConfig/squad']);
    });
  });
}

typedef _Call = ({String name, Object? data});

class _FakeFunctions implements FirebaseFunctions {
  _FakeFunctions({this.responses = const {}, this.error});

  final Map<String, Object?> responses;
  final FirebaseFunctionsException? error;
  final calls = <_Call>[];

  @override
  HttpsCallable httpsCallable(String name, {HttpsCallableOptions? options}) {
    return _FakeCallable((data) {
      calls.add((name: name, data: data));
      final e = error;
      if (e != null) throw e;
      return responses[name];
    });
  }

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class _FakeCallable implements HttpsCallable {
  _FakeCallable(this._onCall);

  final Object? Function(Object? data) _onCall;

  @override
  Future<HttpsCallableResult<T>> call<T>([dynamic parameters]) async {
    return _FakeResult<T>(_onCall(parameters));
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

/// Firestore mínimo: só `doc(path).snapshots()` com um snapshot fixo.
class _FakeFirestore implements FirebaseFirestore {
  _FakeFirestore({this.docData});

  final Map<String, dynamic>? docData;
  final paths = <String>[];

  @override
  DocumentReference<Map<String, dynamic>> doc(String documentPath) {
    paths.add(documentPath);
    return _FakeDocRef(docData);
  }

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

// ignore: subtype_of_sealed_class
class _FakeDocRef implements DocumentReference<Map<String, dynamic>> {
  _FakeDocRef(this._data);

  final Map<String, dynamic>? _data;

  @override
  dynamic noSuchMethod(Invocation invocation) {
    if (invocation.memberName == #snapshots) {
      return Stream<DocumentSnapshot<Map<String, dynamic>>>.value(
        _FakeSnap(_data),
      );
    }
    return super.noSuchMethod(invocation);
  }
}

// ignore: subtype_of_sealed_class
class _FakeSnap implements DocumentSnapshot<Map<String, dynamic>> {
  _FakeSnap(this._data);

  final Map<String, dynamic>? _data;

  @override
  Map<String, dynamic>? data() => _data;

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}
