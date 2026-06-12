import 'package:cloud_firestore/cloud_firestore.dart';

import '../domain/tournament_match_point_event.dart';

abstract final class TournamentMatchPointEventMapper {
  TournamentMatchPointEventMapper._();

  static TournamentMatchPointEvent? fromSnapshot(
    DocumentSnapshot<Map<String, dynamic>> doc,
  ) {
    if (!doc.exists) return null;
    final data = doc.data();
    if (data == null) return null;
    return fromMap(data);
  }

  static TournamentMatchPointEvent? fromMap(Map<String, dynamic> data) {
    final seq = _int(data['seq']);
    final type = _str(data['type']);
    final setIndex = _int(data['setIndex']);
    final ts = _timestamp(data['ts']);
    if (seq == null || type == null || setIndex == null || ts == null) {
      return null;
    }

    return TournamentMatchPointEvent(
      seq: seq,
      type: type,
      setIndex: setIndex,
      side: _str(data['side']),
      scoreA: _int(data['scoreA']) ?? 0,
      scoreB: _int(data['scoreB']) ?? 0,
      ts: ts,
    );
  }

  static String? _str(dynamic value) {
    if (value is String && value.trim().isNotEmpty) return value.trim();
    return null;
  }

  static int? _int(dynamic value) {
    if (value is int) return value;
    if (value is num) return value.toInt();
    return null;
  }

  static DateTime? _timestamp(dynamic value) {
    if (value == null) return null;
    if (value is Timestamp) return value.toDate();
    if (value is DateTime) return value;
    return null;
  }
}
