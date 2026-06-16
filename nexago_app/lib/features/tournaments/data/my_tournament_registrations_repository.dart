import 'dart:math';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/auth/auth_providers.dart';
import '../domain/tournament_detail_logic.dart';
import '../domain/tournament_detail_model.dart';
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

    final legacyFuture = _loadLegacyRegistrations(uid);

    return indexed.asyncMap((indexedRows) async {
      final legacyRows = await legacyFuture;
      final byId = <String, MyTournamentRegistration>{
        for (final row in indexedRows) row.registrationId: row,
        for (final row in legacyRows) row.registrationId: row,
      };
      final merged = byId.values.toList()
        ..sort((a, b) => a.tournamentName.compareTo(b.tournamentName));
      return merged;
    });
  }

  Future<List<MyTournamentRegistration>> _loadLegacyRegistrations(
    String uid,
  ) async {
    final teamIds = <String>{};
    final player1Snap =
        await _teams.where('player1Id', isEqualTo: uid).get();
    final player2Snap =
        await _teams.where('player2Id', isEqualTo: uid).get();
    for (final doc in player1Snap.docs) {
      teamIds.add(doc.id);
    }
    for (final doc in player2Snap.docs) {
      teamIds.add(doc.id);
    }
    if (teamIds.isEmpty) return const [];

    final legacyDocs = <QueryDocumentSnapshot<Map<String, dynamic>>>[];
    final ids = teamIds.toList();
    for (var i = 0; i < ids.length; i += 30) {
      final chunk = ids.sublist(i, min(i + 30, ids.length));
      final snap =
          await _inscriptions.where('teamId', whereIn: chunk).get();
      for (final doc in snap.docs) {
        final data = doc.data();
        final uids = data['participantUids'];
        if (uids is List && uids.isNotEmpty) continue;
        legacyDocs.add(doc);
      }
    }

    return _mapRegistrationDocs(legacyDocs);
  }

  Future<List<MyTournamentRegistration>> _mapIndexedRegistrations(
    QuerySnapshot<Map<String, dynamic>> snap,
  ) {
    return _mapRegistrationDocs(snap.docs);
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
      final isWaitlist = data['waitlist'] == true;
      final categoryId = data['categoryId'] as String? ?? '';
      final listingRaw = tournament?.listingStatusRaw;

      results.add(
        MyTournamentRegistration(
          registrationId: doc.id,
          tournamentId: tournamentId,
          tournamentName: tournament?.name ?? 'Torneio',
          dateLabel: tournament?.dateLabel ?? '',
          statusLabel: athleteRegistrationStatusLabel(
            isPaid: isPaid,
            isWaitlist: isWaitlist,
          ),
          isPaid: isPaid,
          categoryId: categoryId,
          startDate: tournament?.startDate,
          endDate: tournament?.endDate,
          listingStatus: tournament?.status,
          listingStatusRaw: listingRaw,
          teamId: teamId,
          locationLine: _tournamentLocationLine(tournament),
          isWaitlist: isWaitlist,
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
