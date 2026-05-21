import 'package:cloud_firestore/cloud_firestore.dart';

import '../domain/tournament_discovery_models.dart';
import 'league_document_mapper.dart';

class LeaguesRepository {
  LeaguesRepository(this._firestore);

  final FirebaseFirestore _firestore;

  CollectionReference<Map<String, dynamic>> get _collection =>
      _firestore.collection('leagues');

  Stream<List<DiscoveryLeague>> watchLeagues() {
    return _collection.snapshots().map((snap) {
      final items = snap.docs
          .map(LeagueDocumentMapper.fromSnapshot)
          .whereType<DiscoveryLeague>()
          .toList();
      items.sort(
        (a, b) => a.name.toLowerCase().compareTo(b.name.toLowerCase()),
      );
      return items;
    });
  }

  Stream<DiscoveryLeague?> watchLeague(String id) {
    if (id.isEmpty) return Stream.value(null);
    return _collection.doc(id).snapshots().map(LeagueDocumentMapper.fromSnapshot);
  }
}
