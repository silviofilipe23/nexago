// Testes de regressão do bug "listagem de atletas mostrando só atletas
// novos" + do bug "PERMISSION_DENIED ao salvar perfil de conta dual-role":
// `AthleteProfileRepository.saveProfile()` deve SEMPRE derivar
// `hasAthleteRole`/`hasOrganizerRole`/`keywords` corretamente, mesmo em
// contas já existentes que nunca tiveram esses campos, e sem derrubar um
// `roles` pré-existente (ex.: usuário dual-role atleta+organizador). O
// campo legado `role` nunca é escrito. E, principalmente: o client NUNCA
// escreve `roles` direto no Firestore (as rules só permitem update de
// `roles` idêntico ao valor salvo) — quem garante o papel de atleta é a
// Cloud Function callable `grantAthleteRole` (Admin SDK, bypassa rules),
// chamada apenas quando o papel ainda não está presente.
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';
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
    test(
      'doc novo (não existe ainda): não escreve roles direto, chama '
      'grantAthleteRole e deriva hasAthleteRole',
      () async {
        final firestore = _FakeFirestore(existingUsers: {});
        final functions = _FakeFirebaseFunctions();
        final repo = AthleteProfileRepository(firestore, functions: functions);

        await repo.saveProfile(profile);

        final rawPayload = firestore.lastRawPayload('u1');
        final written = firestore.lastWrite('u1');
        expect(rawPayload, isNotNull);
        expect(rawPayload!.containsKey('role'), isFalse);
        // `roles` é escrito exclusivamente pela Cloud Function via Admin
        // SDK — as rules rejeitam qualquer alteração de `roles` vinda do
        // client (PERMISSION_DENIED), então o client nunca deve incluir
        // essa chave no payload enviado ao Firestore.
        expect(rawPayload.containsKey('roles'), isFalse);
        expect(written!['hasAthleteRole'], isTrue);
        expect(functions.calledFunctionNames, ['grantAthleteRole']);
      },
    );

    test(
      'conta legada (doc existe, nunca teve roles): chama grantAthleteRole '
      'e deriva hasAthleteRole sem escrever roles',
      () async {
        final firestore = _FakeFirestore(
          existingUsers: {
            'u1': {'fullName': 'Ana Souza', 'city': 'Goiânia'},
          },
        );
        final functions = _FakeFirebaseFunctions();
        final repo = AthleteProfileRepository(firestore, functions: functions);

        await repo.saveProfile(profile);

        final rawPayload = firestore.lastRawPayload('u1');
        final written = firestore.lastWrite('u1');
        expect(rawPayload, isNotNull);
        expect(rawPayload!.containsKey('role'), isFalse);
        expect(rawPayload.containsKey('roles'), isFalse);
        expect(written!['hasAthleteRole'], isTrue);
        expect(functions.calledFunctionNames, ['grantAthleteRole']);
      },
    );

    test(
      'usuário dual-role (roles=[organizer] preexistente): chama '
      'grantAthleteRole, não escreve roles e deriva ambas as flags',
      () async {
        final firestore = _FakeFirestore(
          existingUsers: {
            'u1': {
              'fullName': 'Ana Souza',
              'city': 'Goiânia',
              'roles': ['organizer'],
            },
          },
        );
        final functions = _FakeFirebaseFunctions();
        final repo = AthleteProfileRepository(firestore, functions: functions);

        await repo.saveProfile(profile);

        final rawPayload = firestore.lastRawPayload('u1');
        final written = firestore.lastWrite('u1');
        expect(rawPayload, isNotNull);
        // O legado `role` (singular) nunca é escrito — quem decide
        // dual-role é a lista `roles`, e essa lista agora só é gravada
        // pela Cloud Function (Admin SDK), nunca pelo client diretamente.
        expect(rawPayload!.containsKey('role'), isFalse);
        expect(rawPayload.containsKey('roles'), isFalse);
        expect(written!['hasAthleteRole'], isTrue);
        expect(written['hasOrganizerRole'], isTrue);
        // Faltava 'athlete' em roles preexistente -> precisa chamar a
        // callable que concede o papel via Admin SDK.
        expect(functions.calledFunctionNames, ['grantAthleteRole']);
      },
    );

    test(
      'não chama grantAthleteRole nem escreve roles se já continha athlete',
      () async {
        final firestore = _FakeFirestore(
          existingUsers: {
            'u1': {
              'roles': ['athlete', 'organizer'],
            },
          },
        );
        final functions = _FakeFirebaseFunctions();
        final repo = AthleteProfileRepository(firestore, functions: functions);

        await repo.saveProfile(profile);

        final rawPayload = firestore.lastRawPayload('u1');
        final written = firestore.lastWrite('u1');
        expect(rawPayload, isNotNull);
        expect(rawPayload!.containsKey('roles'), isFalse);
        expect(written!['hasAthleteRole'], isTrue);
        expect(written['hasOrganizerRole'], isTrue);
        // Já é atleta -> save "normal" (editar CPF, biometria, metas etc.)
        // não deve gerar chamada de rede nenhuma para a callable.
        expect(functions.calledFunctionNames, isEmpty);
      },
    );
  });

  group(
    'AthleteProfileRepository.saveProfile — janela de calibração '
    '(sportOnboarding.levelLocked)',
    () {
      const downgrade = AthleteProfile(
        id: 'u1',
        name: 'Ana Souza',
        sport: 'Vôlei de praia',
        level: 'Iniciante 1',
        city: 'Goiânia',
        state: 'GO',
        primarySportFirestoreId: 'VOLEI_PRAIA',
        levelsBySportFirestore: {'VOLEI_PRAIA': 'iniciante_1'},
      );

      test(
        'esporte travado: descida em levelsBySport é revertida pro nível '
        'salvo (ratchet "nível só sobe" de sempre)',
        () async {
          final firestore = _FakeFirestore(
            existingUsers: {
              'u1': {
                'fullName': 'Ana Souza',
                'roles': ['athlete'],
                'sportOnboarding': {
                  'levelsBySport': {'VOLEI_PRAIA': 'avancado_1'},
                  'levelLocked': {'VOLEI_PRAIA': true},
                },
              },
            },
          );
          final repo = AthleteProfileRepository(
            firestore,
            functions: _FakeFirebaseFunctions(),
          );

          await repo.saveProfile(downgrade);

          final onboarding =
              firestore.lastWrite('u1')!['sportOnboarding'] as Map;
          final levels = onboarding['levelsBySport'] as Map;
          expect(levels['VOLEI_PRAIA'], 'avancado_1');
        },
      );

      test(
        'esporte sem lock (janela ainda aberta): descida em levelsBySport '
        'é aceita — o clamp não desfaz a autocorreção do notifier',
        () async {
          final firestore = _FakeFirestore(
            existingUsers: {
              'u1': {
                'fullName': 'Ana Souza',
                'roles': ['athlete'],
                'sportOnboarding': {
                  'levelsBySport': {'VOLEI_PRAIA': 'avancado_1'},
                  // Sem 'levelLocked': 1ª inscrição ainda não aconteceu.
                },
              },
            },
          );
          final repo = AthleteProfileRepository(
            firestore,
            functions: _FakeFirebaseFunctions(),
          );

          await repo.saveProfile(downgrade);

          final onboarding =
              firestore.lastWrite('u1')!['sportOnboarding'] as Map;
          final levels = onboarding['levelsBySport'] as Map;
          expect(levels['VOLEI_PRAIA'], 'iniciante_1');
        },
      );
    },
  );

  group('AthleteProfileRepository.saveProfile — galeria de destaque', () {
    test('grava highlightPhotoUrls no doc', () async {
      final firestore = _FakeFirestore(existingUsers: {});
      // Doc novo -> saveProfile() chama grantAthleteRole; sem um fake aqui
      // a chamada iria para o FirebaseFunctions.instance real.
      final repo = AthleteProfileRepository(
        firestore,
        functions: _FakeFirebaseFunctions(),
      );

      await repo.saveProfile(
        profile.copyWith(
          highlightPhotoUrls: ['https://x/1.jpg', 'https://x/2.jpg'],
        ),
      );

      final written = firestore.lastWrite('u1');
      expect(written!['highlightPhotoUrls'], [
        'https://x/1.jpg',
        'https://x/2.jpg',
      ]);
    });

    test('remoção reflete no próximo save (array sobrescrito)', () async {
      final firestore = _FakeFirestore(
        existingUsers: {
          'u1': {
            'fullName': 'Ana Souza',
            'highlightPhotoUrls': ['https://x/1.jpg', 'https://x/2.jpg'],
          },
        },
      );
      // Doc existente sem `roles` ainda -> também dispara grantAthleteRole.
      final repo = AthleteProfileRepository(
        firestore,
        functions: _FakeFirebaseFunctions(),
      );

      await repo.saveProfile(
        profile.copyWith(highlightPhotoUrls: ['https://x/1.jpg']),
      );

      final written = firestore.lastWrite('u1');
      expect(written!['highlightPhotoUrls'], ['https://x/1.jpg']);
    });
  });
}

