import 'package:cloud_firestore/cloud_firestore.dart';

import '../domain/arena_peak_rule.dart';

class PeakRulesRepository {
  PeakRulesRepository(this._firestore);

  final FirebaseFirestore _firestore;

  Stream<List<ArenaPeakRule>> watchActivePeakRules(String arenaId) {
    final id = arenaId.trim();
    if (id.isEmpty) return Stream.value(const []);

    return _firestore
        .collection('arenas')
        .doc(id)
        .collection('peakRules')
        .where('active', isEqualTo: true)
        .snapshots()
        .map((snap) => snap.docs.map(ArenaPeakRule.fromFirestore).toList());
  }
}
