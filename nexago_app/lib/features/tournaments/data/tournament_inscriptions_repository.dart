import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/auth/auth_providers.dart';
import '../../arenas/domain/arenas_providers.dart';
import 'nexago_artifacts_paths.dart';

/// Contagem de inscrições (equipes/vagas) por `categoryId` em um torneio.
typedef TournamentCategoryEnrollmentCounts = Map<String, int>;

/// `categoryId` → `registrationId` das inscrições do atleta no torneio.
typedef TournamentUserRegistrationsByCategory = Map<String, String>;

/// `categoryId` → `teamId` das inscrições do atleta no torneio.
typedef TournamentUserTeamIdsByCategory = Map<String, String>;

/// Agrega inscrições confirmadas (`isPaid == true`) por `categoryId`.
TournamentCategoryEnrollmentCounts countInscriptionsByCategoryData(
  Iterable<Map<String, dynamic>> rows,
) {
  final counts = <String, int>{};
  for (final data in rows) {
    if (data['isPaid'] != true) continue;
    final categoryId = (data['categoryId'] as String?)?.trim() ?? '';
    if (categoryId.isEmpty) continue;
    counts[categoryId] = (counts[categoryId] ?? 0) + 1;
  }
  return counts;
}

/// Agrega documentos de `artifacts/{projectId}/public/data/inscriptions`.
TournamentCategoryEnrollmentCounts countInscriptionsByCategory(
  Iterable<QueryDocumentSnapshot<Map<String, dynamic>>> docs,
) {
  return countInscriptionsByCategoryData(docs.map((d) => d.data()));
}

/// Mapeia inscrições do atleta por `categoryId`. Pure helper para testes.
TournamentUserRegistrationsByCategory userRegistrationsByCategoryData(
  Iterable<({
    String registrationId,
    Map<String, dynamic> inscription,
    Map<String, dynamic>? team,
  })> rows,
  String uid,
) {
  final id = uid.trim();
  if (id.isEmpty) return const <String, String>{};
  final result = <String, String>{};
  for (final row in rows) {
    final team = row.team;
    if (team == null) continue;
    final p1 = (team['player1Id'] as String?)?.trim();
    final p2 = (team['player2Id'] as String?)?.trim();
    if (p1 != id && p2 != id) continue;
    final categoryId =
        (row.inscription['categoryId'] as String?)?.trim() ?? '';
    final registrationId = row.registrationId.trim();
    if (categoryId.isEmpty || registrationId.isEmpty) continue;
    result[categoryId] = registrationId;
  }
  return result;
}

/// Mapeia times do atleta por `categoryId`. Pure helper para testes.
TournamentUserTeamIdsByCategory userTeamIdsByCategoryData(
  Iterable<({
    String registrationId,
    Map<String, dynamic> inscription,
    Map<String, dynamic>? team,
  })> rows,
  String uid,
) {
  final id = uid.trim();
  if (id.isEmpty) return const <String, String>{};
  final result = <String, String>{};
  for (final row in rows) {
    final team = row.team;
    if (team == null) continue;
    final p1 = (team['player1Id'] as String?)?.trim();
    final p2 = (team['player2Id'] as String?)?.trim();
    if (p1 != id && p2 != id) continue;
    final categoryId =
        (row.inscription['categoryId'] as String?)?.trim() ?? '';
    final teamId = (row.inscription['teamId'] as String?)?.trim() ?? '';
    if (categoryId.isEmpty || teamId.isEmpty) continue;
    result[categoryId] = teamId;
  }
  return result;
}

/// Reduz pares (inscrição, equipe) ao conjunto de `categoryId`s onde o atleta
/// `uid` participa (player1 ou player2). Pure helper para testes.
Set<String> registeredCategoryIdsForUserData(
  Iterable<({Map<String, dynamic> inscription, Map<String, dynamic>? team})>
      rows,
  String uid,
) {
  final id = uid.trim();
  if (id.isEmpty) return const <String>{};
  final result = <String>{};
  for (final row in rows) {
    final team = row.team;
    if (team == null) continue;
    final p1 = (team['player1Id'] as String?)?.trim();
    final p2 = (team['player2Id'] as String?)?.trim();
    if (p1 != id && p2 != id) continue;
    final categoryId =
        (row.inscription['categoryId'] as String?)?.trim() ?? '';
    if (categoryId.isEmpty) continue;
    result.add(categoryId);
  }
  return result;
}

class TournamentInscriptionsRepository {
  TournamentInscriptionsRepository(this._firestore);

  final FirebaseFirestore _firestore;

  CollectionReference<Map<String, dynamic>> get _inscriptions =>
      _firestore.collection(NexagoArtifactsPaths.inscriptionsCollection());

  CollectionReference<Map<String, dynamic>> get _teams =>
      _firestore.collection(NexagoArtifactsPaths.teamsCollection());

  Stream<TournamentCategoryEnrollmentCounts> watchEnrollmentCountsByCategory(
    String tournamentId,
  ) {
    final id = tournamentId.trim();
    if (id.isEmpty) return Stream.value(const {});

    return _inscriptions
        .where('tournamentId', isEqualTo: id)
        .snapshots()
        .map((snap) => countInscriptionsByCategory(snap.docs));
  }

