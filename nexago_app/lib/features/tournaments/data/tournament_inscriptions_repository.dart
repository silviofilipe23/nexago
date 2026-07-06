import 'dart:math';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/auth/auth_providers.dart';
import 'package:nexago_app/core/firebase/firebase_providers.dart';
import 'nexago_artifacts_paths.dart';

/// Contagem de inscrições (equipes/vagas) por `categoryId` em um torneio.
typedef TournamentCategoryEnrollmentCounts = Map<String, int>;

/// Inscrição do atleta em uma categoria do torneio.
class UserCategoryRegistration {
  const UserCategoryRegistration({
    required this.registrationId,
    required this.isPaid,
  });

  final String registrationId;
  final bool isPaid;

  @override
  bool operator ==(Object other) {
    return other is UserCategoryRegistration &&
        other.registrationId == registrationId &&
        other.isPaid == isPaid;
  }

  @override
  int get hashCode => Object.hash(registrationId, isPaid);
}

/// `categoryId` → inscrição do atleta no torneio.
typedef TournamentUserRegistrationsByCategory =
    Map<String, UserCategoryRegistration>;

/// `categoryId` → `teamId` das inscrições do atleta no torneio.
typedef TournamentUserTeamIdsByCategory = Map<String, String>;

/// Par inscrição + equipe para fluxo do organizador.
typedef OrganizerInscriptionWithTeam = ({
  String registrationId,
  Map<String, dynamic> inscription,
  Map<String, dynamic>? team,
});

