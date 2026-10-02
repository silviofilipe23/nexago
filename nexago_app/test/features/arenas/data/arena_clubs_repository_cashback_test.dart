import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/arenas/data/arena_clubs_repository.dart';

const _join = <String, Object?>{
  'sessionId': 's1',
  'paymentId': 'pay_c1',
  'qrCode': '00020101021226860014br.gov.bcb.pix',
  'qrCodeBase64': '',
  'expiresAt': '2026-10-02T15:00:00.000Z',
  'amountReais': 30.0,
};

void main() {
  group('joinSession — cashback', () {
    test('manda useCashback só com o toggle ligado', () async {
      final functions = _FakeFirebaseFunctions(responses: {
        'joinArenaClubSession': _join,
      });
      final repo = ArenaClubsRepository(_UnusedFirestore(), functions: functions);

      await repo.joinSession(sessionId: 's1', useCashback: true);
      await repo.joinSession(sessionId: 's1');

      expect(functions.calledPayloads[0]?['useCashback'], isTrue);
      expect(
        functions.calledPayloads[1]?.containsKey('useCashback'),
        isFalse,
      );
    });

    test('lê o aplicado e o cobrado; amountReais segue sendo o preço',
        () async {
      final functions = _FakeFirebaseFunctions(responses: {
        'joinArenaClubSession': {
          ..._join,
          'cashbackAppliedReais': 10.0,
          'chargedReais': 20.0,
        },
      });
      final repo = ArenaClubsRepository(_UnusedFirestore(), functions: functions);

      final pix = await repo.joinSession(sessionId: 's1', useCashback: true);

      expect(pix.amountReais, 30.0);
      expect(pix.cashbackAppliedReais, 10.0);
      expect(pix.chargedReais, 20.0);
    });

    test('functions antigas (sem chargedReais): o PIX vale o preço', () async {
      final functions = _FakeFirebaseFunctions(responses: {
        'joinArenaClubSession': _join,
      });
      final repo = ArenaClubsRepository(_UnusedFirestore(), functions: functions);

      final pix = await repo.joinSession(sessionId: 's1', useCashback: true);

      expect(pix.cashbackAppliedReais, 0);
      expect(pix.chargedReais, 30.0);
    });
  });
}

class _FakeFirebaseFunctions implements FirebaseFunctions {
  _FakeFirebaseFunctions({required this.responses});

  final Map<String, Object?> responses;
  final List<Map<String, dynamic>?> calledPayloads = [];

  @override
  HttpsCallable httpsCallable(String name, {HttpsCallableOptions? options}) {
    return _FakeHttpsCallable(
      onCall: (parameters) {
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

/// `joinSession` não toca no Firestore — nunca deve ser chamado aqui.
class _UnusedFirestore implements FirebaseFirestore {
  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}
