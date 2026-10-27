import '../../../tournaments/domain/compete_hub_models.dart';
import '../../../tournaments/domain/tournament_match.dart';
import '../../../tournaments/domain/tournament_match_display.dart';
import '../../../tournaments/domain/tournament_match_status.dart';
import '../athlete_profile_stats_logic.dart';
import '../gamification_models.dart';
import '../sand_rank/sand_rank_catalog.dart';
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
  bool eloEnabled = false,
}) {
  if (phase != MatchDetailPhase.completed || !isParticipantView || !isWin) {
    return null;
  }

  final rankLabel = formatProfileRankingLabel(ranking);
  final elo = matchDetailEloProgress(gamification, eloEnabled: eloEnabled);
  final streak = tournamentWinStreakIncludingMatch(
    matches: ourTeamMatches,
    teamId: ourTeamId,
    throughMatchId: currentMatchId,
  );

  return MatchDetailXpInfo(
    xpGained: confirmedXpGained,
    rankLabel: rankLabel,
    streakLabel: _streakLabel(streak),
    levelProgressLabel: elo?.label,
    progress: elo?.progress,
  );
}

/// Progresso do elo no card ("faltam 38 XP pra Iniciante II"). O XP move só o
/// elo — nível é habilidade e não sai do XP. Sem a flag do elo, o card fica
/// sem a linha de progresso.
({String label, double progress})? matchDetailEloProgress(
  GamificationSummary? gamification, {
  required bool eloEnabled,
}) {
  if (gamification == null || !eloEnabled) return null;
  final progress = sandRankProgressFromXp(gamification.xp);
  final next = progress.next;
  return (
    label: next == null
        ? 'topo da trilha de elos'
        : 'faltam ${progress.xpToNext} XP pra ${sandRankLabel(next)}',
    progress: progress.progress,
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
