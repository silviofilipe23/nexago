import 'package:cloud_firestore/cloud_firestore.dart';

import '../domain/tournament_discovery_models.dart';
import 'nexago_artifacts_paths.dart';
import 'tournament_document_mapper.dart';

class TournamentsRepository {
  TournamentsRepository(this._firestore);

  final FirebaseFirestore _firestore;

  CollectionReference<Map<String, dynamic>> get _root =>
      _firestore.collection('tournaments');

  Stream<List<DiscoveryTournament>> watchDiscoveryTournaments() {
    return _root.snapshots().map((snap) {
      final items = snap.docs
          .map(TournamentDocumentMapper.fromSnapshot)
          .whereType<DiscoveryTournament>()
          .toList();
      items.sort((a, b) {
        final c = a.startDate.compareTo(b.startDate);
        if (c != 0) return c;
        return a.name.toLowerCase().compareTo(b.name.toLowerCase());
      });
      return items;
    });
  }

  Stream<DiscoveryTournament?> watchTournament(String id) {
    if (id.isEmpty) return Stream.value(null);
    return _root.doc(id).snapshots().asyncMap((doc) async {
      if (doc.exists) {
        return TournamentDocumentMapper.fromSnapshot(doc);
      }
      final legacy = await _firestore
          .doc(NexagoArtifactsPaths.legacyTournamentDoc(id))
          .get();
      return TournamentDocumentMapper.fromSnapshot(legacy);
    });
  }
}
