import 'package:cloud_firestore/cloud_firestore.dart';

/// Placar parcial "ao vivo" (sets fechados + games do set em andamento) de
/// uma partida `In Progress`, espelho do campo `liveScore` gravado pela
/// callable `updateLiveMatchScore`.
class MatchLiveScore {
  const MatchLiveScore({
    required this.setsA,
    required this.setsB,
    required this.currentGamesA,
    required this.currentGamesB,
    this.updatedAt,
  });

  final int setsA;
  final int setsB;
  final int currentGamesA;
  final int currentGamesB;
  final DateTime? updatedAt;

  static const zero = MatchLiveScore(
    setsA: 0,
    setsB: 0,
    currentGamesA: 0,
    currentGamesB: 0,
  );

  factory MatchLiveScore.fromMap(Map<String, dynamic> map) {
    return MatchLiveScore(
      setsA: _int(map['setsA']) ?? 0,
      setsB: _int(map['setsB']) ?? 0,
      currentGamesA: _int(map['currentGamesA']) ?? 0,
      currentGamesB: _int(map['currentGamesB']) ?? 0,
      updatedAt: _timestamp(map['updatedAt']),
    );
  }

  static int? _int(dynamic v) {
    if (v is int) return v;
    if (v is num) return v.toInt();
    return null;
  }

  static DateTime? _timestamp(dynamic value) {
    if (value == null) return null;
    if (value is Timestamp) return value.toDate().toUtc();
    if (value is DateTime) return value.toUtc();
    return null;
  }
}
