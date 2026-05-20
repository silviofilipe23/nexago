import 'package:cloud_firestore/cloud_firestore.dart';

import '../domain/arena_review.dart';

class ArenaReviewService {
  ArenaReviewService(this._firestore);

  final FirebaseFirestore _firestore;

  CollectionReference<Map<String, dynamic>> get _reviews =>
      _firestore.collection('arena_reviews');

  static const Duration _reviewPromptDelayAfterEnd = Duration(minutes: 5);

  String _readString(Map<String, dynamic> data, List<String> keys) {
    for (final key in keys) {
      final raw = data[key];
      if (raw is String && raw.trim().isNotEmpty) return raw.trim();
    }
    return '';
  }

  DateTime? _parseDateOnly(String raw) {
    final value = raw.trim();
    if (value.isEmpty) return null;
    if (value.length >= 10) {
      final iso = DateTime.tryParse(value.substring(0, 10));
      if (iso != null) return DateTime(iso.year, iso.month, iso.day);
    }
    final normalized = value.replaceAll('-', '/');
    final parts = normalized.split('/');
    if (parts.length >= 3) {
      final d = int.tryParse(parts[0]) ?? 0;
      final m = int.tryParse(parts[1]) ?? 0;
      final y = int.tryParse(parts[2].substring(0, 4)) ?? 0;
      if (y > 0 && m >= 1 && m <= 12 && d >= 1 && d <= 31) {
        return DateTime(y, m, d);
      }
    }
    return null;
  }

  DateTime? _parseDateTime(String dateRaw, String timeRaw) {
    final day = _parseDateOnly(dateRaw);
    if (day == null) return null;
    final parts = timeRaw.trim().split(':');
    if (parts.isEmpty) return null;
    final hh = int.tryParse(parts[0]) ?? 0;
    final mm = parts.length > 1 ? int.tryParse(parts[1]) ?? 0 : 0;
    return DateTime(day.year, day.month, day.day, hh, mm);
  }

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
    final bookingArenaId =
        _readString(bookingData, ['arenaId', 'arena_id', 'idArena']);
    final bookingUserId = _readString(
      bookingData,
      ['athleteId', 'bookingAthleteId', 'userId', 'user_id'],
    );
    if (bookingArenaId.isNotEmpty && bookingArenaId != aid) {
      throw Exception('Avaliação permitida apenas após a reserva concluída.');
    }
    if (bookingUserId.isNotEmpty && bookingUserId != uid) {
      throw Exception('Avaliação permitida apenas após a reserva concluída.');
    }
    final bookingStatus = (bookingData['status'] as String?)?.trim().toLowerCase() ?? '';
    final explicitlyCompleted =
        bookingStatus == 'completed' || bookingStatus == 'finalizado';
    final isCanceled =
        bookingStatus == 'canceled' || bookingStatus == 'cancelled';
    if (isCanceled) {
      throw Exception('Avaliação não permitida para reserva cancelada.');
    }
    final dateRaw = _readString(bookingData, ['date', 'bookingDate', 'data']);
    final startTime =
        _readString(bookingData, ['startTime', 'start', 'horaInicio']);
    final endTime = _readString(bookingData, ['endTime', 'end', 'horaFim']);
    final startAt = _parseDateTime(dateRaw, startTime);
    var endAt = _parseDateTime(dateRaw, endTime);
    if (startAt != null && endAt != null && !endAt.isAfter(startAt)) {
      endAt = endAt.add(const Duration(days: 1));
    }
    // Se não conseguir parsear datas, confia no status da reserva ou na validação do provider
    final completedByTime = endAt != null &&
        DateTime.now().isAfter(endAt.add(_reviewPromptDelayAfterEnd));
    final isCompleted = explicitlyCompleted || completedByTime || endAt == null;
    if (!isCompleted) {
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
