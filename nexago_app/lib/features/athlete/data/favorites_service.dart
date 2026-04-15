import 'package:cloud_firestore/cloud_firestore.dart';

class FavoritesService {
  FavoritesService(this._firestore);

  final FirebaseFirestore _firestore;

  CollectionReference<Map<String, dynamic>> _favoritesRef(String userId) {
    return _firestore.collection('users').doc(userId).collection('favorites');
  }

  CollectionReference<Map<String, dynamic>> _followersRef(String arenaId) {
    return _firestore.collection('arenas').doc(arenaId).collection('followers');
  }

  Future<void> toggleFollowArena({
    required String userId,
    required String arenaId,
    required bool isFollowing,
  }) async {
    final uid = userId.trim();
    final aid = arenaId.trim();
    if (uid.isEmpty || aid.isEmpty) return;

    final favoriteRef = _favoritesRef(uid).doc(aid);
    final followerRef = _followersRef(aid).doc(uid);

    final batch = _firestore.batch();
    if (isFollowing) {
      batch.delete(favoriteRef);
      batch.delete(followerRef);
    } else {
      final payload = <String, dynamic>{
        'createdAt': FieldValue.serverTimestamp(),
      };
      batch.set(
        favoriteRef,
        <String, dynamic>{
          ...payload,
          'arenaId': aid,
        },
        SetOptions(merge: true),
      );
      batch.set(
        followerRef,
        <String, dynamic>{
          ...payload,
          'userId': uid,
          'arenaId': aid,
        },
        SetOptions(merge: true),
      );
    }
    await batch.commit();
  }

  Future<void> toggleFavoriteArena({
    required String userId,
    required String arenaId,
    required bool isFavorite,
  }) async {
    await toggleFollowArena(
      userId: userId,
      arenaId: arenaId,
      isFollowing: isFavorite,
    );
  }
}
