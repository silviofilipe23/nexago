import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/auth/auth_providers.dart';
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

    return _inscriptions.snapshots().asyncMap((snap) async {
      final results = <MyTournamentRegistration>[];

      for (final doc in snap.docs) {
        final data = doc.data();
        final teamId = data['teamId'] as String?;
        if (teamId == null || teamId.isEmpty) continue;

        final teamSnap = await _teams.doc(teamId).get();
        if (!teamSnap.exists) continue;
        final team = teamSnap.data()!;
        final p1 = team['player1Id'] as String?;
        final p2 = team['player2Id'] as String?;
        if (p1 != uid && p2 != uid) continue;

        final tournamentId = data['tournamentId'] as String? ?? '';
        if (tournamentId.isEmpty) continue;

        final tournament = await _loadTournament(tournamentId);

        final isPaid = data['isPaid'] == true;
        final categoryId = data['categoryId'] as String? ?? '';

        results.add(
          MyTournamentRegistration(
            registrationId: doc.id,
            tournamentId: tournamentId,
            tournamentName: tournament?.name ?? 'Torneio',
            dateLabel: tournament?.dateLabel ?? '',
            statusLabel: isPaid
                ? 'Inscrito'
                : tournament != null
                    ? tournamentStatusLabel(tournament.status)
                    : 'Inscrição',
            isPaid: isPaid,
            categoryId: categoryId,
          ),
        );
      }

      results.sort((a, b) => a.tournamentName.compareTo(b.tournamentName));
      return results;
    });
  }

  Future<DiscoveryTournament?> _loadTournament(String id) async {
    var doc = await _firestore.collection('tournaments').doc(id).get();
    if (!doc.exists) {
      doc = await _firestore
          .doc(NexagoArtifactsPaths.legacyTournamentDoc(id))
          .get();
    }
    return TournamentDocumentMapper.fromSnapshot(doc);
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
