// Teste de regressão: inscrição solo (aguardando parceiro) sumia de "Meus
// torneios"/Início. `registerSoloTournament` (Cloud Function) não cria
// `teams` doc nem grava `teamId` na inscrição até o parceiro aceitar o
// convite — mas o repositório descartava qualquer doc sem `teamId`, mesmo
// já tendo encontrado a inscrição pela query indexada por `participantUids`.
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/tournaments/data/my_tournament_registrations_repository.dart';
import 'package:nexago_app/features/tournaments/data/nexago_artifacts_paths.dart';

void main() {
  group('MyTournamentRegistrationsRepository.watchForUser', () {
    test(
      'inscrição solo sem teamId (aguardando parceiro) aparece na lista',
      () async {
        const uid = 'athlete-1';
        final firestore = _FakeFirestore();

        firestore.seedDoc(
          NexagoArtifactsPaths.inscriptionsCollection(),
          'reg-solo',
          {
            'tournamentId': 't1',
            'categoryId': 'cat1',
            'player1Id': uid,
            'participantUids': [uid],
            'partnerPending': true,
            'isPaid': false,
          },
        );
        firestore.seedDoc('tournaments', 't1', {
          'name': 'Copa Teste',
          'listingStatus': 'open',
          'dateLabel': '20/08',
          'startAt': Timestamp.fromDate(
            DateTime.now().add(const Duration(days: 20)),
          ),
        });

        final repo = MyTournamentRegistrationsRepository(firestore);
        final regs = await repo.watchForUser(uid).first;

        expect(regs, hasLength(1));
        expect(regs.single.tournamentId, 't1');
        expect(regs.single.teamId, isNull);
        expect(regs.single.partnerPending, isTrue);
        expect(regs.single.isPaid, isFalse);
      },
    );

    test('parcela paga por QUALQUER um da dupla marca hasPartialPayment', () async {
      const uid = 'athlete-1';
      final firestore = _FakeFirestore();

      firestore.seedDoc(
        NexagoArtifactsPaths.inscriptionsCollection(),
        'reg-meio-paga',
        {
          'tournamentId': 't1',
          'categoryId': 'cat1',
          'participantUids': [uid, 'athlete-2'],
          'isPaid': false,
          'sharePaidUids': ['athlete-2'],
        },
      );
      firestore.seedDoc('tournaments', 't1', {
        'name': 'Copa Teste',
        'listingStatus': 'open',
      });

      final repo = MyTournamentRegistrationsRepository(firestore);
      final regs = await repo.watchForUser(uid).first;

      expect(regs, hasLength(1));
      expect(regs.single.hasPartialPayment, isTrue);
      expect(regs.single.athleteHasReserved, isFalse);
    });

    test(
      'captainUid vem trimado e substitutionHistory converte Timestamp/'
      'faz fallback de nome',
      () async {
        const uid = 'athlete-1';
        final firestore = _FakeFirestore();

        firestore.seedDoc(
          NexagoArtifactsPaths.inscriptionsCollection(),
          'reg-equipe',
          {
            'tournamentId': 't1',
            'categoryId': 'cat1',
            'participantUids': [uid, 'cap-1'],
            'isPaid': false,
            'captainUid': '  cap-1  ',
            'substitutionHistory': [
              {
                'outName': 'Beto',
                'inName': 'Caio',
                'at': Timestamp.fromDate(DateTime(2026, 8, 29)),
              },
              // Sem outName/inName no doc: exercita o fallback para 'Atleta'
              // — `_substitutionHistoryFromData` só cai no fallback quando o
              // campo está AUSENTE (cast para null); presente-mas-em-branco
              // vira string vazia e não aciona o `??`.
              <String, dynamic>{},
            ],
          },
        );
        firestore.seedDoc('tournaments', 't1', {
          'name': 'Copa Teste',
          'listingStatus': 'open',
        });

        final repo = MyTournamentRegistrationsRepository(firestore);
        final regs = await repo.watchForUser(uid).first;

        expect(regs, hasLength(1));
        final reg = regs.single;
        expect(reg.captainUid, 'cap-1');
        expect(reg.substitutionHistory, hasLength(2));
        expect(reg.substitutionHistory[0].outName, 'Beto');
        expect(reg.substitutionHistory[0].inName, 'Caio');
        expect(reg.substitutionHistory[0].at, DateTime(2026, 8, 29));
        expect(reg.substitutionHistory[1].outName, 'Atleta');
        expect(reg.substitutionHistory[1].inName, 'Atleta');
        expect(reg.substitutionHistory[1].at, isNull);
      },
    );

    test('inscrição sem tournamentId é descartada (doc malformado)', () async {
      const uid = 'athlete-1';
      final firestore = _FakeFirestore();

      firestore.seedDoc(
        NexagoArtifactsPaths.inscriptionsCollection(),
        'reg-malformado',
        {
          'participantUids': [uid],
          'isPaid': false,
        },
      );

      final repo = MyTournamentRegistrationsRepository(firestore);
      final regs = await repo.watchForUser(uid).first;

      expect(regs, isEmpty);
    });
  });
}

/// Fake mínimo de [FirebaseFirestore], no mesmo espírito do usado em
/// `athlete_profile_repository_test.dart`: cobre só `collection(path)`,
/// `.doc(id)`, `.where(...)` (isEqualTo/arrayContains/whereIn), `.get()` e
/// `.snapshots()` — o suficiente para exercitar
/// `MyTournamentRegistrationsRepository` de ponta a ponta sem backend real.
class _FakeFirestore implements FirebaseFirestore {
  final Map<String, Map<String, Map<String, dynamic>>> _collections = {};

