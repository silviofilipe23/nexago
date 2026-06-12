import '../../../tournaments/domain/compete_hub_models.dart';
import '../../../tournaments/domain/tournament_match.dart';
import '../../../tournaments/domain/tournament_match_display.dart';
import '../../../tournaments/domain/tournament_match_status.dart';
import '../athlete_profile_stats_logic.dart';
import '../gamification_models.dart';
import 'athlete_match_detail_models.dart';

MatchDetailXpInfo? buildMatchDetailXpInfo({
  required MatchDetailPhase phase,
  required bool isParticipantView,
  required bool isWin,
  required List<TournamentMatch> ourTeamMatches,
  required String ourTeamId,
  required String currentMatchId,
  CompeteHubUserRanking? ranking,
  GamificationSummary? gamification,
  int? confirmedXpGained,
}) {
  if (phase != MatchDetailPhase.completed || !isParticipantView || !isWin) {
    return null;
  }

  final rankLabel = formatProfileRankingLabel(ranking);
  final streak = tournamentWinStreakIncludingMatch(
    matches: ourTeamMatches,
    teamId: ourTeamId,
    throughMatchId: currentMatchId,
  );

  return MatchDetailXpInfo(
    xpGained: confirmedXpGained,
    rankLabel: rankLabel,
    streakLabel: _streakLabel(streak),
    levelProgressLabel: gamification == null
        ? null
        : 'faltam ${gamification.xpForNextLevel} XP pro nível ${gamification.level + 1}',
    progress: gamification?.progressToNextLevel,
  );
}

int tournamentWinStreakIncludingMatch({
  required List<TournamentMatch> matches,
  required String teamId,
  required String throughMatchId,
}) {
  final id = teamId.trim();
  final throughId = throughMatchId.trim();
  if (id.isEmpty) return 0;

  final eligible = matches.where((match) {
    if (!TournamentMatchStatus.isCompleted(match.status)) return false;
    if (playedAtForMatch(match) == null) return false;
    final winner = match.winnerId?.trim() ?? '';
    if (winner.isEmpty) return false;
    return match.teamAId.trim() == id || match.teamBId.trim() == id;
  }).toList()
    ..sort(compareMatchesChronologicallyDesc);

  final startIndex = throughId.isNotEmpty
      ? eligible.indexWhere((match) => match.id == throughId)
      : 0;
  if (startIndex < 0) return 0;

  var streak = 0;
  for (var i = startIndex; i < eligible.length; i++) {
    if (!eligible[i].athleteTeamWon(id)) break;
    streak++;
  }
  return streak;
}

String _streakLabel(int streak) {
  if (streak <= 0) return '1 vitória';
  if (streak == 1) return '1 vitória';
  return '$streak vitórias seguidas';
}
