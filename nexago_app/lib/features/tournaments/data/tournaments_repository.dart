import 'package:cloud_firestore/cloud_firestore.dart';

import '../domain/tournament_detail_model.dart';
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
    return watchTournamentDetail(id).map((d) => d?.toDiscovery());
  }

  Stream<TournamentDetail?> watchTournamentDetail(String id) {
    if (id.isEmpty) return Stream.value(null);
    return _root.doc(id).snapshots().asyncMap((doc) async {
      if (doc.exists) {
        return TournamentDocumentMapper.detailFromSnapshot(doc);
      }
      final legacy = await _firestore
          .doc(NexagoArtifactsPaths.legacyTournamentDoc(id))
          .get();
      return TournamentDocumentMapper.detailFromSnapshot(legacy);
    });
  }

  Future<Map<String, String>> getTournamentNames(Set<String> ids) async {
    if (ids.isEmpty) return {};
    final names = <String, String>{};
    for (final id in ids) {
      if (id.trim().isEmpty) continue;
      var doc = await _root.doc(id).get();
      if (!doc.exists) {
        doc = await _firestore
            .doc(NexagoArtifactsPaths.legacyTournamentDoc(id))
            .get();
      }
      final detail = TournamentDocumentMapper.detailFromSnapshot(doc);
      if (detail != null) names[id] = detail.name;
    }
    return names;
  }

  Future<Map<String, TournamentDetail>> getTournamentDetails(Set<String> ids) async {
    if (ids.isEmpty) return {};
    final details = <String, TournamentDetail>{};
    for (final id in ids) {
      if (id.trim().isEmpty) continue;
      var doc = await _root.doc(id).get();
      if (!doc.exists) {
        doc = await _firestore
            .doc(NexagoArtifactsPaths.legacyTournamentDoc(id))
            .get();
      }
      final detail = TournamentDocumentMapper.detailFromSnapshot(doc);
      if (detail != null) details[id] = detail;
    }
    return details;
  }
}
