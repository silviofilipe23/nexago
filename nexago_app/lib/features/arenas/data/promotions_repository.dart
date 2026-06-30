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
        .map((snap) {
      final list = snap.docs.map(ArenaPromotion.fromFirestore).toList();
      _sortPromotionsForManager(list);
      return list;
    });
  }

  Future<void> setPromotionActive({
    required String arenaId,
    required String promotionId,
    required bool active,
  }) async {
    final arena = arenaId.trim();
    final promo = promotionId.trim();
    if (arena.isEmpty || promo.isEmpty) {
      throw ArgumentError('arenaId e promotionId são obrigatórios.');
    }

    await _firestore
        .collection('arenas')
        .doc(arena)
        .collection('promotions')
        .doc(promo)
        .update({'active': active});
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

  Future<void> updatePromotion({
    required String arenaId,
    required String promotionId,
    required ArenaPromotion promotion,
  }) async {
    final arena = arenaId.trim();
    final promo = promotionId.trim();
    if (arena.isEmpty || promo.isEmpty) {
      throw ArgumentError('arenaId e promotionId são obrigatórios.');
    }

    await _firestore
        .collection('arenas')
        .doc(arena)
        .collection('promotions')
        .doc(promo)
        .update(promotion.toFirestoreUpdate());
  }

  Future<void> deletePromotion({
    required String arenaId,
    required String promotionId,
  }) async {
    final arena = arenaId.trim();
    final promo = promotionId.trim();
    if (arena.isEmpty || promo.isEmpty) {
      throw ArgumentError('arenaId e promotionId são obrigatórios.');
    }

    await _firestore
        .collection('arenas')
        .doc(arena)
        .collection('promotions')
        .doc(promo)
        .delete();
  }

  static void _sortPromotionsForManager(List<ArenaPromotion> list) {
    list.sort((a, b) {
      if (a.active != b.active) return a.active ? -1 : 1;
      return a.label.compareTo(b.label);
    });
  }
}
