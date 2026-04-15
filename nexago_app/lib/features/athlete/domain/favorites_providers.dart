import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:cloud_firestore/cloud_firestore.dart';

import '../../../core/auth/auth_providers.dart';
import '../../arenas/domain/arenas_providers.dart';
import '../data/favorites_service.dart';

final favoritesServiceProvider = Provider<FavoritesService>((ref) {
  return FavoritesService(ref.watch(firestoreProvider));
});

final favoriteArenaIdsProvider =
    StreamProvider.autoDispose<List<String>>((ref) {
  final userId = ref.watch(authProvider).valueOrNull?.uid;
  if (userId == null || userId.isEmpty) {
    return Stream<List<String>>.value(const []);
  }
  return ref
      .watch(firestoreProvider)
      .collection('users')
      .doc(userId)
      .collection('favorites')
      .snapshots()
      .map((snap) {
    final ids = <String>[];
    for (final doc in snap.docs) {
      final raw = doc.data()['arenaId'];
      final id = raw is String && raw.trim().isNotEmpty ? raw.trim() : doc.id;
      ids.add(id);
    }
    return ids;
  });
});

class ArenaFollowerItem {
  const ArenaFollowerItem({
    required this.userId,
    required this.name,
    required this.avatarUrl,
    required this.createdAt,
  });

  final String userId;
  final String name;
  final String? avatarUrl;
  final DateTime? createdAt;

  bool get isNewFollower {
    if (createdAt == null) return false;
    return DateTime.now().difference(createdAt!).inDays <= 7;
  }
}

class ArenaFollowersInsights {
  const ArenaFollowersInsights({
    required this.totalFollowers,
    required this.growthLastWeek,
    required this.qualityBookedPercent,
    required this.activeRecentlyPercent,
  });

  final int totalFollowers;
  final int growthLastWeek;
  final double qualityBookedPercent;
  final double activeRecentlyPercent;
}

final arenaFollowersCountProvider =
    StreamProvider.autoDispose.family<int, String>((ref, arenaId) {
  final aid = arenaId.trim();
  if (aid.isEmpty) return Stream<int>.value(0);
  return ref
      .watch(firestoreProvider)
      .collection('arenas')
      .doc(aid)
      .collection('followers')
      .snapshots()
      .map((snap) => snap.size);
});

Future<List<ArenaFollowerItem>> _mapFollowersWithUsers({
  required FirebaseFirestore firestore,
  required List<QueryDocumentSnapshot<Map<String, dynamic>>> followerDocs,
}) async {
  if (followerDocs.isEmpty) return const <ArenaFollowerItem>[];
  final ids = followerDocs.map((d) => d.id).toList(growable: false);
  final userMap = <String, Map<String, dynamic>>{};

  for (var i = 0; i < ids.length; i += 10) {
    final chunk = ids.sublist(i, i + 10 > ids.length ? ids.length : i + 10);
    final usersSnap = await firestore
        .collection('users')
        .where(FieldPath.documentId, whereIn: chunk)
        .get();
    for (final doc in usersSnap.docs) {
      userMap[doc.id] = doc.data();
    }
  }

  DateTime? parseCreatedAt(dynamic raw) {
    if (raw is Timestamp) return raw.toDate();
    return null;
  }

  return followerDocs.map((doc) {
    final data = doc.data();
    final userData = userMap[doc.id] ?? <String, dynamic>{};
    final nameRaw = userData['name'];
    final avatarRaw = userData['photoURL'] ?? userData['avatarUrl'];
    final name = nameRaw is String && nameRaw.trim().isNotEmpty
        ? nameRaw.trim()
        : 'Atleta';
    final avatar = avatarRaw is String && avatarRaw.trim().isNotEmpty
        ? avatarRaw.trim()
        : null;
    return ArenaFollowerItem(
      userId: doc.id,
      name: name,
      avatarUrl: avatar,
      createdAt: parseCreatedAt(data['createdAt']),
    );
  }).toList(growable: false);
}

