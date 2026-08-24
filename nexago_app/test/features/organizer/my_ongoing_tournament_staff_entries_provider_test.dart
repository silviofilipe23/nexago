// Cobertura de myOngoingTournamentStaffEntriesProvider
// (lib/features/organizer/domain/tournament_staff/my_tournament_staff_providers.dart).
//
// O provider privado `_staffTournamentDetailProvider` (mesmo arquivo) agora
// resolve o Firestore via `ref.watch(firestoreProvider)` em vez de
// `FirebaseFirestore.instance` direto — o mesmo padrão de DI usado em ~40
// outros providers do app (ver lib/core/firebase/firebase_providers.dart).
// Isso permite sobrescrever `firestoreProvider` com um fake neste teste e
// exercitar as duas branches centrais da regra de negócio:
//   1) staff de torneio terminal (completed/ended, cancelled mapeia pra
//      ended) → excluído da lista
//   2) staff de torneio não-terminal (aberto/ao vivo) → mantido
//
// O fake de Firestore abaixo implementa só o suficiente para
// `loadTournamentDetailById` (lib/features/tournaments/data/
// tournament_detail_lookup.dart): `collection('tournaments').doc(id).get()`.
// Não usamos `fake_cloud_firestore` porque o pacote não está nas
// dependências do projeto (ver test/features/athlete/widgets/
// booking_details_team_providers_test.dart para o mesmo padrão de fake
// manual via `implements` + `noSuchMethod`).
//
// A regra pura (`isTournamentTerminal`) continua coberta isoladamente em
// tournament_listing_status_test.dart, incluindo o mapeamento
// cancelled → ended.
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/auth/auth_providers.dart';
import 'package:nexago_app/core/firebase/firebase_providers.dart';
import 'package:nexago_app/features/organizer/domain/tournament_staff/my_tournament_staff_providers.dart';
import 'package:nexago_app/features/organizer/domain/tournament_staff/tournament_staff_models.dart';

ProviderContainer _buildContainer(
  List<MyTournamentStaffEntry> entries, {
  Map<String, Map<String, dynamic>> tournamentDocs = const {},
}) {
  return ProviderContainer(
    overrides: [
      authProvider.overrideWith((ref) => Stream.value(null)),
      myTournamentStaffEntriesProvider.overrideWith(
        (ref) => Stream.value(entries),
      ),
      firestoreProvider.overrideWithValue(
        _FakeFirestoreForTournamentDetail(tournamentDocs),
      ),
    ],
  );
}

/// Drena a fila de microtasks pendentes — suficiente pra deixar
/// `loadTournamentDetailById` (que só faz `await ... .get()`, sem Timer)
/// terminar antes da próxima leitura do container.
Future<void> _settle() async {
  for (var i = 0; i < 20; i++) {
    await Future<void>.value();
  }
}

