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
    required this.likesCount,
    required this.reported,
    this.athleteName,
    this.reply,
  });

  final String id;
  final String arenaId;
  final String userId;
  final String bookingId;
  final int rating;
  final String? comment;
  final DateTime? createdAt;
  final int likesCount;
  final bool reported;
  final String? athleteName;
  final ArenaReviewReply? reply;

  ArenaReview copyWith({
    String? athleteName,
    ArenaReviewReply? reply,
    int? likesCount,
    bool? reported,
  }) {
    return ArenaReview(
      id: id,
      arenaId: arenaId,
      userId: userId,
      bookingId: bookingId,
      rating: rating,
      comment: comment,
      createdAt: createdAt,
      likesCount: likesCount ?? this.likesCount,
      reported: reported ?? this.reported,
      athleteName: athleteName ?? this.athleteName,
      reply: reply ?? this.reply,
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
      likesCount: (data['likesCount'] as num?)?.toInt() ?? 0,
      reported: data['reported'] == true,
      athleteName: null,
      reply: ArenaReviewReply.fromMap(data['reply']),
    );
  }
}

class ArenaReviewReply {
  const ArenaReviewReply({
    required this.message,
    required this.createdAt,
    this.updatedAt,
    this.repliedBy,
  });

  final String message;
  final DateTime? createdAt;
  final DateTime? updatedAt;
  final String? repliedBy;

  static ArenaReviewReply? fromMap(dynamic raw) {
    if (raw is! Map<String, dynamic>) return null;
    final message = (raw['message'] as String?)?.trim() ?? '';
    if (message.isEmpty) return null;
    final createdAt = raw['createdAt'] is Timestamp
        ? (raw['createdAt'] as Timestamp).toDate()
        : null;
    final updatedAt = raw['updatedAt'] is Timestamp
        ? (raw['updatedAt'] as Timestamp).toDate()
        : null;
    final repliedBy = (raw['repliedBy'] as String?)?.trim();
    return ArenaReviewReply(
      message: message,
      createdAt: createdAt,
      updatedAt: updatedAt,
      repliedBy: repliedBy == null || repliedBy.isEmpty ? null : repliedBy,
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
