import '../../../tournaments/domain/tournament_match.dart';
import '../../../tournaments/domain/tournament_match_display.dart';
import '../../../tournaments/domain/tournament_match_status.dart';
import 'athlete_match_detail_models.dart';

const kMatchDetailFormWindow = 5;

List<bool> recentFormResultsForTeam({
  required List<TournamentMatch> matches,
  required String teamId,
  required String excludeMatchId,
  int limit = kMatchDetailFormWindow,
}) {
  final id = teamId.trim();
  final excludeId = excludeMatchId.trim();
  if (id.isEmpty || limit <= 0) return const [];

  final eligible = matches.where((match) {
    if (!TournamentMatchStatus.isCompleted(match.status)) return false;
    if (excludeId.isNotEmpty && match.id == excludeId) return false;
    if (playedAtForMatch(match) == null) return false;
    final winner = match.winnerId?.trim() ?? '';
    if (winner.isEmpty) return false;
    return match.teamAId == id || match.teamBId == id;
  }).toList()
    ..sort(compareMatchesChronologicallyDesc);

  final recent = eligible.take(limit).toList();
  final results = recent
      .map((match) => match.athleteTeamWon(id))
      .toList(growable: false);

  return results.reversed.toList(growable: false);
}

List<MatchDetailFormRow> buildMatchDetailFormRows({
  required List<TournamentMatch> ourTeamMatches,
  required List<TournamentMatch> opponentTeamMatches,
  required String ourTeamId,
  required String opponentTeamId,
  required String excludeMatchId,
  required String ourLabel,
  required String opponentLabel,
  int limit = kMatchDetailFormWindow,
}) {
  final rows = <MatchDetailFormRow>[];

  final ourResults = recentFormResultsForTeam(
    matches: ourTeamMatches,
    teamId: ourTeamId,
    excludeMatchId: excludeMatchId,
    limit: limit,
  );
  if (ourResults.isNotEmpty) {
    rows.add(MatchDetailFormRow(label: ourLabel, results: ourResults));
  }

  final opponentResults = recentFormResultsForTeam(
    matches: opponentTeamMatches,
    teamId: opponentTeamId,
    excludeMatchId: excludeMatchId,
    limit: limit,
  );
  if (opponentResults.isNotEmpty) {
    rows.add(
      MatchDetailFormRow(label: opponentLabel, results: opponentResults),
    );
  }

  return rows;
}
