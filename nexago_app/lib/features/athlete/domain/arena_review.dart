import 'package:cloud_firestore/cloud_firestore.dart';

class ArenaReview {
  const ArenaReview({
    required this.id,
    required this.arenaId,
    required this.userId,
    required this.bookingId,
    required this.rating,
    required this.comment,
    required this.createdAt,
    this.athleteName,
  });

  final String id;
  final String arenaId;
  final String userId;
  final String bookingId;
  final int rating;
  final String? comment;
  final DateTime? createdAt;
  final String? athleteName;

  ArenaReview copyWith({String? athleteName}) {
    return ArenaReview(
      id: id,
      arenaId: arenaId,
      userId: userId,
      bookingId: bookingId,
      rating: rating,
      comment: comment,
      createdAt: createdAt,
      athleteName: athleteName ?? this.athleteName,
    );
  }

  factory ArenaReview.fromFirestore(
    DocumentSnapshot<Map<String, dynamic>> doc,
  ) {
    final data = doc.data() ?? <String, dynamic>{};
    final commentRaw = data['comment'];
    return ArenaReview(
      id: doc.id,
      arenaId: (data['arenaId'] as String?)?.trim() ?? '',
      userId: (data['userId'] as String?)?.trim() ?? '',
      bookingId: (data['bookingId'] as String?)?.trim() ?? '',
      rating: (data['rating'] as num?)?.toInt() ?? 0,
      comment: commentRaw is String && commentRaw.trim().isNotEmpty
          ? commentRaw.trim()
          : null,
      createdAt: data['createdAt'] is Timestamp
          ? (data['createdAt'] as Timestamp).toDate()
          : null,
      athleteName: null,
    );
  }
}

class PendingArenaReview {
  const PendingArenaReview({
    required this.bookingId,
    required this.arenaId,
    required this.arenaName,
    required this.courtName,
    required this.dateRaw,
    required this.startTime,
    required this.endTime,
  });

  final String bookingId;
  final String arenaId;
  final String arenaName;
  final String courtName;
  final String dateRaw;
  final String startTime;
  final String endTime;
}
