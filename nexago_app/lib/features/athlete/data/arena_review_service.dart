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

    final bookingDoc = await _firestore.collection('arenaBookings').doc(bid).get();
    if (!bookingDoc.exists) {
      throw Exception('Reserva não encontrada para avaliação.');
    }
    final bookingData = bookingDoc.data() ?? <String, dynamic>{};
    final bookingArenaId = (bookingData['arenaId'] as String?)?.trim() ?? '';
    final bookingUserId = ((bookingData['athleteId'] ?? bookingData['bookingAthleteId']) as String?)
            ?.trim() ??
        '';
    final bookingStatus = (bookingData['status'] as String?)?.trim().toLowerCase() ?? '';
    final isCompleted = bookingStatus == 'completed' || bookingStatus == 'finalizado';
    if (bookingArenaId != aid || bookingUserId != uid || !isCompleted) {
      throw Exception('Avaliação permitida apenas após a reserva concluída.');
    }

    await _reviews.add(
      <String, dynamic>{
        'arenaId': aid,
        'userId': uid,
        'bookingId': bid,
        'rating': rating,
        'comment': cleanComment,
        'likesCount': 0,
        'reported': false,
        'createdAt': FieldValue.serverTimestamp(),
      },
    );
  }

  Future<void> likeReview({
    required String reviewId,
    required String userId,
  }) async {
    final rid = reviewId.trim();
    final uid = userId.trim();
    if (rid.isEmpty || uid.isEmpty) {
      throw Exception('Dados inválidos para curtir avaliação.');
    }
    final reviewRef = _reviews.doc(rid);
    final likeRef = reviewRef.collection('likes').doc(uid);
    await _firestore.runTransaction((tx) async {
      final reviewSnap = await tx.get(reviewRef);
      if (!reviewSnap.exists) throw Exception('Avaliação não encontrada.');
      final likeSnap = await tx.get(likeRef);
      if (likeSnap.exists) return;
      final currentLikes =
          (reviewSnap.data()?['likesCount'] as num?)?.toInt() ?? 0;
      tx.set(likeRef, {
        'userId': uid,
        'createdAt': FieldValue.serverTimestamp(),
      });
      tx.update(reviewRef, {'likesCount': currentLikes + 1});
    });
  }

  Future<void> unlikeReview({
    required String reviewId,
    required String userId,
  }) async {
    final rid = reviewId.trim();
    final uid = userId.trim();
    if (rid.isEmpty || uid.isEmpty) {
      throw Exception('Dados inválidos para remover curtida.');
    }
    final reviewRef = _reviews.doc(rid);
    final likeRef = reviewRef.collection('likes').doc(uid);
    await _firestore.runTransaction((tx) async {
      final reviewSnap = await tx.get(reviewRef);
      if (!reviewSnap.exists) throw Exception('Avaliação não encontrada.');
      final likeSnap = await tx.get(likeRef);
      if (!likeSnap.exists) return;
      final currentLikes =
          (reviewSnap.data()?['likesCount'] as num?)?.toInt() ?? 0;
      tx.delete(likeRef);
      tx.update(reviewRef, {'likesCount': currentLikes > 0 ? currentLikes - 1 : 0});
    });
  }

  Future<void> reportReview({
    required String reviewId,
    required String userId,
    required String reason,
  }) async {
    final rid = reviewId.trim();
    final uid = userId.trim();
    final cleanReason = reason.trim();
    if (rid.isEmpty || uid.isEmpty) {
      throw Exception('Dados inválidos para denúncia.');
    }
    if (cleanReason.length < 5 || cleanReason.length > 280) {
      throw Exception('Motivo da denúncia deve ter entre 5 e 280 caracteres.');
    }
    final reviewRef = _reviews.doc(rid);
    final reportRef = reviewRef.collection('reports').doc(uid);
    await _firestore.runTransaction((tx) async {
      final reviewSnap = await tx.get(reviewRef);
      if (!reviewSnap.exists) throw Exception('Avaliação não encontrada.');
      tx.set(reportRef, {
        'userId': uid,
        'reason': cleanReason,
        'reportedAt': FieldValue.serverTimestamp(),
      }, SetOptions(merge: true));
      tx.update(reviewRef, {'reported': true});
    });
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
