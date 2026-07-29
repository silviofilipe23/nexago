import 'package:cloud_firestore/cloud_firestore.dart';

/// Time em `artifacts/{projectId}/public/data/teams`.
class TournamentTeam {
  const TournamentTeam({
    required this.id,
    required this.player1Id,
    required this.player2Id,
    this.teamName,
    this.gender,
    this.createdAt,
  });

  final String id;
  final String player1Id;
  final String player2Id;
  final String? teamName;
  final String? gender;
  final DateTime? createdAt;

  bool get isLookingForPartner {
    final p1 = player1Id.trim();
    final p2 = player2Id.trim();
    if (p1.isEmpty) return false;
    return p1 == p2;
  }

  /// IDs de atleta do time, sem duplicatas nem vazios (1 item se dupla
  /// incompleta/individual, 2 se completa).
  List<String> get playerIds {
    final ids = <String>{};
    final p1 = player1Id.trim();
    final p2 = player2Id.trim();
    if (p1.isNotEmpty) ids.add(p1);
    if (p2.isNotEmpty) ids.add(p2);
    return ids.toList();
  }

  bool containsPlayer(String uid) {
    final id = uid.trim();
    if (id.isEmpty) return false;
    return player1Id == id || player2Id == id;
  }

  factory TournamentTeam.fromFirestore(
    DocumentSnapshot<Map<String, dynamic>> doc,
  ) {
    final data = doc.data() ?? {};
    return TournamentTeam.fromMap(doc.id, data);
  }

  factory TournamentTeam.fromMap(String id, Map<String, dynamic> data) {
    return TournamentTeam(
      id: id,
      player1Id: _str(data['player1Id']) ?? '',
      player2Id: _str(data['player2Id']) ?? '',
      teamName: _str(data['teamName']),
      gender: _str(data['gender']),
      createdAt: _timestamp(data['createdAt']),
    );
  }

  static String? _str(dynamic v) {
    if (v is! String) return null;
    final t = v.trim();
    return t.isEmpty ? null : t;
  }

  static DateTime? _timestamp(dynamic v) {
    if (v is Timestamp) return v.toDate();
    return null;
  }
}
