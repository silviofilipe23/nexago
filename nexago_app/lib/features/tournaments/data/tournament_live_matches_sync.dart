import 'package:cloud_firestore/cloud_firestore.dart';

import 'nexago_artifacts_paths.dart';
import '../domain/tournament_match_status.dart';

/// Mantém `tournaments.liveMatchesNow` alinhado ao placar gravado no cliente.
abstract final class TournamentLiveMatchesSync {
  TournamentLiveMatchesSync._();

  static Future<void> syncForTournament(
    FirebaseFirestore firestore,
    String tournamentId,
  ) async {
    final tid = tournamentId.trim();
    if (tid.isEmpty) return;

    final snap = await firestore
        .collection(NexagoArtifactsPaths.matchesCollection())
        .where('tournamentId', isEqualTo: tid)
        .get();

    var count = 0;
    for (final doc in snap.docs) {
      final status = doc.data()['status'];
      if (status is String && TournamentMatchStatus.isInProgress(status)) {
        count++;
      }
    }

    await firestore.collection('tournaments').doc(tid).set(
      {
        'liveMatchesNow': count,
        'updatedAt': FieldValue.serverTimestamp(),
      },
      SetOptions(merge: true),
    );
  }
}
