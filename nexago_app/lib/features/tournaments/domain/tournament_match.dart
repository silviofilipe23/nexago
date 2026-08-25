import 'tournament_match_live_score.dart';
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
    this.courtId = '',
    this.scheduleEndTime,
    this.dayKey = '',
    this.queueOrder = 0,
    this.queueStatus = '',
    this.checkInTeamAStatus = '',
    this.checkInTeamBStatus = '',
    this.servingTeamId = '',
    this.liveElapsedSec = 0,
    this.pointEventSeq = 0,
    this.reportStatus = '',
    this.reportedByUid = '',
    this.teamAConfirmed = false,
    this.teamBConfirmed = false,
    this.bestOf = 3,
    this.winnerAdvanceMatchNumber,
    this.winnerAdvanceSlot,
    this.loserAdvanceMatchNumber,
    this.loserAdvanceSlot,
    this.liveScore,
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
  final String courtId;
  final DateTime? scheduleEndTime;
  final String dayKey;
  final int queueOrder;
  final String queueStatus;
  final String checkInTeamAStatus;
  final String checkInTeamBStatus;
  final String servingTeamId;
  final int liveElapsedSec;
  final int pointEventSeq;
  final String reportStatus;
  final String reportedByUid;
  final bool teamAConfirmed;
  final bool teamBConfirmed;

  /// Número de sets da partida (formato): 1 = set único, 3 = melhor de 3.
  final int bestOf;

  /// Fiação da chave (plantas de `functions/src/bracket-definitions`): nº do
  /// jogo para onde o vencedor avança e o slot ('A'/'B') que ele ocupa lá.
  /// Nulos em partidas geradas antes da fiação explícita ou sem avanço (Final).
  final int? winnerAdvanceMatchNumber;
  final String? winnerAdvanceSlot;

  /// Para onde vai quem PERDE — só existe na dupla eliminação, onde a derrota
  /// manda o time para a repescagem em vez de eliminá-lo. É o que permite
  /// dizer "você cai para a repescagem, não está eliminado".
  final int? loserAdvanceMatchNumber;
  final String? loserAdvanceSlot;

  /// Placar parcial "ao vivo" do set em andamento (games/sets), gravado por
  /// `updateLiveMatchScore`. Só faz sentido exibir quando [isInProgress].
  final MatchLiveScore? liveScore;

  String get effectiveCourtLabel {
    if (courtId.isNotEmpty) return courtId;
    final name = courtName?.trim();
    if (name != null && name.isNotEmpty) return name;
    return '';
  }

  bool get isOnCourt => queueStatus == 'on_court';

  bool get isWaitingQueue =>
      queueStatus == 'waiting' || queueStatus == 'on_deck';

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

  bool get isCanceled => TournamentMatchStatus.isCanceled(status);

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
