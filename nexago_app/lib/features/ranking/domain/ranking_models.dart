import 'package:cloud_firestore/cloud_firestore.dart';

int _readInt(dynamic value) {
  if (value is int) return value;
  if (value is num) return value.round();
  if (value is String) return int.tryParse(value.trim()) ?? 0;
  return 0;
}

String? _readStr(dynamic value) {
  if (value is! String) return null;
  final trimmed = value.trim();
  return trimmed.isEmpty ? null : trimmed;
}

DateTime? _readTimestamp(dynamic value) {
  if (value is Timestamp) return value.toDate();
  return null;
}

/// Resultado de equipe em categoria finalizada.
class TournamentCategoryResult {
  const TournamentCategoryResult({
    required this.id,
    required this.tournamentId,
    required this.categoryId,
    required this.teamId,
    required this.finalPlace,
    required this.pointsEarned,
    required this.year,
    this.completedAt,
  });

  final String id;
  final String tournamentId;
  final String categoryId;
  final String teamId;
  final int finalPlace;
  final int pointsEarned;
  final int year;
  final DateTime? completedAt;

  factory TournamentCategoryResult.fromFirestore(
    DocumentSnapshot<Map<String, dynamic>> doc,
  ) {
    final data = doc.data() ?? {};
    return TournamentCategoryResult(
      id: doc.id,
      tournamentId: _readStr(data['tournamentId']) ?? '',
      categoryId: _readStr(data['categoryId']) ?? '',
      teamId: _readStr(data['teamId']) ?? '',
      finalPlace: _readInt(data['finalPlace']),
      pointsEarned: _readInt(data['pointsEarned']),
      year: _readInt(data['year']),
      completedAt: _readTimestamp(data['completedAt']),
    );
  }
}

/// Documento agregado em `athleteRankings/{athleteId}`.
class AthleteRankingEntry {
  const AthleteRankingEntry({
    required this.athleteId,
    required this.totalPoints,
    required this.tournamentsCount,
    this.lastUpdated,
    this.pointsByYear = const {},
  });

  final String athleteId;
  final int totalPoints;
  final int tournamentsCount;
  final DateTime? lastUpdated;
  final Map<String, int> pointsByYear;

  factory AthleteRankingEntry.fromFirestore(
    DocumentSnapshot<Map<String, dynamic>> doc,
  ) {
    final data = doc.data() ?? {};
    final rawByYear = data['pointsByYear'];
    final byYear = <String, int>{};
    if (rawByYear is Map) {
      for (final entry in rawByYear.entries) {
        final key = entry.key.toString();
        final value = entry.value;
        if (value is num) {
          byYear[key] = value.round();
        }
      }
    }
    return AthleteRankingEntry(
      athleteId: doc.id,
      totalPoints: _readInt(data['totalPoints']),
      tournamentsCount: _readInt(data['tournamentsCount']),
      lastUpdated: _readTimestamp(data['lastUpdated']),
      pointsByYear: byYear,
    );
  }
}

/// Linha de ranking com posição calculada no cliente.
class AthleteRankingRow {
  const AthleteRankingRow({
    required this.rank,
    required this.athleteId,
    required this.totalPoints,
    required this.tournamentsCount,
    this.pointsByYear = const {},
  });

  final int rank;
  final String athleteId;
  final int totalPoints;
  final int tournamentsCount;
  final Map<String, int> pointsByYear;

  AthleteRankingRow copyWith({
    int? rank,
    int? totalPoints,
    int? tournamentsCount,
    Map<String, int>? pointsByYear,
  }) {
    return AthleteRankingRow(
      rank: rank ?? this.rank,
      athleteId: athleteId,
      totalPoints: totalPoints ?? this.totalPoints,
      tournamentsCount: tournamentsCount ?? this.tournamentsCount,
      pointsByYear: pointsByYear ?? this.pointsByYear,
    );
  }
}