final arenaFollowersPreviewProvider = StreamProvider.autoDispose
    .family<List<ArenaFollowerItem>, String>((ref, arenaId) {
  final aid = arenaId.trim();
  if (aid.isEmpty) return Stream.value(const <ArenaFollowerItem>[]);
  final firestore = ref.watch(firestoreProvider);
  return firestore
      .collection('arenas')
      .doc(aid)
      .collection('followers')
      .orderBy('createdAt', descending: true)
      .limit(5)
      .snapshots()
      .asyncMap(
        (snap) => _mapFollowersWithUsers(
          firestore: firestore,
          followerDocs: snap.docs,
        ),
      );
});

final arenaFollowersListProvider = StreamProvider.autoDispose
    .family<List<ArenaFollowerItem>, String>((ref, arenaId) {
  final aid = arenaId.trim();
  if (aid.isEmpty) return Stream.value(const <ArenaFollowerItem>[]);
  final firestore = ref.watch(firestoreProvider);
  return firestore
      .collection('arenas')
      .doc(aid)
      .collection('followers')
      .orderBy('createdAt', descending: true)
      .limit(300)
      .snapshots()
      .asyncMap(
        (snap) => _mapFollowersWithUsers(
          firestore: firestore,
          followerDocs: snap.docs,
        ),
      );
});

final arenaFollowersInsightsProvider = StreamProvider.autoDispose
    .family<ArenaFollowersInsights, String>((ref, arenaId) {
  final aid = arenaId.trim();
  if (aid.isEmpty) {
    return Stream.value(
      const ArenaFollowersInsights(
        totalFollowers: 0,
        growthLastWeek: 0,
        qualityBookedPercent: 0,
        activeRecentlyPercent: 0,
      ),
    );
  }
  final firestore = ref.watch(firestoreProvider);
  final followersStream = firestore
      .collection('arenas')
      .doc(aid)
      .collection('followers')
      .snapshots();
  final bookingsStream = firestore
      .collection('arenaBookings')
      .where('arenaId', isEqualTo: aid)
      .limit(1000)
      .snapshots();

  return followersStream.asyncMap((followersSnap) async {
    final bookingsSnap = await bookingsStream.first;
    final now = DateTime.now();
    final weekAgo = now.subtract(const Duration(days: 7));
    final monthAgo = now.subtract(const Duration(days: 30));
    final total = followersSnap.size;
    if (total == 0) {
      return const ArenaFollowersInsights(
        totalFollowers: 0,
        growthLastWeek: 0,
        qualityBookedPercent: 0,
        activeRecentlyPercent: 0,
      );
    }

    final followers = followersSnap.docs;
    final followerIds = followers.map((d) => d.id).toSet();
    final createdLastWeek = followers.where((doc) {
      final ts = doc.data()['createdAt'];
      if (ts is! Timestamp) return false;
      return ts.toDate().isAfter(weekAgo);
    }).length;

    final bookedFollowers = <String>{};
    final recentActiveFollowers = <String>{};
    for (final doc in bookingsSnap.docs) {
      final data = doc.data();
      final uidRaw = data['athleteId'] ?? data['bookingAthleteId'];
      if (uidRaw is! String) continue;
      final uid = uidRaw.trim();
      if (!followerIds.contains(uid)) continue;
      bookedFollowers.add(uid);

      final dateRaw = data['date'];
      DateTime? bookingDate;
      if (dateRaw is Timestamp) bookingDate = dateRaw.toDate();
      if (dateRaw is String && dateRaw.length >= 10) {
        bookingDate = DateTime.tryParse(dateRaw.substring(0, 10));
      }
      if (bookingDate != null && bookingDate.isAfter(monthAgo)) {
        recentActiveFollowers.add(uid);
      }
    }

    return ArenaFollowersInsights(
      totalFollowers: total,
      growthLastWeek: createdLastWeek,
      qualityBookedPercent: (bookedFollowers.length / total) * 100,
      activeRecentlyPercent: (recentActiveFollowers.length / total) * 100,
    );
  });
});
