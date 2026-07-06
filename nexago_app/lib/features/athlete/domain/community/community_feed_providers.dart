import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'community_feed_models.dart';

export 'community_feed_models.dart';

const _communityFeedLimit = 30;

/// Últimos itens do feed da Comunidade (gerados pelo sistema, sem UGC).
final communityFeedProvider = StreamProvider.autoDispose<
    List<CommunityFeedItem>>((ref) {
  return FirebaseFirestore.instance
      .collection('communityFeed')
      .orderBy('createdAt', descending: true)
      .limit(_communityFeedLimit)
      .snapshots()
      .map(
        (snap) => snap.docs
            .map(CommunityFeedItem.fromFirestore)
            .where((item) => item.type != CommunityFeedType.unknown)
            .toList(),
      );
});
