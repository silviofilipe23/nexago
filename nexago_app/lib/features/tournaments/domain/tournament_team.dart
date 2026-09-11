import 'package:cloud_firestore/cloud_firestore.dart';

/// Time em `artifacts/{projectId}/public/data/teams`.
///
/// Dupla legada guarda só `player1Id`/`player2Id`. Equipe nomeada
/// (trio/quarteto/quinteto) guarda o elenco inteiro em `memberUids` e espelha
/// apenas os dois primeiros em `player1Id`/`player2Id` — por isso ler o espelho
/// esconde o 3º integrante em diante. Use [memberIds].
class TournamentTeam {
  const TournamentTeam({
    required this.id,
    required this.player1Id,
    required this.player2Id,
    this.memberUids = const [],
    this.teamSize,
    this.captainUid,
    this.teamName,
    this.gender,
    this.createdAt,
  });

  final String id;
  final String player1Id;
  final String player2Id;

  /// Elenco das equipes nomeadas; dupla legada não grava (fica vazio).
  final List<String> memberUids;

  /// 3–5 nas equipes nomeadas (trio/quarteto/quinteto); dupla não grava.
  final int? teamSize;

  final String? captainUid;
  final String? teamName;
  final String? gender;
  final DateTime? createdAt;

  bool get isLookingForPartner {
    final p1 = player1Id.trim();
    final p2 = player2Id.trim();
    if (p1.isEmpty) return false;
    return p1 == p2;
  }

  /// IDs de atleta do time, na ordem do documento — espelha
  /// `extractTeamMemberUids` (functions): `memberUids` vence; dupla legada cai
  /// em player1/player2. Sem duplicatas nem vazios, então a dupla incompleta
  /// (player1 == player2) conta o atleta uma vez só.
  List<String> get memberIds {
    final ids = <String>[];
    void push(String? raw) {
      final id = raw?.trim() ?? '';
      if (id.isNotEmpty && !ids.contains(id)) ids.add(id);
    }

    memberUids.forEach(push);
    if (ids.isEmpty) {
      push(player1Id);
      push(player2Id);
    }
    return ids;
  }

  /// Capitão: `captainUid` quando gravado; senão quem abriu a equipe (primeiro
  /// do elenco).
  String? get captainId {
    final uid = captainUid?.trim();
    if (uid != null && uid.isNotEmpty) return uid;
    final ids = memberIds;
    return ids.isEmpty ? null : ids.first;
  }

  /// Equipe nomeada (trio pra cima), não dupla.
  bool get isLargeRoster => (teamSize ?? 0) > 2 || memberIds.length > 2;

  bool containsPlayer(String uid) {
    final id = uid.trim();
    if (id.isEmpty) return false;
    return memberIds.contains(id);
  }

  factory TournamentTeam.fromFirestore(
    DocumentSnapshot<Map<String, dynamic>> doc,
  ) {
    final data = doc.data() ?? {};
    return TournamentTeam.fromMap(doc.id, data);
  }

  factory TournamentTeam.fromMap(String id, Map<String, dynamic> data) {
    final rawSize = data['teamSize'];
    return TournamentTeam(
      id: id,
      player1Id: _str(data['player1Id']) ?? '',
      player2Id: _str(data['player2Id']) ?? '',
      memberUids: _strList(data['memberUids']),
      teamSize: rawSize is num && rawSize >= 3 ? rawSize.toInt() : null,
      captainUid: _str(data['captainUid']),
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

  static List<String> _strList(dynamic v) {
    if (v is! List) return const [];
    return [
      for (final raw in v)
        if (raw is String && raw.trim().isNotEmpty) raw.trim(),
    ];
  }

  static DateTime? _timestamp(dynamic v) {
    if (v is Timestamp) return v.toDate();
    return null;
  }
}
