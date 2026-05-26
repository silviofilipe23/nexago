import 'package:cloud_firestore/cloud_firestore.dart';

import '../domain/tournament_match.dart';
import 'nexago_artifacts_paths.dart';
import 'tournament_match_mapper.dart';

/// Lê partidas em `artifacts/.../matches` filtradas por `tournamentId`.
///
/// Índice recomendado: `tournamentId` (ver `firestore.indexes.json` no volley-track-app).
class TournamentMatchesRepository {
  TournamentMatchesRepository(this._firestore);

  final FirebaseFirestore _firestore;

  CollectionReference<Map<String, dynamic>> get _matches =>
      _firestore.collection(NexagoArtifactsPaths.matchesCollection());

  Stream<List<TournamentMatch>> watchByTournament(String tournamentId) {
    if (tournamentId.isEmpty) return Stream.value(const []);

    return _matches
        .where('tournamentId', isEqualTo: tournamentId)
        .snapshots()
        .map((snap) {
      final items = snap.docs
          .map(TournamentMatchMapper.fromSnapshot)
          .whereType<TournamentMatch>()
          .toList();
      items.sort((a, b) {
        final c = a.categoryId.compareTo(b.categoryId);
        if (c != 0) return c;
        final r = a.round.compareTo(b.round);
        if (r != 0) return r;
        return a.matchNumber.compareTo(b.matchNumber);
      });
      return items;
    });
  }
}
