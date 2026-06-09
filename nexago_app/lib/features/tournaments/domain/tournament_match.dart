import 'tournament_match_point_action.dart';
import 'tournament_match_set.dart';
import 'tournament_match_status.dart';

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
    this.sets = const [],
    this.lastActions = const [],
    this.currentSetIndex,
    this.winnerId,
    this.scheduleTime,
    this.matchStartedAt,
    this.matchEndedAt,
    this.teamADescription,
    this.teamBDescription,
    this.courtName,
    this.description,
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
  final List<TournamentMatchSet> sets;
  final List<TournamentMatchPointAction> lastActions;
  final int? currentSetIndex;
  final String? winnerId;
  final DateTime? scheduleTime;
  final DateTime? matchStartedAt;
  final DateTime? matchEndedAt;
  final String? teamADescription;
  final String? teamBDescription;
  final String? courtName;
  final String? description;

  bool get isBracketMatch {
    if (isGroupMatch) return false;
    final t = matchType.toLowerCase();
    if (t == 'group') return false;
    if (poolId.trim().isNotEmpty) return false;
    return true;
  }

  bool get isPoolMatch =>
      isGroupMatch || matchType.toLowerCase() == 'group' || poolId.isNotEmpty;

  bool get isCompleted => TournamentMatchStatus.isCompleted(status);

  bool get isInProgress => TournamentMatchStatus.isInProgress(status);

  String get scoreLabel {
    if (sets.isNotEmpty) {
      final a = sets.map((s) => '${s.a}-${s.b}').join(', ');
      final b = sets.map((s) => '${s.b}-${s.a}').join(', ');
      if (a.isNotEmpty && b.isNotEmpty) return '$a × $b';
    }
    if (resultA.isNotEmpty && resultB.isNotEmpty) {
      return '$resultA × $resultB';
    }
    return 'A definir';
  }

  String get teamsLabel {
    final a = teamADescription?.trim().isNotEmpty == true
        ? teamADescription!.trim()
        : (teamAId.isNotEmpty ? teamAId : 'TBD');
    final b = teamBDescription?.trim().isNotEmpty == true
        ? teamBDescription!.trim()
        : (teamBId.isNotEmpty ? teamBId : 'TBD');
    return '$a vs $b';
  }

  bool athleteTeamWon(String teamId) {
    final winner = winnerId?.trim() ?? '';
    final id = teamId.trim();
    return winner.isNotEmpty && id.isNotEmpty && winner == id;
  }

  String? opponentTeamIdFor(String teamId) {
    final id = teamId.trim();
    if (id.isEmpty) return null;
    if (teamAId == id) return teamBId.isNotEmpty ? teamBId : null;
    if (teamBId == id) return teamAId.isNotEmpty ? teamAId : null;
    return null;
  }
}
