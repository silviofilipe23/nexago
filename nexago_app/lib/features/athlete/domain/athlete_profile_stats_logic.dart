import '../../tournaments/domain/compete_hub_models.dart';
import '../../tournaments/domain/tournament_match.dart';
import '../../tournaments/domain/tournament_match_status.dart';
import '../../tournaments/domain/tournament_team.dart';
import 'gamification_models.dart';
import 'match_history/athlete_match_history_models.dart';

/// Estatísticas agregadas exibidas no grid do perfil do atleta.
class AthleteProfileStats {
  const AthleteProfileStats({
    required this.games,
    required this.wins,
    required this.streak,
    required this.rankingLabel,
  });

  final int games;
  final int wins;
  final int streak;
  final String rankingLabel;

  static const empty = AthleteProfileStats(
    games: 0,
    wins: 0,
    streak: 0,
    rankingLabel: '—',
  );
}

AthleteProfileStats buildAthleteProfileStats({
  required GamificationSummary gamification,
  required List<AthleteMatchHistoryItem> matches,
  CompeteHubUserRanking? ranking,
}) {
  return AthleteProfileStats(
    games: matches.length,
    wins: matches.where((m) => m.isWin).length,
    streak: gamification.streak,
    rankingLabel: formatProfileRankingLabel(ranking),
  );
}

String formatProfileRankingLabel(CompeteHubUserRanking? ranking) {
  if (ranking == null || ranking.isUnranked || ranking.rank <= 0) {
    return '—';
  }
  return '#${ranking.rank}';
}

/// Conta partidas concluídas jogadas ao lado de cada parceiro (dupla).
Map<String, int> countSharedMatchesByPartner({
  required String athleteId,
  required Iterable<TournamentMatch> completedMatches,
  required Map<String, TournamentTeam> teams,
}) {
  final uid = athleteId.trim();
  if (uid.isEmpty) return const {};

  final counts = <String, int>{};
  for (final match in completedMatches) {
    if (!TournamentMatchStatus.isCompleted(match.status)) continue;

    final athleteTeamId = _athleteTeamIdForMatch(match, teams.keys.toSet());
    if (athleteTeamId == null) continue;

    final team = teams[athleteTeamId];
    if (team == null || !team.containsPlayer(uid)) continue;

    final partnerId = _partnerIdForTeam(team, uid);
    if (partnerId == null) continue;

    counts[partnerId] = (counts[partnerId] ?? 0) + 1;
  }
  return counts;
}

String formatPartnerGamesLabel(int matchCount) {
  if (matchCount <= 0) return 'DUPLA';
  if (matchCount == 1) return '1 JOGO';
  return '$matchCount JOGOS';
}

String? _partnerIdForTeam(TournamentTeam team, String athleteId) {
  final p1 = team.player1Id.trim();
  final p2 = team.player2Id.trim();
  if (p1 == athleteId && p2.isNotEmpty && p2 != athleteId) return p2;
  if (p2 == athleteId && p1.isNotEmpty && p1 != athleteId) return p1;
  return null;
}

String? _athleteTeamIdForMatch(TournamentMatch match, Set<String> athleteTeamIds) {
  if (athleteTeamIds.contains(match.teamAId)) return match.teamAId;
  if (athleteTeamIds.contains(match.teamBId)) return match.teamBId;
  return null;
}
