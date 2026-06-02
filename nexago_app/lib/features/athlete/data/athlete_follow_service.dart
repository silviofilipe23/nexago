import 'package:cloud_firestore/cloud_firestore.dart';

/// Seguir / deixar de seguir atletas.
///
/// Espelha o padrão de `FavoritesService` (arenas):
/// - `users/{athleteId}/followers/{followerId}`
/// - `users/{followerId}/following/{athleteId}`
class AthleteFollowService {
  AthleteFollowService(this._firestore);

  final FirebaseFirestore _firestore;

  CollectionReference<Map<String, dynamic>> _followersRef(String athleteId) {
    return _firestore
        .collection('users')
        .doc(athleteId)
        .collection('followers');
  }

  CollectionReference<Map<String, dynamic>> _followingRef(String followerId) {
    return _firestore
        .collection('users')
        .doc(followerId)
        .collection('following');
  }

  Stream<bool> watchIsFollowing({
    required String followerId,
    required String athleteId,
  }) {
    final follower = followerId.trim();
    final athlete = athleteId.trim();
    if (follower.isEmpty || athlete.isEmpty || follower == athlete) {
      return Stream<bool>.value(false);
    }
    return _followingRef(follower).doc(athlete).snapshots().map((snap) {
      return snap.exists;
    });
  }

  Stream<int> watchFollowersCount(String athleteId) {
    final id = athleteId.trim();
    if (id.isEmpty) return Stream<int>.value(0);
    return _followersRef(id).snapshots().map((snap) => snap.docs.length);
  }

  Stream<int> watchFollowingCount(String athleteId) {
    final id = athleteId.trim();
    if (id.isEmpty) return Stream<int>.value(0);
    return _followingRef(id).snapshots().map((snap) => snap.docs.length);
  }

  Future<void> setFollowing({
    required String followerId,
    required String athleteId,
    required bool follow,
  }) async {
    final follower = followerId.trim();
    final athlete = athleteId.trim();
    if (follower.isEmpty || athlete.isEmpty || follower == athlete) return;

    final followerDoc = _followersRef(athlete).doc(follower);
    final followingDoc = _followingRef(follower).doc(athlete);

    final batch = _firestore.batch();
    if (follow) {
      final payload = <String, dynamic>{
        'followedAt': FieldValue.serverTimestamp(),
      };
      batch.set(
        followerDoc,
        <String, dynamic>{...payload, 'userId': follower},
        SetOptions(merge: true),
      );
      batch.set(
        followingDoc,
        <String, dynamic>{...payload, 'userId': athlete},
        SetOptions(merge: true),
      );
    } else {
      batch.delete(followerDoc);
      batch.delete(followingDoc);
    }
    await batch.commit();
  }

  Future<Set<String>> fetchFollowingIds(String followerId) async {
    final id = followerId.trim();
    if (id.isEmpty) return {};
    final snap = await _followingRef(id).get();
    return snap.docs.map((d) => d.id).toSet();
  }
}
