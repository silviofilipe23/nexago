/// Partida em `artifacts/{projectId}/public/data/matches`.
class TournamentMatch {
  const TournamentMatch({
    required this.id,
    required this.tournamentId,
    required this.categoryId,
    required this.round,
    required this.matchType,
    required this.poolId,
    required this.teamAId,
    required this.teamBId,
    required this.status,
    required this.resultA,
    required this.resultB,
    required this.isGroupMatch,
    required this.matchNumber,
  });

  final String id;
  final String tournamentId;
  final String categoryId;
  final int round;
  final String matchType;
  final String poolId;
  final String teamAId;
  final String teamBId;
  final String status;
  final String resultA;
  final String resultB;
  final bool isGroupMatch;
  final int matchNumber;

  bool get isBracketMatch {
    if (isGroupMatch) return false;
    final t = matchType.toLowerCase();
    if (t == 'group') return false;
    if (poolId.trim().isNotEmpty) return false;
    return true;
  }

  bool get isPoolMatch =>
      isGroupMatch || matchType.toLowerCase() == 'group' || poolId.isNotEmpty;

  String get scoreLabel {
    if (resultA.isNotEmpty && resultB.isNotEmpty) {
      return '$resultA × $resultB';
    }
    return 'A definir';
  }

  String get teamsLabel {
    final a = teamAId.isNotEmpty ? teamAId : 'TBD';
    final b = teamBId.isNotEmpty ? teamBId : 'TBD';
    return '$a vs $b';
  }
}
