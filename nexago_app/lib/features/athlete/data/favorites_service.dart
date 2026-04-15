import 'package:cloud_firestore/cloud_firestore.dart';

class FavoritesService {
  FavoritesService(this._firestore);

  final FirebaseFirestore _firestore;

  CollectionReference<Map<String, dynamic>> _favoritesRef(String userId) {
    return _firestore.collection('users').doc(userId).collection('favorites');
  }

  Future<void> toggleFavoriteArena({
    required String userId,
    required String arenaId,
    required bool isFavorite,
  }) async {
    final uid = userId.trim();
    final aid = arenaId.trim();
    if (uid.isEmpty || aid.isEmpty) return;

    final ref = _favoritesRef(uid).doc(aid);
    if (isFavorite) {
      await ref.delete();
      return;
    }

    await ref.set(<String, dynamic>{
      'arenaId': aid,
      'createdAt': FieldValue.serverTimestamp(),
    }, SetOptions(merge: true));
  }
}