void main() {
  group('myOngoingTournamentStaffEntriesProvider', () {
    test('lista de staff vazia → resultado vazio', () async {
      final container = _buildContainer(const []);
      addTearDown(container.dispose);

      await container.read(myTournamentStaffEntriesProvider.future);
      final result = container.read(myOngoingTournamentStaffEntriesProvider);

      expect(result, isEmpty);
    });

    test(
      'entrada mantida quando o detalhe do torneio ainda não resolveu '
      '(otimista — evita flicker enquanto carrega)',
      () async {
        const entry = MyTournamentStaffEntry(
          tournamentId: 't1',
          role: TournamentStaffRole.manager,
          status: 'active',
          tournamentName: 'Torneio X',
        );
        final container = _buildContainer(const [entry]);
        addTearDown(container.dispose);

        await container.read(myTournamentStaffEntriesProvider.future);
        final result = container.read(myOngoingTournamentStaffEntriesProvider);

        expect(result, [entry]);
      },
    );

    test(
      'entrada excluída quando o torneio já é terminal (ended)',
      () async {
        const entry = MyTournamentStaffEntry(
          tournamentId: 't-ended',
          role: TournamentStaffRole.manager,
          status: 'active',
          tournamentName: 'Torneio Encerrado',
        );
        final container = _buildContainer(
          const [entry],
          tournamentDocs: const {
            't-ended': {'status': 'ended'},
          },
        );
        addTearDown(container.dispose);

        await container.read(myTournamentStaffEntriesProvider.future);
        // Dispara a leitura de `_staffTournamentDetailProvider` (ainda em
        // loading no instante desta chamada) e espera o Future resolver.
        container.read(myOngoingTournamentStaffEntriesProvider);
        await _settle();

        final result = container.read(myOngoingTournamentStaffEntriesProvider);

        expect(result, isEmpty);
      },
    );

    test(
      'entrada mantida quando o torneio está aberto (não-terminal)',
      () async {
        const entry = MyTournamentStaffEntry(
          tournamentId: 't-open',
          role: TournamentStaffRole.manager,
          status: 'active',
          tournamentName: 'Torneio Aberto',
        );
        final container = _buildContainer(
          const [entry],
          tournamentDocs: const {
            't-open': {'status': 'open'},
          },
        );
        addTearDown(container.dispose);

        await container.read(myTournamentStaffEntriesProvider.future);
        container.read(myOngoingTournamentStaffEntriesProvider);
        await _settle();

        final result = container.read(myOngoingTournamentStaffEntriesProvider);

        expect(result, [entry]);
      },
    );
  });
}

/// Fake mínimo de [FirebaseFirestore] pra `loadTournamentDetailById`:
/// resolve `collection('tournaments').doc(id).get()` a partir de um mapa
/// pré-carregado; qualquer id fora do mapa (ou o caminho legado em
/// `artifacts/...`) devolve um doc inexistente.
class _FakeFirestoreForTournamentDetail implements FirebaseFirestore {
  _FakeFirestoreForTournamentDetail(this._docsById);

  final Map<String, Map<String, dynamic>> _docsById;

  @override
  CollectionReference<Map<String, dynamic>> collection(String collectionPath) {
    if (collectionPath == 'tournaments') {
      return _FakeTournamentsCollection(_docsById);
    }
    throw UnimplementedError(
      'collection "$collectionPath" não é faqueada neste teste',
    );
  }

  @override
  DocumentReference<Map<String, dynamic>> doc([String? path]) {
    // Caminho legado (`artifacts/.../tournaments/{id}`) — sempre "não
    // existe" neste fake; os testes atuais não precisam do fallback.
    return _FakeTournamentDocRef(path ?? '', null);
  }

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class _FakeTournamentsCollection
    implements CollectionReference<Map<String, dynamic>> {
  _FakeTournamentsCollection(this._docsById);

  final Map<String, Map<String, dynamic>> _docsById;

  @override
  DocumentReference<Map<String, dynamic>> doc([String? path]) {
    final id = path ?? '';
    return _FakeTournamentDocRef(id, _docsById[id]);
  }

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class _FakeTournamentDocRef implements DocumentReference<Map<String, dynamic>> {
  _FakeTournamentDocRef(this._id, this._data);

  final String _id;
  final Map<String, dynamic>? _data;

  @override
  String get id => _id;

  @override
  Future<DocumentSnapshot<Map<String, dynamic>>> get([
    GetOptions? options,
  ]) async {
    return _FakeTournamentDocSnapshot(_id, _data);
  }

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class _FakeTournamentDocSnapshot
    implements DocumentSnapshot<Map<String, dynamic>> {
  _FakeTournamentDocSnapshot(this.id, this._data);

  @override
  final String id;
  final Map<String, dynamic>? _data;

  @override
  bool get exists => _data != null;

  @override
  Map<String, dynamic>? data() => _data;

  @override
  dynamic get(Object field) => _data?[field];

  @override
  dynamic operator [](Object field) => _data?[field];

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}