/// Jogadores de uma equipe (leitura auxiliar).
class RankingTeamPlayers {
  const RankingTeamPlayers({
    required this.teamId,
    this.player1Id,
    this.player2Id,
    this.teamName,
    this.gender,
    this.teamSize,
    this.memberUids = const [],
  });

  factory RankingTeamPlayers.fromDoc(String teamId, Map<String, dynamic> data) {
    final rawSize = data['teamSize'];
    final rawMembers = data['memberUids'];
    return RankingTeamPlayers(
      teamId: teamId,
      player1Id: _readStr(data['player1Id']),
      player2Id: _readStr(data['player2Id']),
      teamName: _readStr(data['teamName']),
      gender: _readStr(data['gender']),
      teamSize: rawSize is num && rawSize >= 3 ? rawSize.toInt() : null,
      memberUids: rawMembers is List
          ? [
              for (final uid in rawMembers)
                if (uid is String && uid.trim().isNotEmpty) uid.trim(),
            ]
          : const [],
    );
  }

  final String teamId;
  final String? player1Id;
  final String? player2Id;
  final String? teamName;
  final String? gender;

  /// 3–5 nas equipes nomeadas (trio/quarteto/quinteto); dupla legada não grava.
  final int? teamSize;

  /// Elenco das equipes nomeadas — dupla legada fica vazio (só player1/player2).
  final List<String> memberUids;

  /// Elenco resolvido — espelha `extractTeamMemberUids` (functions): `memberUids`
  /// vence (equipes nomeadas espelham só os 2 primeiros em player1/player2);
  /// dupla legada cai em player1Id/player2Id. Com dedup: a dupla incompleta
  /// (player1 == player2) conta o atleta uma vez só.
  List<String> get memberIds {
    final out = <String>[];
    void push(String? raw) {
      final id = raw?.trim() ?? '';
      if (id.isNotEmpty && !out.contains(id)) out.add(id);
    }

    memberUids.forEach(push);
    if (out.isEmpty) {
      push(player1Id);
      push(player2Id);
    }
    return out;
  }
}

/// Documento agregado em `teamRankings/{teamId}`.
class TeamRankingEntry {
  const TeamRankingEntry({
    required this.teamId,
    required this.totalPoints,
    required this.tournamentsCount,
    this.lastUpdated,
    this.pointsByYear = const {},
  });

  final String teamId;
  final int totalPoints;
  final int tournamentsCount;
  final DateTime? lastUpdated;
  final Map<String, int> pointsByYear;

  factory TeamRankingEntry.fromFirestore(
    DocumentSnapshot<Map<String, dynamic>> doc,
  ) {
    final data = doc.data() ?? {};
    final rawByYear = data['pointsByYear'];
    final byYear = <String, int>{};
    if (rawByYear is Map) {
      for (final entry in rawByYear.entries) {
        final key = entry.key.toString();
        final value = entry.value;
        if (value is num) {
          byYear[key] = value.round();
        }
      }
    }
    return TeamRankingEntry(
      teamId: doc.id,
      totalPoints: _readInt(data['totalPoints']),
      tournamentsCount: _readInt(data['tournamentsCount']),
      lastUpdated: _readTimestamp(data['lastUpdated']),
      pointsByYear: byYear,
    );
  }
}

/// Linha de ranking de equipe com posição calculada no cliente.
class TeamRankingRow {
  const TeamRankingRow({
    required this.rank,
    required this.teamId,
    required this.totalPoints,
    required this.tournamentsCount,
    this.pointsByYear = const {},
  });

  final int rank;
  final String teamId;
  final int totalPoints;
  final int tournamentsCount;
  final Map<String, int> pointsByYear;

  TeamRankingRow copyWith({
    int? rank,
    int? totalPoints,
    int? tournamentsCount,
    Map<String, int>? pointsByYear,
  }) {
    return TeamRankingRow(
      rank: rank ?? this.rank,
      teamId: teamId,
      totalPoints: totalPoints ?? this.totalPoints,
      tournamentsCount: tournamentsCount ?? this.tournamentsCount,
      pointsByYear: pointsByYear ?? this.pointsByYear,
    );
  }
}