/// Fake mínimo de [FirebaseFunctions]: registra o nome de toda callable
/// disparada por [AthleteProfileRepository.saveProfile], sem fazer nenhuma
/// chamada de rede real. Usado para verificar que `grantAthleteRole` só é
/// chamada quando o papel de atleta ainda não está presente em `roles`.
class _FakeFirebaseFunctions implements FirebaseFunctions {
  final List<String> calledFunctionNames = [];

  @override
  HttpsCallable httpsCallable(String name, {HttpsCallableOptions? options}) {
    return _FakeHttpsCallable(() => calledFunctionNames.add(name));
  }

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class _FakeHttpsCallable implements HttpsCallable {
  _FakeHttpsCallable(this._onCall);

  final void Function() _onCall;

  @override
  Future<HttpsCallableResult<T>> call<T>([dynamic parameters]) async {
    _onCall();
    return _FakeHttpsCallableResult<T>();
  }

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class _FakeHttpsCallableResult<T> implements HttpsCallableResult<T> {
  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
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
  final Map<String, Map<String, dynamic>> _rawPayloads = {};

  /// Dados passados para `set()` na última chamada para o doc [id]
  /// (após aplicar merge com o estado anterior e resolver `FieldValue`s).
  Map<String, dynamic>? lastWrite(String id) => _writes[id];

  /// O payload BRUTO passado para `set()` (antes do merge com o estado
  /// anterior). Diferente de [lastWrite]: como `set(merge: true)` preserva
  /// campos existentes não mencionados no payload, `lastWrite` de um doc
  /// que já tinha `roles` continuaria mostrando `roles` mesmo que o
  /// repositório nunca tenha voltado a incluir essa chave no payload. Para
  /// validar que o client NUNCA envia `roles` (regra anti-privilege-
  /// escalation), é este getter que deve ser usado.
  Map<String, dynamic>? lastRawPayload(String id) => _rawPayloads[id];

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
    _firestore._rawPayloads[id] = Map<String, dynamic>.from(data);
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
