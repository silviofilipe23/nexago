import 'athlete_match_history_models.dart';

class MatchTeamPlayer {
  const MatchTeamPlayer({
    required this.initials,
    required this.avatarColor,
    this.avatarUrl,
    this.name,
  });

  final String initials;
  final int avatarColor;
  final String? avatarUrl;
  final String? name;
}

class MatchTeamSide {
  const MatchTeamSide({
    required this.players,
    required this.label,
    required this.roleLabel,
    this.isCurrentUser = false,
  });

  final List<MatchTeamPlayer> players;
  final String label;
  final String roleLabel;
  final bool isCurrentUser;
}

class MatchSetScore {
  const MatchSetScore({
    required this.label,
    required this.ourScore,
    required this.opponentScore,
  });

  final String label;
  final int ourScore;
  final int opponentScore;

  bool get isWin => ourScore > opponentScore;
}

class AthleteMatchDetail {
  const AthleteMatchDetail({
    required this.id,
    this.tournamentId,
    required this.result,
    required this.resultBadgeLabel,
    required this.ourTeam,
    required this.opponentTeam,
    required this.sets,
    required this.tournamentName,
    required this.dateTimeLabel,
    required this.venueLabel,
    required this.categoryLabel,
    required this.durationLabel,
    this.mvpSummary,
  });

  final String id;
  final String? tournamentId;
  final AthleteMatchResult result;
  final String resultBadgeLabel;
  final MatchTeamSide ourTeam;
  final MatchTeamSide opponentTeam;
  final List<MatchSetScore> sets;
  final String tournamentName;
  final String dateTimeLabel;
  final String venueLabel;
  final String categoryLabel;
  final String durationLabel;
  final String? mvpSummary;

  bool get isWin => result == AthleteMatchResult.win;
  bool get hasMvp => mvpSummary != null && mvpSummary!.isNotEmpty;
}
