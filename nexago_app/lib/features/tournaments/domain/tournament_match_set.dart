import 'package:cloud_firestore/cloud_firestore.dart';

class TournamentMatchSet {
  const TournamentMatchSet({
    required this.a,
    required this.b,
    this.startedAt,
    this.endedAt,
    this.tb,
  });

  final int a;
  final int b;

  /// Tie-break do set de games (ou super tie-break do set decisivo), quando
  /// houver. Ver `core/sports/scoring_rules.dart`.
  final ({int a, int b})? tb;
  final DateTime? startedAt;
  final DateTime? endedAt;

  factory TournamentMatchSet.fromMap(Map<String, dynamic> map) {
    return TournamentMatchSet(
      a: (map['a'] as num?)?.toInt() ?? 0,
      b: (map['b'] as num?)?.toInt() ?? 0,
      startedAt: _timestamp(map['startedAt']),
      endedAt: _timestamp(map['endedAt']),
      tb: _tiebreak(map['tb']),
    );
  }

  Map<String, dynamic> toMap() => {
        'a': a,
        'b': b,
        if (startedAt != null) 'startedAt': startedAt,
        if (endedAt != null) 'endedAt': endedAt,
        if (tb != null) 'tb': {'a': tb!.a, 'b': tb!.b},
      };

  static ({int a, int b})? _tiebreak(dynamic value) {
    if (value is! Map) return null;
    final a = value['a'];
    final b = value['b'];
    if (a is! num || b is! num) return null;
    return (a: a.toInt(), b: b.toInt());
  }

  static DateTime? _timestamp(dynamic value) {
    if (value == null) return null;
    if (value is Timestamp) return value.toDate();
    if (value is DateTime) return value;
    return null;
  }
}
