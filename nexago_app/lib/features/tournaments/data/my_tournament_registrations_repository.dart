import 'dart:math';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/auth/auth_providers.dart';
import '../domain/tournament_detail_model.dart';
import '../domain/tournament_discovery_labels.dart';
import '../domain/tournament_discovery_models.dart';
import 'nexago_artifacts_paths.dart';
import 'tournament_document_mapper.dart';

class MyTournamentRegistrationsRepository {
  MyTournamentRegistrationsRepository(this._firestore);

  final FirebaseFirestore _firestore;

  CollectionReference<Map<String, dynamic>> get _inscriptions =>
      _firestore.collection(NexagoArtifactsPaths.inscriptionsCollection());

  CollectionReference<Map<String, dynamic>> get _teams =>
      _firestore.collection(NexagoArtifactsPaths.teamsCollection());

  Stream<List<MyTournamentRegistration>> watchForUser(String uid) {
    if (uid.isEmpty) return Stream.value(const []);

    final indexed = _inscriptions
        .where('participantUids', arrayContains: uid)
        .snapshots()
        .asyncMap(_mapIndexedRegistrations);

    final legacy = _inscriptions.snapshots().asyncMap(
          (snap) => _mapLegacyRegistrations(snap, uid),
        );

    return indexed.asyncExpand((indexedRows) {
      return legacy.map((legacyRows) {
        final byId = <String, MyTournamentRegistration>{
          for (final row in indexedRows) row.registrationId: row,
          for (final row in legacyRows) row.registrationId: row,
        };
        final merged = byId.values.toList()
          ..sort((a, b) => a.tournamentName.compareTo(b.tournamentName));
        return merged;
      });
    });
  }

  Future<List<MyTournamentRegistration>> _mapIndexedRegistrations(
    QuerySnapshot<Map<String, dynamic>> snap,
  ) {
    return _mapRegistrationDocs(snap.docs);
  }

  Future<List<MyTournamentRegistration>> _mapLegacyRegistrations(
    QuerySnapshot<Map<String, dynamic>> snap,
    String uid,
  ) async {
    final legacyDocs = <QueryDocumentSnapshot<Map<String, dynamic>>>[];
    final teamIds = <String>{};

    for (final doc in snap.docs) {
      final data = doc.data();
      final uids = data['participantUids'];
      if (uids is List && uids.isNotEmpty) continue;
      final teamId = (data['teamId'] as String?)?.trim() ?? '';
      if (teamId.isEmpty) continue;
      teamIds.add(teamId);
      legacyDocs.add(doc);
    }

    final teamsById = await _batchLoadTeams(teamIds);
    final relevant = <QueryDocumentSnapshot<Map<String, dynamic>>>[];
    for (final doc in legacyDocs) {
      final teamId = (doc.data()['teamId'] as String?)?.trim() ?? '';
      final team = teamsById[teamId];
      if (team == null) continue;
      final p1 = team['player1Id'] as String?;
      final p2 = team['player2Id'] as String?;
      if (p1 != uid && p2 != uid) continue;
      relevant.add(doc);
    }

    return _mapRegistrationDocs(relevant);
  }

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

  Future<List<MyTournamentRegistration>> _mapRegistrationDocs(
    Iterable<QueryDocumentSnapshot<Map<String, dynamic>>> docs,
  ) async {
    final results = <MyTournamentRegistration>[];

    for (final doc in docs) {
      final data = doc.data();
      final teamId = (data['teamId'] as String?)?.trim() ?? '';
      if (teamId.isEmpty) continue;

      final tournamentId = (data['tournamentId'] as String?)?.trim() ?? '';
      if (tournamentId.isEmpty) continue;

      final tournament = await _loadTournamentDetail(tournamentId);
      final isPaid = data['isPaid'] == true;
      final categoryId = data['categoryId'] as String? ?? '';
      final listingRaw = tournament?.listingStatusRaw;

      results.add(
        MyTournamentRegistration(
          registrationId: doc.id,
          tournamentId: tournamentId,
          tournamentName: tournament?.name ?? 'Torneio',
          dateLabel: tournament?.dateLabel ?? '',
          statusLabel: isPaid
              ? 'Inscrito'
              : tournament != null
                  ? tournamentStatusLabelFromRaw(
                      status: tournament.status,
                      listingStatusRaw: listingRaw,
                    )
                  : 'Inscrição',
          isPaid: isPaid,
          categoryId: categoryId,
          startDate: tournament?.startDate,
          endDate: tournament?.endDate,
          listingStatus: tournament?.status,
          listingStatusRaw: listingRaw,
          teamId: teamId,
          locationLine: _tournamentLocationLine(tournament),
        ),
      );
    }

    return results;
  }

  static String? _tournamentLocationLine(TournamentDetail? tournament) {
    if (tournament == null) return null;
    final parts = <String>[];
    final loc = tournament.location.trim();
    final city = tournament.city.trim();
    if (loc.isNotEmpty) parts.add(loc);
    if (city.isNotEmpty) parts.add(city);
    if (parts.isEmpty) return null;
    return parts.join(' · ');
  }

  Future<TournamentDetail?> _loadTournamentDetail(String id) async {
    var doc = await _firestore.collection('tournaments').doc(id).get();
    if (!doc.exists) {
      doc = await _firestore
          .doc(NexagoArtifactsPaths.legacyTournamentDoc(id))
          .get();
    }
    return TournamentDocumentMapper.detailFromSnapshot(doc);
  }
}

final myTournamentRegistrationsRepositoryProvider =
    Provider<MyTournamentRegistrationsRepository>((ref) {
  return MyTournamentRegistrationsRepository(FirebaseFirestore.instance);
});

final myTournamentRegistrationsProvider =
    StreamProvider.autoDispose<List<MyTournamentRegistration>>((ref) {
  final uid = ref.watch(authProvider).valueOrNull?.uid ?? '';
  if (uid.isEmpty) return Stream.value(const []);
  return ref
      .watch(myTournamentRegistrationsRepositoryProvider)
      .watchForUser(uid);
});
