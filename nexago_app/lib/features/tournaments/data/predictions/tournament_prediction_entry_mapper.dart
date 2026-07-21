import 'package:cloud_firestore/cloud_firestore.dart';

import '../../domain/predictions/tournament_prediction_entry.dart';

abstract final class TournamentPredictionEntryMapper {
  TournamentPredictionEntryMapper._();

  static TournamentPredictionEntry? fromSnapshot(
    DocumentSnapshot<Map<String, dynamic>> doc,
  ) {
    if (!doc.exists) return null;
    final data = doc.data();
    if (data == null) return null;
    return fromMap(doc.id, data);
  }

  static TournamentPredictionEntry fromMap(
    String userId,
    Map<String, dynamic> data,
  ) {
    return TournamentPredictionEntry(
      userId: userId,
      picks: _picks(data['picks']),
      championPick: _str(data['championPick']),
      score: _int(data['score']) ?? 0,
      submittedAt: _timestamp(data['submittedAt']),
      updatedAt: _timestamp(data['updatedAt']),
    );
  }

  static Map<String, String> _picks(dynamic raw) {
    if (raw is! Map) return const {};
    final result = <String, String>{};
    raw.forEach((key, value) {
      if (key is! String || value is! String) return;
      final matchId = key.trim();
      final teamId = value.trim();
      if (matchId.isEmpty || teamId.isEmpty) return;
      result[matchId] = teamId;
    });
    return result;
  }

  static String? _str(dynamic v) {
    if (v is String && v.trim().isNotEmpty) return v.trim();
    return null;
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