/// Agrega inscrições confirmadas (`isPaid == true`) por `categoryId`.
TournamentCategoryEnrollmentCounts countInscriptionsByCategoryData(
  Iterable<Map<String, dynamic>> rows,
) {
  final counts = <String, int>{};
  for (final data in rows) {
    if (data['isPaid'] != true) continue;
    if (data['waitlist'] == true) continue; // fila não conta como confirmada
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

/// Mapeia inscrições do atleta em fila de espera por `categoryId`.
Map<String, bool> userWaitlistByCategoryData(
  Iterable<({
    String registrationId,
    Map<String, dynamic> inscription,
    Map<String, dynamic>? team,
  })> rows,
  String uid,
) {
  final id = uid.trim();
  if (id.isEmpty) return const <String, bool>{};
  final result = <String, bool>{};
  for (final row in rows) {
    if (!athleteIsInscriptionMember(
      uid: id,
      inscription: row.inscription,
      team: row.team,
    )) {
      continue;
    }
    if (row.inscription['waitlist'] != true) continue;
    final categoryId =
        (row.inscription['categoryId'] as String?)?.trim() ?? '';
    if (categoryId.isEmpty) continue;
    result[categoryId] = true;
  }
  return result;
}

/// Atleta participa da inscrição (dupla com equipe ou solo pendente).
bool athleteIsInscriptionMember({
  required String uid,
  required Map<String, dynamic> inscription,
  Map<String, dynamic>? team,
}) {
  final id = uid.trim();
  if (id.isEmpty) return false;
  if (team != null) {
    final p1 = (team['player1Id'] as String?)?.trim();
    final p2 = (team['player2Id'] as String?)?.trim();
    return p1 == id || p2 == id;
  }
  final player1Id = (inscription['player1Id'] as String?)?.trim();
  if (player1Id == id) return true;
  final participants = inscription['participantUids'];
  if (participants is List) {
    return participants
        .map((p) => p.toString().trim())
        .where((p) => p.isNotEmpty)
        .contains(id);
  }
  return false;
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
  if (id.isEmpty) return const <String, UserCategoryRegistration>{};
  final result = <String, UserCategoryRegistration>{};
  for (final row in rows) {
    if (!athleteIsInscriptionMember(
      uid: id,
      inscription: row.inscription,
      team: row.team,
    )) {
      continue;
    }
    final categoryId =
        (row.inscription['categoryId'] as String?)?.trim() ?? '';
    final registrationId = row.registrationId.trim();
    if (categoryId.isEmpty || registrationId.isEmpty) continue;
    result[categoryId] = UserCategoryRegistration(
      registrationId: registrationId,
      isPaid: row.inscription['isPaid'] == true,
    );
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
    if (!athleteIsInscriptionMember(
      uid: id,
      inscription: row.inscription,
      team: row.team,
    )) {
      continue;
    }
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

  Future<Map<String, Map<String, dynamic>>> _batchLoadTeams(
    Set<String> teamIds,
  ) async {
    final teams = <String, Map<String, dynamic>>{};
    final ids = teamIds.where((id) => id.trim().isNotEmpty).toList();
    for (var i = 0; i < ids.length; i += 30) {
      final chunk = ids.sublist(i, min(i + 30, ids.length));
      final snap = await _teams.where(FieldPath.documentId, whereIn: chunk).get();
      for (final doc in snap.docs) {
        teams[doc.id] = doc.data();
      }
    }
    return teams;
  }

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

  /// Todas as inscrições do torneio com equipe resolvida.
  Stream<List<OrganizerInscriptionWithTeam>> watchByTournament(
    String tournamentId,
  ) {
    final tid = tournamentId.trim();
    if (tid.isEmpty) return Stream.value(const []);

    return _inscriptions
        .where('tournamentId', isEqualTo: tid)
        .snapshots()
        .asyncMap((snap) async {
      final teamIds = <String>{};
      for (final doc in snap.docs) {
        final teamId = (doc.data()['teamId'] as String?)?.trim() ?? '';
        if (teamId.isNotEmpty) teamIds.add(teamId);
      }
      final teamsById = await _batchLoadTeams(teamIds);
      return snap.docs
          .map((doc) {
            final data = doc.data();
            final teamId = (data['teamId'] as String?)?.trim() ?? '';
            return (
              registrationId: doc.id,
              inscription: data,
              team: teamId.isNotEmpty ? teamsById[teamId] : null,
            );
          })
          .toList();
    });
  }

  /// Inscrições do atleta no torneio: `categoryId` → inscrição.
  Stream<TournamentUserRegistrationsByCategory> watchUserRegistrationsByCategory({
    required String tournamentId,
    required String uid,
  }) {
    final tid = tournamentId.trim();
    final athleteUid = uid.trim();
    if (tid.isEmpty || athleteUid.isEmpty) {
      return Stream.value(const <String, UserCategoryRegistration>{});
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
        Map<String, dynamic>? team;
        if (teamId.isNotEmpty) {
          final teamSnap = await _teams.doc(teamId).get();
          team = teamSnap.exists ? teamSnap.data() : null;
        }
        rows.add((
          registrationId: doc.id,
          inscription: data,
          team: team,
        ));
      }
      return userRegistrationsByCategoryData(rows, athleteUid);
    });
  }

  /// Fila de espera do atleta no torneio: `categoryId` → `true`.
  Stream<Map<String, bool>> watchUserWaitlistByCategory({
    required String tournamentId,
    required String uid,
  }) {
    final tid = tournamentId.trim();
    final athleteUid = uid.trim();
    if (tid.isEmpty || athleteUid.isEmpty) {
      return Stream.value(const <String, bool>{});
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
        Map<String, dynamic>? team;
        if (teamId.isNotEmpty) {
          final teamSnap = await _teams.doc(teamId).get();
          team = teamSnap.exists ? teamSnap.data() : null;
        }
        rows.add((
          registrationId: doc.id,
          inscription: data,
          team: team,
        ));
      }
      return userWaitlistByCategoryData(rows, athleteUid);
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

  /// Inscrições do torneio com equipe resolvida, filtradas por categoria.
  Stream<List<OrganizerInscriptionWithTeam>> watchByTournamentAndCategory({
    required String tournamentId,
    required String categoryId,
  }) {
    final tid = tournamentId.trim();
    final cid = categoryId.trim();
    if (tid.isEmpty || cid.isEmpty) return Stream.value(const []);

    return _inscriptions
        .where('tournamentId', isEqualTo: tid)
        .where('categoryId', isEqualTo: cid)
        .snapshots()
        .asyncMap((snap) async {
      final rows = <OrganizerInscriptionWithTeam>[];
      for (final doc in snap.docs) {
        final data = doc.data();
        final teamId = (data['teamId'] as String?)?.trim() ?? '';
        Map<String, dynamic>? team;
        if (teamId.isNotEmpty) {
          final teamSnap = await _teams.doc(teamId).get();
          if (teamSnap.exists) team = teamSnap.data();
        }
        rows.add((
          registrationId: doc.id,
          inscription: data,
          team: team,
        ));
      }
      return rows;
    });
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
  if (uid.isEmpty) return Stream.value(const <String, UserCategoryRegistration>{});
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

Stream<Map<String, bool>> _userWaitlistByCategoryStream(
  Ref ref,
  String tournamentId,
) {
  final auth = ref.watch(authProvider);
  if (auth.isLoading) {
    return const Stream<Map<String, bool>>.empty();
  }
  final uid = auth.valueOrNull?.uid.trim() ?? '';
  if (uid.isEmpty) return Stream.value(const <String, bool>{});
  return ref
      .watch(tournamentInscriptionsRepositoryProvider)
      .watchUserWaitlistByCategory(
        tournamentId: tournamentId,
        uid: uid,
      );
}

/// Fila de espera do usuário autenticado no torneio (`categoryId` → `true`).
final tournamentUserWaitlistByCategoryProvider = StreamProvider.autoDispose
    .family<Map<String, bool>, String>(
  (ref, tournamentId) => _userWaitlistByCategoryStream(ref, tournamentId),
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
