import 'package:cloud_firestore/cloud_firestore.dart';

import '../domain/tournament_match.dart';

abstract final class TournamentMatchMapper {
  TournamentMatchMapper._();

  static TournamentMatch? fromSnapshot(
    DocumentSnapshot<Map<String, dynamic>> doc,
  ) {
    if (!doc.exists) return null;
    final data = doc.data();
    if (data == null) return null;
    return fromMap(doc.id, data);
  }

  static TournamentMatch fromMap(String id, Map<String, dynamic> data) {
    return TournamentMatch(
      id: id,
      tournamentId: _str(data['tournamentId']) ?? '',
      categoryId: _str(data['categoryId']) ?? '',
      round: _int(data['round']) ?? 0,
      matchType: _str(data['matchType']) ?? '',
      poolId: _str(data['poolId']) ?? '',
      teamAId: _str(data['teamAId']) ?? '',
      teamBId: _str(data['teamBId']) ?? '',
      status: _str(data['status']) ?? 'Scheduled',
      resultA: _str(data['resultA']) ?? '',
      resultB: _str(data['resultB']) ?? '',
      isGroupMatch: data['isGroupMatch'] == true,
      matchNumber: _int(data['matchNumber']) ?? 0,
    );
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
}
