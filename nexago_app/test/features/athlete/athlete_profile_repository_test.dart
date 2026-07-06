// Testes de regressão do bug "listagem de atletas mostrando só atletas
// novos": `AthleteProfileRepository.saveProfile()` deve SEMPRE gravar
// `role`/`roles`/`hasAthleteRole`, mesmo em contas já existentes que nunca
// tiveram esses campos, e sem derrubar um `roles` pré-existente (ex.:
// usuário dual-role atleta+organizador).
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth_platform_interface/firebase_auth_platform_interface.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_core_platform_interface/firebase_core_platform_interface.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/athlete/data/athlete_profile_repository.dart';
import 'package:nexago_app/features/athlete/domain/athlete_profile.dart';

void main() {
  // `saveProfile()` lê `FirebaseAuth.instance.currentUser` (linha 66 do
  // repositório). Sem um app Firebase "registrado", esse getter lança
  // `[core/no-app]`. Registramos delegates fake nas duas platform
  // interfaces (core + auth) para que `FirebaseAuth.instance.currentUser`
  // resolva para `null` sem depender de plugins nativos/rede — o mesmo
  // truque usado por pacotes como `firebase_auth_mocks` internamente.
  setUpAll(() {
    FirebasePlatform.instance = _FakeFirebasePlatform();
    FirebaseAuthPlatform.instance = _FakeFirebaseAuthPlatform();
  });

  const profile = AthleteProfile(
    id: 'u1',
    name: 'Ana Souza',
    sport: 'Vôlei de praia',
    level: 'Intermediário',
    city: 'Goiânia',
    state: 'GO',
  );

  group('AthleteProfileRepository.saveProfile — papel de atleta', () {
    test('doc novo (não existe ainda): role=athlete, roles=[athlete]', () async {
      final firestore = _FakeFirestore(existingUsers: {});
      final repo = AthleteProfileRepository(firestore);

      await repo.saveProfile(profile);

      final written = firestore.lastWrite('u1');
      expect(written, isNotNull);
      expect(written!['role'], 'athlete');
      expect(written['roles'], ['athlete']);
      expect(written['hasAthleteRole'], isTrue);
    });

    test(
      'conta legada (doc existe, nunca teve roles): se autocorrige no save',
      () async {
        final firestore = _FakeFirestore(
          existingUsers: {
            'u1': {'fullName': 'Ana Souza', 'city': 'Goiânia'},
          },
        );
        final repo = AthleteProfileRepository(firestore);

        await repo.saveProfile(profile);

        final written = firestore.lastWrite('u1');
        expect(written, isNotNull);
        expect(written!['role'], 'athlete');
        expect(written['roles'], ['athlete']);
        expect(written['hasAthleteRole'], isTrue);
      },
    );

    test(
      'usuário dual-role (roles=[organizer] preexistente): preserva organizer '
      'e adiciona athlete',
      () async {
        final firestore = _FakeFirestore(
          existingUsers: {
            'u1': {
              'fullName': 'Ana Souza',
              'city': 'Goiânia',
              'role': 'organizer',
              'roles': ['organizer'],
            },
          },
        );
        final repo = AthleteProfileRepository(firestore);

        await repo.saveProfile(profile);

        final written = firestore.lastWrite('u1');
        expect(written, isNotNull);
        // `role` (legado, singular) sempre vira 'athlete' — quem decide
        // dual-role é a lista `roles`.
        expect(written!['role'], 'athlete');
        expect(written['roles'], containsAll(<String>['organizer', 'athlete']));
        expect((written['roles'] as List).length, 2);
        expect(written['hasAthleteRole'], isTrue);
        expect(written['hasOrganizerRole'], isTrue);
      },
    );

    test('não duplica athlete se roles já continha athlete', () async {
      final firestore = _FakeFirestore(
        existingUsers: {
          'u1': {
            'roles': ['athlete', 'organizer'],
          },
        },
      );
      final repo = AthleteProfileRepository(firestore);

      await repo.saveProfile(profile);

      final written = firestore.lastWrite('u1');
      final roles = (written!['roles'] as List).cast<String>();
      expect(roles.toSet(), {'athlete', 'organizer'});
      expect(roles.length, 2);
    });
  });
}

/// Fake mínimo de [FirebaseFirestore] cobrindo somente `collection('users')`
/// (`.doc(id).get()` / `.set(data, SetOptions(merge: true))`), suficiente
/// para exercitar `AthleteProfileRepository.saveProfile()` de ponta a ponta
/// sem depender de um backend real.
class _FakeFirestore implements FirebaseFirestore {
  _FakeFirestore({required Map<String, Map<String, dynamic>> existingUsers})
      : _users = {
          for (final entry in existingUsers.entries)
            entry.key: Map<String, dynamic>.from(entry.value),
        };

  final Map<String, Map<String, dynamic>> _users;
  final Map<String, Map<String, dynamic>> _writes = {};

  /// Dados passados para `set()` na última chamada para o doc [id]
  /// (após aplicar merge com o estado anterior e resolver `FieldValue`s).
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

/// `Firebase.app()` (chamado por `FirebaseAuth.instance`) exige uma
/// [FirebasePlatform] registrada; sem isso lança `[core/no-app]` mesmo em
/// testes que nunca chamam `Firebase.initializeApp()`.
class _FakeFirebasePlatform extends FirebasePlatform {
  final FirebaseAppPlatform _app = FirebaseAppPlatform(
    defaultFirebaseAppName,
    const FirebaseOptions(
      apiKey: 'fake-api-key',
      appId: 'fake-app-id',
      messagingSenderId: 'fake-sender-id',
      projectId: 'fake-project-id',
    ),
  );

  @override
  FirebaseAppPlatform app([String name = defaultFirebaseAppName]) => _app;

  @override
  List<FirebaseAppPlatform> get apps => [_app];
}

/// Delegate fake de `firebase_auth`: mantém `FirebaseAuth.instance.currentUser`
/// determinístico (sempre `null`) sem tocar em method channels nativos.
class _FakeFirebaseAuthPlatform extends FirebaseAuthPlatform {
  @override
  FirebaseAuthPlatform delegateFor({required FirebaseApp app}) => this;

  @override
  FirebaseAuthPlatform setInitialValues({
    PigeonUserDetails? currentUser,
    String? languageCode,
  }) =>
      this;

  @override
  UserPlatform? get currentUser => null;
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
