import 'package:cloud_firestore/cloud_firestore.dart';

import '../domain/arena_court.dart';

class CourtsRepository {
  CourtsRepository(this._firestore);

  final FirebaseFirestore _firestore;

  /// `arenas/{arenaId}/courts`
  Stream<List<ArenaCourt>> watchCourts(String arenaId) {
    return _firestore
        .collection('arenas')
        .doc(arenaId)
        .collection('courts')
        .snapshots()
        .map((snapshot) {
      final list = snapshot.docs.map(ArenaCourt.fromFirestore).toList();
      list.sort((a, b) => a.name.toLowerCase().compareTo(b.name.toLowerCase()));
      return list;
    });
  }
}
