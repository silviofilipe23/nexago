import 'package:cloud_firestore/cloud_firestore.dart';

import '../domain/arena_promotion.dart';

class PromotionsRepository {
  PromotionsRepository(this._firestore);

  final FirebaseFirestore _firestore;

  Stream<List<ArenaPromotion>> watchPromotions(String arenaId) {
    final id = arenaId.trim();
    if (id.isEmpty) return Stream.value(const []);

    return _firestore
        .collection('arenas')
        .doc(id)
        .collection('promotions')
        .where('active', isEqualTo: true)
        .snapshots()
        .map((snap) {
      final list = snap.docs.map(ArenaPromotion.fromFirestore).toList();
      list.sort((a, b) => a.label.compareTo(b.label));
      return list;
    });
  }

  /// Todas as promoções (gestor), inclusive inativas.
  Stream<List<ArenaPromotion>> watchAllPromotions(String arenaId) {
    final id = arenaId.trim();
    if (id.isEmpty) return Stream.value(const []);

    return _firestore
        .collection('arenas')
        .doc(id)
        .collection('promotions')
        .snapshots()
        .map((snap) => snap.docs.map(ArenaPromotion.fromFirestore).toList());
  }

  Future<String> createPromotion({
    required String arenaId,
    required ArenaPromotion promotion,
  }) async {
    final ref = await _firestore
        .collection('arenas')
        .doc(arenaId.trim())
        .collection('promotions')
        .add(promotion.toFirestore());
    return ref.id;
  }
}
