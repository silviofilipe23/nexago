// Testes de `UsersRepository.ensureSignupUserDoc` — hook pós-login que
// garante `users/{uid}` para contas de atleta que nasceram só no Firebase
// Auth (cadastro por email ou social). Cria doc mínimo com `roles: [athlete]`
// quando ausente; não sobrescreve doc já existente (ex.: conta de outro
// portal cujo doc já nasceu via Cloud Function).
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/profiles/users_repository.dart';

void main() {
  group('UsersRepository.ensureSignupUserDoc', () {
    test('cria doc mínimo com roles [athlete] quando não existe', () async {
      final firestore = _FakeFirestore(existingUsers: {});
      final repo = UsersRepository(firestore);

      await repo.ensureSignupUserDoc(
        uid: 'u1',
        email: 'Ana@Email.com ',
        fullName: 'Ana Souza',
      );

      final written = firestore.lastWrite('u1');
      expect(written, isNotNull);
      expect(written!['roles'], ['athlete']);
      expect(written['hasAthleteRole'], isTrue);
      expect(written.containsKey('role'), isFalse);
      expect(written['email'], 'ana@email.com');
      expect(written['fullName'], 'Ana Souza');
    });

    test('não sobrescreve doc existente', () async {
      final firestore = _FakeFirestore(
        existingUsers: {
          'u1': {
            'roles': ['organizer'],
            'fullName': 'Gestor',
          },
        },
      );
      final repo = UsersRepository(firestore);

      await repo.ensureSignupUserDoc(uid: 'u1', email: 'x@y.com');

      expect(firestore.lastWrite('u1'), isNull);
    });
  });
}

/// Fake mínimo de [FirebaseFirestore] cobrindo somente `collection('users')`
/// (`.doc(id).get()` / `.set(data)`), suficiente para exercitar
/// `UsersRepository.ensureSignupUserDoc()` sem depender de um backend real.
/// Copiado do padrão de `test/features/athlete/athlete_profile_repository_test.dart`.
class _FakeFirestore implements FirebaseFirestore {
  _FakeFirestore({required Map<String, Map<String, dynamic>> existingUsers})
      : _users = {
          for (final entry in existingUsers.entries)
            entry.key: Map<String, dynamic>.from(entry.value),
        };

  final Map<String, Map<String, dynamic>> _users;
  final Map<String, Map<String, dynamic>> _writes = {};

  /// Dados passados para `set()` na última chamada para o doc [id].
  /// `null` quando `set()` nunca foi chamado para esse id (seeds do
  /// construtor não contam como write).
  Map<String, dynamic>? lastWrite(String id) => _writes[id];

  @override
  CollectionReference<Map<String, dynamic>> collection(String collectionPath) {
    if (collectionPath == 'users') {
      return _FakeUsersCollection(this);
    }
    throw UnimplementedError('collection "$collectionPath" não é faqueada');
  }

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class _FakeUsersCollection implements CollectionReference<Map<String, dynamic>> {
  _FakeUsersCollection(this._firestore);

  final _FakeFirestore _firestore;

  @override
  DocumentReference<Map<String, dynamic>> doc([String? path]) {
    final id = path ?? 'auto-${_firestore._users.length}';
    return _FakeUserDocRef(_firestore, id);
  }

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class _FakeUserDocRef implements DocumentReference<Map<String, dynamic>> {
  _FakeUserDocRef(this._firestore, this.id);

  final _FakeFirestore _firestore;

  @override
  final String id;

  @override
  Future<DocumentSnapshot<Map<String, dynamic>>> get([GetOptions? options]) async {
    return _FakeDocSnapshot(id: id, fields: _firestore._users[id]);
  }

  @override
  Future<void> set(Map<String, dynamic> data, [SetOptions? options]) async {
    final merge = options?.merge == true || options?.mergeFields != null;
    final existing = _firestore._users[id];
    final next = <String, dynamic>{
      if (merge && existing != null) ...existing,
    };
    data.forEach((key, value) {
      if (value == FieldValue.delete()) {
        next.remove(key);
      } else if (value == FieldValue.serverTimestamp()) {
        next[key] = Timestamp.now();
      } else {
        next[key] = value;
      }
    });
    _firestore._users[id] = next;
    _firestore._writes[id] = next;
  }

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class _FakeDocSnapshot implements DocumentSnapshot<Map<String, dynamic>> {
  _FakeDocSnapshot({required this.id, required Map<String, dynamic>? fields})
      : _fields = fields;

  @override
  final String id;
  final Map<String, dynamic>? _fields;

  @override
  bool get exists => _fields != null;

  @override
  Map<String, dynamic>? data() => _fields;

  @override
  dynamic get(Object field) => _fields?[field];

  @override
  dynamic operator [](Object field) => _fields?[field];

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}
