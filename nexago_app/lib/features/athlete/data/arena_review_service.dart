import 'package:cloud_firestore/cloud_firestore.dart';

import '../domain/arena_review.dart';

class ArenaReviewService {
  ArenaReviewService(this._firestore);

  final FirebaseFirestore _firestore;

  CollectionReference<Map<String, dynamic>> get _reviews =>
      _firestore.collection('arena_reviews');

  Future<void> submitArenaReview({
    required String arenaId,
    required String bookingId,
    required String userId,
    required int rating,
    String? comment,
  }) async {
    final aid = arenaId.trim();
    final bid = bookingId.trim();
    final uid = userId.trim();
    final cleanComment = comment?.trim();
    if (aid.isEmpty || bid.isEmpty || uid.isEmpty) {
      throw Exception('Dados inválidos para avaliação.');
    }
    if (rating < 1 || rating > 5) {
      throw Exception('A nota deve estar entre 1 e 5.');
    }

    final existing =
        await _reviews.where('bookingId', isEqualTo: bid).limit(1).get();
    if (existing.docs.isNotEmpty) {
      throw Exception('Esta reserva já foi avaliada.');
    }

    await _reviews.add(
      <String, dynamic>{
        'arenaId': aid,
        'userId': uid,
        'bookingId': bid,
        'rating': rating,
        'comment': cleanComment,
        'createdAt': FieldValue.serverTimestamp(),
      },
    );
  }

  Future<List<ArenaReview>> fetchArenaReviews({
    required String arenaId,
    DocumentSnapshot<Map<String, dynamic>>? startAfter,
    int limit = 30,
  }) async {
    var query = _reviews
        .where('arenaId', isEqualTo: arenaId.trim())
        .orderBy('createdAt', descending: true)
        .limit(limit);
    if (startAfter != null) {
      query = query.startAfterDocument(startAfter);
    }
    final snap = await query.get();
    return snap.docs.map(ArenaReview.fromFirestore).toList(growable: false);
  }
}