  /// Inscrições do atleta no torneio: `categoryId` → `registrationId`.
  Stream<TournamentUserRegistrationsByCategory> watchUserRegistrationsByCategory({
    required String tournamentId,
    required String uid,
  }) {
    final tid = tournamentId.trim();
    final athleteUid = uid.trim();
    if (tid.isEmpty || athleteUid.isEmpty) {
      return Stream.value(const <String, String>{});
    }

    return _inscriptions
        .where('tournamentId', isEqualTo: tid)
        .snapshots()
        .asyncMap((snap) async {
      final rows = <
          ({
            String registrationId,
            Map<String, dynamic> inscription,
            Map<String, dynamic>? team,
          })>[];
      for (final doc in snap.docs) {
        final data = doc.data();
        final teamId = (data['teamId'] as String?)?.trim() ?? '';
        if (teamId.isEmpty) continue;
        final teamSnap = await _teams.doc(teamId).get();
        rows.add((
          registrationId: doc.id,
          inscription: data,
          team: teamSnap.exists ? teamSnap.data() : null,
        ));
      }
      return userRegistrationsByCategoryData(rows, athleteUid);
    });
  }

  /// Conjunto de `categoryId`s do torneio em que `uid` já está inscrito.
  Stream<Set<String>> watchRegisteredCategoryIdsForUser({
    required String tournamentId,
    required String uid,
  }) {
    return watchUserRegistrationsByCategory(
      tournamentId: tournamentId,
      uid: uid,
    ).map((map) => map.keys.toSet());
  }

  /// Times do atleta no torneio: `categoryId` → `teamId`.
  Stream<TournamentUserTeamIdsByCategory> watchUserTeamIdsByCategory({
    required String tournamentId,
    required String uid,
  }) {
    final tid = tournamentId.trim();
    final athleteUid = uid.trim();
    if (tid.isEmpty || athleteUid.isEmpty) {
      return Stream.value(const <String, String>{});
    }

    return _inscriptions
        .where('tournamentId', isEqualTo: tid)
        .snapshots()
        .asyncMap((snap) async {
      final rows = <
          ({
            String registrationId,
            Map<String, dynamic> inscription,
            Map<String, dynamic>? team,
          })>[];
      for (final doc in snap.docs) {
        final data = doc.data();
        final teamIdFromInscription = (data['teamId'] as String?)?.trim() ?? '';
        if (teamIdFromInscription.isEmpty) continue;
        final teamSnap = await _teams.doc(teamIdFromInscription).get();
        final inscription = Map<String, dynamic>.from(data);
        if (teamSnap.exists) {
          inscription['teamId'] = teamSnap.id;
        }
        rows.add((
          registrationId: doc.id,
          inscription: inscription,
          team: teamSnap.exists ? teamSnap.data() : null,
        ));
      }
      return userTeamIdsByCategoryData(rows, athleteUid);
    });
  }
}

final tournamentInscriptionsRepositoryProvider =
    Provider<TournamentInscriptionsRepository>((ref) {
  return TournamentInscriptionsRepository(ref.watch(firestoreProvider));
});

final tournamentCategoryEnrollmentCountsProvider = StreamProvider.autoDispose
    .family<TournamentCategoryEnrollmentCounts, String>((ref, tournamentId) {
  return ref
      .watch(tournamentInscriptionsRepositoryProvider)
      .watchEnrollmentCountsByCategory(tournamentId);
});

Stream<TournamentUserRegistrationsByCategory> _userRegistrationsByCategoryStream(
  Ref ref,
  String tournamentId,
) {
  final auth = ref.watch(authProvider);
  if (auth.isLoading) {
    return const Stream<TournamentUserRegistrationsByCategory>.empty();
  }
  final uid = auth.valueOrNull?.uid.trim() ?? '';
  if (uid.isEmpty) return Stream.value(const <String, String>{});
  return ref
      .watch(tournamentInscriptionsRepositoryProvider)
      .watchUserRegistrationsByCategory(
        tournamentId: tournamentId,
        uid: uid,
      );
}

/// Inscrições do usuário autenticado no torneio (`categoryId` → `registrationId`).
final tournamentUserRegistrationsByCategoryProvider =
    StreamProvider.autoDispose
        .family<TournamentUserRegistrationsByCategory, String>(
  (ref, tournamentId) =>
      _userRegistrationsByCategoryStream(ref, tournamentId),
);

/// Categorias do torneio em que o usuário autenticado já está inscrito.
final tournamentUserRegisteredCategoryIdsProvider =
    StreamProvider.autoDispose.family<Set<String>, String>((ref, tournamentId) {
  return _userRegistrationsByCategoryStream(ref, tournamentId)
      .map((map) => map.keys.toSet());
});

Stream<TournamentUserTeamIdsByCategory> _userTeamIdsByCategoryStream(
  Ref ref,
  String tournamentId,
) {
  final auth = ref.watch(authProvider);
  if (auth.isLoading) {
    return const Stream<TournamentUserTeamIdsByCategory>.empty();
  }
  final uid = auth.valueOrNull?.uid.trim() ?? '';
  if (uid.isEmpty) return Stream.value(const <String, String>{});
  return ref
      .watch(tournamentInscriptionsRepositoryProvider)
      .watchUserTeamIdsByCategory(
        tournamentId: tournamentId,
        uid: uid,
      );
}

/// Times do usuário autenticado no torneio (`categoryId` → `teamId`).
final tournamentUserTeamIdsByCategoryProvider = StreamProvider.autoDispose
    .family<TournamentUserTeamIdsByCategory, String>(
  (ref, tournamentId) => _userTeamIdsByCategoryStream(ref, tournamentId),
);

/// Inscrições confirmadas na coleção para a categoria (`categoryId` / `categoryName`).
int inscriptionCountForCategory(
  TournamentCategoryEnrollmentCounts counts,
  String categoryId,
) {
  final key = categoryId.trim();
  if (key.isEmpty) return 0;
  return counts[key] ?? 0;
}