  void seedDoc(
    String collectionPath,
    String docId,
    Map<String, dynamic> data,
  ) {
    _collections.putIfAbsent(collectionPath, () => {})[docId] = data;
  }

  @override
  CollectionReference<Map<String, dynamic>> collection(String collectionPath) {
    return _FakeCollection(this, collectionPath);
  }

  @override
  DocumentReference<Map<String, dynamic>> doc(String path) {
    final slash = path.lastIndexOf('/');
    final collectionPath = path.substring(0, slash);
    final docId = path.substring(slash + 1);
    return _FakeDocRef(this, collectionPath, docId);
  }

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class _FakeCollection implements CollectionReference<Map<String, dynamic>> {
  _FakeCollection(this._firestore, this._path);

  final _FakeFirestore _firestore;
  final String _path;

  Map<String, Map<String, dynamic>> get _docs =>
      _firestore._collections[_path] ?? const {};

  @override
  DocumentReference<Map<String, dynamic>> doc([String? path]) {
    final id = path ?? 'auto-${_docs.length}';
    return _FakeDocRef(_firestore, _path, id);
  }

  @override
  Query<Map<String, dynamic>> where(
    Object field, {
    Object? isEqualTo,
    Object? isNotEqualTo,
    Object? isLessThan,
    Object? isLessThanOrEqualTo,
    Object? isGreaterThan,
    Object? isGreaterThanOrEqualTo,
    Object? arrayContains,
    Iterable<Object?>? arrayContainsAny,
    Iterable<Object?>? whereIn,
    Iterable<Object?>? whereNotIn,
    bool? isNull,
  }) {
    return _FakeQuery(_firestore, _path, _docs).where(
      field,
      isEqualTo: isEqualTo,
      arrayContains: arrayContains,
      whereIn: whereIn,
      isNull: isNull,
    );
  }

  @override
  Future<QuerySnapshot<Map<String, dynamic>>> get([GetOptions? options]) {
    return _FakeQuery(_firestore, _path, _docs).get(options);
  }

  @override
  Stream<QuerySnapshot<Map<String, dynamic>>> snapshots({
    bool includeMetadataChanges = false,
    ListenSource source = ListenSource.defaultSource,
  }) {
    return _FakeQuery(_firestore, _path, _docs).snapshots();
  }

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class _FakeQuery implements Query<Map<String, dynamic>> {
  _FakeQuery(this._firestore, this._path, this._docs);

  final _FakeFirestore _firestore;
  final String _path;
  final Map<String, Map<String, dynamic>> _docs;

  @override
  Query<Map<String, dynamic>> where(
    Object field, {
    Object? isEqualTo,
    Object? isNotEqualTo,
    Object? isLessThan,
    Object? isLessThanOrEqualTo,
    Object? isGreaterThan,
    Object? isGreaterThanOrEqualTo,
    Object? arrayContains,
    Iterable<Object?>? arrayContainsAny,
    Iterable<Object?>? whereIn,
    Iterable<Object?>? whereNotIn,
    bool? isNull,
  }) {
    final key = field as String;
    final whereInList = whereIn?.toList();
    final filtered = <String, Map<String, dynamic>>{};
    _docs.forEach((id, data) {
      final value = data[key];
      if (isEqualTo != null && value != isEqualTo) return;
      if (arrayContains != null &&
          !(value is List && value.contains(arrayContains))) {
        return;
      }
      if (whereInList != null && !whereInList.contains(value)) return;
      filtered[id] = data;
    });
    return _FakeQuery(_firestore, _path, filtered);
  }

  @override
  Future<QuerySnapshot<Map<String, dynamic>>> get([GetOptions? options]) async {
    return _FakeQuerySnapshot(_path, _docs);
  }

  @override
  Stream<QuerySnapshot<Map<String, dynamic>>> snapshots({
    bool includeMetadataChanges = false,
    ListenSource source = ListenSource.defaultSource,
  }) {
    return Stream.value(_FakeQuerySnapshot(_path, _docs));
  }

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class _FakeQuerySnapshot implements QuerySnapshot<Map<String, dynamic>> {
  _FakeQuerySnapshot(String path, Map<String, Map<String, dynamic>> docsById)
      : docs = [
          for (final entry in docsById.entries)
            _FakeQueryDocSnapshot(entry.key, entry.value),
        ];

  @override
  final List<QueryDocumentSnapshot<Map<String, dynamic>>> docs;

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class _FakeQueryDocSnapshot
    implements QueryDocumentSnapshot<Map<String, dynamic>> {
  _FakeQueryDocSnapshot(this.id, this._data);

  @override
  final String id;
  final Map<String, dynamic> _data;

  @override
  Map<String, dynamic> data() => _data;

  @override
  dynamic get(Object field) => _data[field as String];

  @override
  dynamic operator [](Object field) => _data[field as String];

  @override
  bool get exists => true;

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class _FakeDocRef implements DocumentReference<Map<String, dynamic>> {
  _FakeDocRef(this._firestore, this._collectionPath, this.id);

  final _FakeFirestore _firestore;
  final String _collectionPath;

  @override
  final String id;

  @override
  Future<DocumentSnapshot<Map<String, dynamic>>> get(
      [GetOptions? options]) async {
    final data = _firestore._collections[_collectionPath]?[id];
    return _FakeDocSnapshot(id, data);
  }

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class _FakeDocSnapshot implements DocumentSnapshot<Map<String, dynamic>> {
  _FakeDocSnapshot(this.id, this._data);

  @override
  final String id;
  final Map<String, dynamic>? _data;

  @override
  bool get exists => _data != null;

  @override
  Map<String, dynamic>? data() => _data;

  @override
  dynamic get(Object field) => _data?[field as String];

  @override
  dynamic operator [](Object field) => _data?[field as String];

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}
