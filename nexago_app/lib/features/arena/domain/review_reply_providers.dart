import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../athlete/domain/arena_review.dart';
import '../../arenas/domain/arenas_providers.dart';
import '../data/review_reply_service.dart';
import 'arena_schedule_providers.dart';

class ArenaReviewReputationMetrics {
  const ArenaReviewReputationMetrics({
    required this.totalReviews,
    required this.repliedReviews,
    required this.repliedPercent,
    required this.averageReplyHours,
    required this.negativePendingCount,
    required this.respondsFastBadge,
  });

  final int totalReviews;
  final int repliedReviews;
  final double repliedPercent;
  final double averageReplyHours;
  final int negativePendingCount;
  final bool respondsFastBadge;
}

final reviewReplyServiceProvider = Provider<ReviewReplyService>((ref) {
  return ReviewReplyService(ref.watch(firestoreProvider));
});

final managedArenaReviewsProvider =
    StreamProvider.autoDispose<List<ArenaReview>>((ref) {
  final arenaId = ref.watch(managedArenaIdProvider).valueOrNull;
  if (arenaId == null || arenaId.isEmpty) return Stream.value(const []);
  final firestore = ref.watch(firestoreProvider);
  return firestore
      .collection('arena_reviews')
      .where('arenaId', isEqualTo: arenaId)
      .limit(100)
      .snapshots()
      .asyncMap((snap) async {
    final items = snap.docs.map(ArenaReview.fromFirestore).toList(growable: false)
      ..sort((a, b) {
        final aMs = a.createdAt?.millisecondsSinceEpoch ?? 0;
        final bMs = b.createdAt?.millisecondsSinceEpoch ?? 0;
        return bMs.compareTo(aMs);
      });
    final ids = items
        .map((e) => e.userId.trim())
        .where((e) => e.isNotEmpty)
        .toSet()
        .toList(growable: false);
    final names = <String, String>{};
    for (var i = 0; i < ids.length; i += 10) {
      final chunk = ids.sublist(i, i + 10 > ids.length ? ids.length : i + 10);
      final usersSnap = await firestore
          .collection('users')
          .where(FieldPath.documentId, whereIn: chunk)
          .get();
      for (final d in usersSnap.docs) {
        final n = (d.data()['name'] as String?)?.trim();
        if (n != null && n.isNotEmpty) names[d.id] = n;
      }
    }
    return items
        .map((r) => r.copyWith(athleteName: names[r.userId]))
        .toList(growable: false);
  });
});

final arenaReviewReputationMetricsProvider =
    StreamProvider.autoDispose<ArenaReviewReputationMetrics>((ref) {
  return ref.watch(managedArenaReviewsProvider.stream).map((reviews) {
    final total = reviews.length;
    if (total == 0) {
      return const ArenaReviewReputationMetrics(
        totalReviews: 0,
        repliedReviews: 0,
        repliedPercent: 0,
        averageReplyHours: 0,
        negativePendingCount: 0,
        respondsFastBadge: false,
      );
    }
    var replied = 0;
    var negativePending = 0;
    var sumReplyHours = 0.0;
    var replyCountForAvg = 0;
    for (final r in reviews) {
      final hasReply = r.reply != null;
      if (hasReply) replied += 1;
      if (r.rating <= 2 && !hasReply) negativePending += 1;
      final created = r.createdAt;
      final repliedAt = r.reply?.createdAt ?? r.reply?.updatedAt;
      if (created != null && repliedAt != null) {
        final diffHours = repliedAt.difference(created).inMinutes / 60.0;
        if (diffHours >= 0) {
          sumReplyHours += diffHours;
          replyCountForAvg += 1;
        }
      }
    }
    final repliedPercent = (replied / total) * 100;
    final avgHours =
        replyCountForAvg == 0 ? 0.0 : (sumReplyHours / replyCountForAvg);
    return ArenaReviewReputationMetrics(
      totalReviews: total,
      repliedReviews: replied,
      repliedPercent: repliedPercent,
      averageReplyHours: avgHours,
      negativePendingCount: negativePending,
      respondsFastBadge: repliedPercent >= 80 && avgHours > 0 && avgHours <= 12,
    );
  });
});

final arenaRespondsFastSocialProofProvider =
    StreamProvider.autoDispose.family<String?, String>((ref, arenaId) {
  final aid = arenaId.trim();
  if (aid.isEmpty) return Stream.value(null);
  final firestore = ref.watch(firestoreProvider);
  return firestore
      .collection('arena_reviews')
      .where('arenaId', isEqualTo: aid)
      .limit(120)
      .snapshots()
      .map((snap) {
    if (snap.docs.isEmpty) return null;
    var replied = 0;
    for (final d in snap.docs) {
      if (d.data()['reply'] is Map<String, dynamic>) replied += 1;
    }
    final percent = (replied / snap.docs.length) * 100;
    if (percent >= 75) return '✔ Arena responde rapidamente';
    return null;
  });
});
