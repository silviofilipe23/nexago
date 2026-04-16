import 'package:cloud_firestore/cloud_firestore.dart';

class ArenaReputation {
  const ArenaReputation({
    required this.arenaId,
    required this.ratingAverage,
    required this.reviewsCount,
    required this.star1,
    required this.star2,
    required this.star3,
    required this.star4,
    required this.star5,
    required this.responseRate,
    required this.avgResponseTimeMinutes,
    required this.score,
    this.lastUpdated,
  });

  final String arenaId;
  final double ratingAverage;
  final int reviewsCount;
  final int star1;
  final int star2;
  final int star3;
  final int star4;
  final int star5;
  final double responseRate;
  final int avgResponseTimeMinutes;
  final int score;
  final DateTime? lastUpdated;

  int starCount(int star) {
    return switch (star) {
      1 => star1,
      2 => star2,
      3 => star3,
      4 => star4,
      5 => star5,
      _ => 0,
    };
  }

  double starPercent(int star) {
    if (reviewsCount <= 0) return 0;
    return (starCount(star) / reviewsCount) * 100;
  }

  factory ArenaReputation.fromFirestore(
    DocumentSnapshot<Map<String, dynamic>> doc,
  ) {
    final data = doc.data() ?? <String, dynamic>{};
    final distribution =
        (data['ratingDistribution'] as Map<String, dynamic>?) ??
            <String, dynamic>{};
    return ArenaReputation(
      arenaId: (data['arenaId'] as String?)?.trim().isNotEmpty == true
          ? (data['arenaId'] as String).trim()
          : doc.id,
      ratingAverage: (data['ratingAverage'] as num?)?.toDouble() ?? 0,
      reviewsCount: (data['reviewsCount'] as num?)?.toInt() ?? 0,
      star1: (distribution['star1'] as num?)?.toInt() ?? 0,
      star2: (distribution['star2'] as num?)?.toInt() ?? 0,
      star3: (distribution['star3'] as num?)?.toInt() ?? 0,
      star4: (distribution['star4'] as num?)?.toInt() ?? 0,
      star5: (distribution['star5'] as num?)?.toInt() ?? 0,
      responseRate: (data['responseRate'] as num?)?.toDouble() ?? 0,
      avgResponseTimeMinutes:
          (data['avgResponseTimeMinutes'] as num?)?.toInt() ?? 0,
      score: (data['score'] as num?)?.toInt() ?? 0,
      lastUpdated: data['lastUpdated'] is Timestamp
          ? (data['lastUpdated'] as Timestamp).toDate()
          : null,
    );
  }
}
