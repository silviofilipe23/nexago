import 'package:cloud_firestore/cloud_firestore.dart';

class TournamentMatchSet {
  const TournamentMatchSet({
    required this.a,
    required this.b,
    this.startedAt,
    this.endedAt,
  });

  final int a;
  final int b;
  final DateTime? startedAt;
  final DateTime? endedAt;

  factory TournamentMatchSet.fromMap(Map<String, dynamic> map) {
    return TournamentMatchSet(
      a: (map['a'] as num?)?.toInt() ?? 0,
      b: (map['b'] as num?)?.toInt() ?? 0,
      startedAt: _timestamp(map['startedAt']),
      endedAt: _timestamp(map['endedAt']),
    );
  }

  Map<String, dynamic> toMap() => {
        'a': a,
        'b': b,
        if (startedAt != null) 'startedAt': startedAt,
        if (endedAt != null) 'endedAt': endedAt,
      };

  static DateTime? _timestamp(dynamic value) {
    if (value == null) return null;
    if (value is Timestamp) return value.toDate();
    if (value is DateTime) return value;
    return null;
  }
}
