// Testes de regressão do bug "equipe da reserva não mostrando os atletas
// confirmados": `BookingInviteService.acceptInvite()` só grava UM par
// guestAthleteId/guestAthleteName no doc de `arenaBookings` — a partir do 2º
// convite aceito, o convidado só existe em `bookingInvites`. O provider
// `bookingDetailsTeamProvider` precisa cair no fallback (igual ao provider
// irmão `myBookingGuestDisplaysProvider`) para não sumir com gente da
// equipe.
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/auth/auth_providers.dart';
import 'package:nexago_app/core/firebase/firebase_providers.dart';
import 'package:nexago_app/features/arenas/domain/booking_providers.dart';
import 'package:nexago_app/features/athlete/domain/athlete_profile.dart';
import 'package:nexago_app/features/athlete/domain/athlete_profile_providers.dart';
import 'package:nexago_app/features/athlete/presentation/widgets/booking_details/booking_details_team_providers.dart';
import 'package:nexago_app/features/athlete/presentation/widgets/booking_details/booking_details_view_model.dart';

const _bookingId = 'booking1';

/// Monta um [ProviderContainer] com os providers de rede sobrescritos por
/// fakes, sem depender de um usuário logado (o dono da reserva vem de
/// `ownerAthleteId` no próprio doc, evitando ter que fakear FirebaseAuth
/// neste arquivo).
ProviderContainer _buildContainer({
  required Map<String, dynamic> bookingData,
  List<Map<String, dynamic>> acceptedInvites = const [],
  Map<String, AthleteProfile?> profilesByUid = const {},
  void Function(String path)? onCollection,
}) {
  final firestore = _FakeFirestoreForInvites(
    acceptedInvites
        .map((data) => _FakeQueryDocSnapshot(data))
        .toList(growable: false),
    onCollection: onCollection,
  );

  return ProviderContainer(
    overrides: [
      authProvider.overrideWith((ref) => Stream.value(null)),
      arenaBookingDocProvider.overrideWith(
        (ref, id) => Stream.value(_FakeDocSnapshot(bookingData)),
      ),
      athleteProfileByIdProvider.overrideWith(
        (ref, uid) => Stream.value(profilesByUid[uid]),
      ),
      firestoreProvider.overrideWithValue(firestore),
    ],
  );
}

/// `bookingDetailsTeamProvider` é `autoDispose`: sem um listener ativo, o
/// container pode agendar a destruição do provider no meio das múltiplas
/// esperas assíncronas encadeadas (`ref.watch(...future)` em cascata) antes
/// do `Future` resolver — dando `Bad state: ... was disposed during loading
/// state`. Mantemos um listener vivo durante a leitura para evitar a corrida.
Future<BookingDetailsTeamState> _readTeam(
  ProviderContainer container,
  String bookingId,
) async {
  final provider = bookingDetailsTeamProvider(bookingId);
  final sub = container.listen(provider, (_, __) {});
  try {
    return await container.read(provider.future);
  } finally {
    sub.close();
  }
}

