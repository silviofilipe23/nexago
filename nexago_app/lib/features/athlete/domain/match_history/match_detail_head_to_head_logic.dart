import 'package:intl/intl.dart';

import '../../../tournaments/domain/tournament_match.dart';
import '../../../tournaments/domain/tournament_match_display.dart';
import '../../../tournaments/domain/tournament_match_status.dart';
import 'athlete_match_detail_models.dart';

const kMatchDetailHeadToHeadPastMatchLimit = 3;

List<TournamentMatch> mutualMatchesBetweenTeams({
  required List<TournamentMatch> ourTeamMatches,
  required List<TournamentMatch> opponentTeamMatches,
  required String ourTeamId,
  required String opponentTeamId,
  required String excludeMatchId,
}) {
  final ourId = ourTeamId.trim();
  final oppId = opponentTeamId.trim();
  final excludeId = excludeMatchId.trim();
  if (ourId.isEmpty || oppId.isEmpty) return const [];

  final byId = <String, TournamentMatch>{};
  for (final match in [...ourTeamMatches, ...opponentTeamMatches]) {
    byId[match.id] = match;
  }

  return byId.values.where((match) {
    if (!_isMutualMatch(match, ourId: ourId, oppId: oppId)) return false;
    if (!TournamentMatchStatus.isCompleted(match.status)) return false;
    if (excludeId.isNotEmpty && match.id == excludeId) return false;
    if (playedAtForMatch(match) == null) return false;
    final winner = match.winnerId?.trim() ?? '';
    if (winner.isEmpty) return false;
    return true;
  }).toList()
    ..sort(compareMatchesChronologicallyDesc);
}

MatchDetailHeadToHeadInfo? buildMatchDetailHeadToHeadInfo({
  required List<TournamentMatch> ourTeamMatches,
  required List<TournamentMatch> opponentTeamMatches,
  required String ourTeamId,
  required String opponentTeamId,
  required String excludeMatchId,
  required String opponentLabel,
  required MatchDetailPhase phase,
  required Map<String, String> tournamentNames,
}) {
  final ourId = ourTeamId.trim();
  if (ourId.isEmpty) return null;

  final effectiveExcludeMatchId = phase == MatchDetailPhase.scheduled
      ? excludeMatchId
      : '';

  final mutual = mutualMatchesBetweenTeams(
    ourTeamMatches: ourTeamMatches,
    opponentTeamMatches: opponentTeamMatches,
    ourTeamId: ourTeamId,
    opponentTeamId: opponentTeamId,
    excludeMatchId: effectiveExcludeMatchId,
  );
  if (mutual.isEmpty) return null;

  var ourWins = 0;
  var ourLosses = 0;
  for (final match in mutual) {
    if (match.athleteTeamWon(ourId)) {
      ourWins++;
    } else {
      ourLosses++;
    }
  }

  if (ourWins + ourLosses == 0) return null;

  final pastMatches = [
    for (final match in mutual.take(kMatchDetailHeadToHeadPastMatchLimit))
      MatchDetailHeadToHeadPastMatch(
        isWin: match.athleteTeamWon(ourId),
        label: _pastMatchLabel(match, tournamentNames),
        score: _setsScoreLabelForTeam(match, ourId),
      ),
  ];

  return MatchDetailHeadToHeadInfo(
    title: _headToHeadTitle(
      phase: phase,
      opponentLabel: opponentLabel,
      ourWins: ourWins,
      ourLosses: ourLosses,
    ),
    ourWins: ourWins,
    ourLosses: ourLosses,
    pastMatches: pastMatches,
  );
}

bool _isMutualMatch(
  TournamentMatch match, {
  required String ourId,
  required String oppId,
}) {
  final a = match.teamAId.trim();
  final b = match.teamBId.trim();
  return (a == ourId && b == oppId) || (a == oppId && b == ourId);
}

String _headToHeadTitle({
  required MatchDetailPhase phase,
  required String opponentLabel,
  required int ourWins,
  required int ourLosses,
}) {
  if (phase == MatchDetailPhase.scheduled) {
    if (ourWins > ourLosses) return 'Você leva vantagem';
    if (ourWins < ourLosses) return 'Adversário leva vantagem';
    return 'Empate no histórico';
  }
  return 'Você vs $opponentLabel';
}

String _pastMatchLabel(
  TournamentMatch match,
  Map<String, String> tournamentNames,
) {
  final tournamentName =
      tournamentNames[match.tournamentId]?.trim().isNotEmpty == true
          ? tournamentNames[match.tournamentId]!.trim()
          : 'Torneio';
  final playedAt = playedAtForMatch(match);
  if (playedAt == null) return tournamentName;
  final monthYear = DateFormat('MMM yy', 'pt_BR').format(playedAt);
  return '$tournamentName · $monthYear';
}

String _setsScoreLabelForTeam(TournamentMatch match, String ourTeamId) {
  final counts = setsWonCountForMatch(match);
  final isTeamA = match.teamAId.trim() == ourTeamId.trim();
  final ours = isTeamA ? counts.$1 : counts.$2;
  final theirs = isTeamA ? counts.$2 : counts.$1;
  return '$ours-$theirs';
}
