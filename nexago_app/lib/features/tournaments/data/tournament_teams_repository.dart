import 'package:cloud_firestore/cloud_firestore.dart';

import '../domain/tournament_team.dart';
import 'nexago_artifacts_paths.dart';

class TournamentTeamsRepository {
  TournamentTeamsRepository(this._firestore);

  final FirebaseFirestore _firestore;

  CollectionReference<Map<String, dynamic>> get _teams =>
      _firestore.collection(NexagoArtifactsPaths.teamsCollection());

  Future<Set<String>> teamIdsForAthlete(String uid) async {
    final id = uid.trim();
    if (id.isEmpty) return {};

    final results = await Future.wait([
      _teams.where('player1Id', isEqualTo: id).get(),
      _teams.where('player2Id', isEqualTo: id).get(),
    ]);

    final ids = <String>{};
    for (final snap in results) {
      for (final doc in snap.docs) {
        ids.add(doc.id);
      }
    }
    return ids;
  }

  Future<Map<String, TournamentTeam>> getTeamsByIds(Set<String> teamIds) async {
    if (teamIds.isEmpty) return {};

    final ids = teamIds.where((id) => id.trim().isNotEmpty).toList();
    if (ids.isEmpty) return {};

    final teams = <String, TournamentTeam>{};
    const chunkSize = 10;
    for (var i = 0; i < ids.length; i += chunkSize) {
      final chunk = ids.sublist(
        i,
        i + chunkSize > ids.length ? ids.length : i + chunkSize,
      );
      final snaps = await Future.wait(chunk.map((id) => _teams.doc(id).get()));
      for (final snap in snaps) {
        if (!snap.exists) continue;
        final team = _fromSnapshot(snap);
        if (team != null) teams[team.id] = team;
      }
    }
    return teams;
  }

  TournamentTeam? _fromSnapshot(DocumentSnapshot<Map<String, dynamic>> doc) {
    if (!doc.exists) return null;
    return TournamentTeam.fromFirestore(doc);
  }
}