void main() {
  test(
    'confirmedParticipants == 1 (só o dono): nenhum convidado, 3 vagas abertas',
    () async {
      final container = _buildContainer(
        bookingData: const {
          'ownerAthleteId': 'owner1',
          'confirmedParticipants': 1,
        },
      );
      addTearDown(container.dispose);

      final state = await _readTeam(container, _bookingId);

      expect(state.confirmedCount, 1);
      expect(state.totalSlots, kBookingTeamSlots);
      expect(state.members.length, kBookingTeamSlots);
      expect(state.members.first.isOrganizer, isTrue);
      final rest = state.members.skip(1).toList();
      expect(rest, hasLength(3));
      expect(rest.every((m) => m.isEmptySlot), isTrue);
      expect(rest.every((m) => !m.isConfirmed), isTrue);
    },
  );

  test(
    'confirmedParticipants == 2 com guestAthleteId no doc: convidado aparece '
    'sem precisar do fallback (caminho já existente não quebra)',
    () async {
      final firestoreCalls = <String>[];
      final container = _buildContainer(
        bookingData: const {
          'ownerAthleteId': 'owner1',
          'guestAthleteId': 'guest1',
          'guestAthleteName': 'Bob Guest',
          'confirmedParticipants': 2,
        },
        onCollection: firestoreCalls.add,
      );
      addTearDown(container.dispose);

      final state = await _readTeam(container, _bookingId);

      expect(state.confirmedCount, 2);
      expect(state.members.length, kBookingTeamSlots);
      final guestMembers = state.members
          .where((m) => !m.isOrganizer && !m.isEmptySlot)
          .toList();
      expect(guestMembers, hasLength(1));
      expect(guestMembers.single.displayName, 'Bob Guest');
      expect(guestMembers.single.isConfirmed, isTrue);
      expect(state.members.where((m) => m.isEmptySlot), hasLength(2));
      // Com só 1 convidado esperado (confirmedCount - 1 == 1), o fallback de
      // `bookingInvites` não deve ser consultado.
      expect(firestoreCalls, isEmpty);
    },
  );

  test(
    'confirmedParticipants == 3 mas só 1 guestAthleteId no doc (bug): '
    'fallback via bookingInvites completa a lista com os 2 convidados',
    () async {
      final firestoreCalls = <String>[];
      final container = _buildContainer(
        bookingData: const {
          'ownerAthleteId': 'owner1',
          'guestAthleteId': 'guest1',
          'guestAthleteName': 'Bob Guest',
          'confirmedParticipants': 3,
        },
        acceptedInvites: const [
          {
            'bookingId': _bookingId,
            'status': 'accepted',
            'acceptedByUid': 'guest2',
          },
        ],
        profilesByUid: const {
          'guest2': AthleteProfile(
            id: 'guest2',
            name: 'Carla Dias',
            sport: '',
            level: '',
            city: '',
          ),
        },
        onCollection: firestoreCalls.add,
      );
      addTearDown(container.dispose);

      final state = await _readTeam(container, _bookingId);

      expect(state.confirmedCount, 3);
      final guestMembers = state.members
          .where((m) => !m.isOrganizer && !m.isEmptySlot)
          .toList();
      expect(guestMembers, hasLength(2));
      expect(
        guestMembers.map((m) => m.displayName).toSet(),
        {'Bob Guest', 'Carla Dias'},
      );
      expect(state.members.where((m) => m.isEmptySlot), hasLength(1));
      // Fallback consultado exatamente uma vez.
      expect(firestoreCalls, ['bookingInvites']);
    },
  );

  test(
    'convidado do fallback não duplica se já aparecer nos campos do doc '
    '(dedupe por uid)',
    () async {
      final container = _buildContainer(
        bookingData: const {
          'ownerAthleteId': 'owner1',
          'guestAthleteId': 'guest1',
          'guestAthleteName': 'Bob Guest',
          'confirmedParticipants': 3,
        },
        acceptedInvites: const [
          // Mesmo guest1 do doc reaparece em bookingInvites (cenário real:
          // o convite aceito original também está lá) + guest2 novo.
          {
            'bookingId': _bookingId,
            'status': 'accepted',
            'acceptedByUid': 'guest1',
          },
          {
            'bookingId': _bookingId,
            'status': 'accepted',
            'acceptedByUid': 'guest2',
          },
        ],
      );
      addTearDown(container.dispose);

      final state = await _readTeam(container, _bookingId);

      final guestMembers = state.members
          .where((m) => !m.isOrganizer && !m.isEmptySlot)
          .toList();
      // Sem dedupe apareceriam 3 (Bob Guest duplicado); com dedupe, 2.
      expect(guestMembers, hasLength(2));
      expect(
        guestMembers.where((m) => m.displayName == 'Bob Guest'),
        hasLength(1),
      );
    },
  );
}

class _FakeDocSnapshot implements DocumentSnapshot<Map<String, dynamic>> {
  _FakeDocSnapshot(this._data);

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

class _FakeQueryDocSnapshot
    implements QueryDocumentSnapshot<Map<String, dynamic>> {
  _FakeQueryDocSnapshot(this._data);

  final Map<String, dynamic> _data;

  @override
  Map<String, dynamic> data() => _data;

  @override
  bool get exists => true;

  @override
  dynamic get(Object field) => _data[field];

  @override
  dynamic operator [](Object field) => _data[field];

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class _FakeQuerySnapshot implements QuerySnapshot<Map<String, dynamic>> {
  _FakeQuerySnapshot(this.docs);

  @override
  final List<QueryDocumentSnapshot<Map<String, dynamic>>> docs;

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

/// Fake de `Query`/`CollectionReference<bookingInvites>`: ignora os
/// filtros (`where`) e devolve sempre os docs pré-configurados pelo teste —
/// o objetivo aqui é validar o fallback do provider, não o motor de queries
/// do Firestore.
class _FakeInvitesQuery implements CollectionReference<Map<String, dynamic>> {
  _FakeInvitesQuery(this._docs);

  final List<QueryDocumentSnapshot<Map<String, dynamic>>> _docs;

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
  }) =>
      this;

  @override
  Query<Map<String, dynamic>> limit(int limit) => this;

  @override
  Future<QuerySnapshot<Map<String, dynamic>>> get([GetOptions? options]) async {
    return _FakeQuerySnapshot(_docs);
  }

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class _FakeFirestoreForInvites implements FirebaseFirestore {
  _FakeFirestoreForInvites(this._invitesDocs, {this.onCollection});

  final List<QueryDocumentSnapshot<Map<String, dynamic>>> _invitesDocs;
  final void Function(String path)? onCollection;

  @override
  CollectionReference<Map<String, dynamic>> collection(String collectionPath) {
    onCollection?.call(collectionPath);
    if (collectionPath == 'bookingInvites') {
      return _FakeInvitesQuery(_invitesDocs);
    }
    throw UnimplementedError(
      'collection "$collectionPath" não é faqueada neste teste',
    );
  }

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}
