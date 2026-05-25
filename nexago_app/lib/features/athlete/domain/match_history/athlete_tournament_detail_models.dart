import 'athlete_match_history_models.dart';

class AthleteTournamentPartner {
  const AthleteTournamentPartner({
    required this.initials,
    required this.avatarColor,
    required this.name,
    required this.monthsTogetherLabel,
  });

  final String initials;
  final int avatarColor;
  final String name;
  final String monthsTogetherLabel;
}

class AthleteTournamentCampaignMatch {
  const AthleteTournamentCampaignMatch({
    required this.id,
    this.matchId,
    required this.stageLabel,
    required this.playedAt,
    required this.opponentLabel,
    required this.scoreDisplay,
    required this.result,
    this.isFinal = false,
  });

  final String id;
  final String? matchId;
  final String stageLabel;
  final DateTime playedAt;
  final String opponentLabel;
  final String scoreDisplay;
  final AthleteMatchResult result;
  final bool isFinal;

  bool get isWin => result == AthleteMatchResult.win;
}

class AthleteTournamentDetail {
  const AthleteTournamentDetail({
    required this.tournamentId,
    required this.name,
    required this.championBadgeLabel,
    required this.metaLabel,
    required this.gamesCount,
    required this.wins,
    required this.losses,
    required this.xpEarned,
    required this.venueName,
    required this.venueCity,
    required this.partner,
    required this.campaignTag,
    required this.matches,
  });

  final String tournamentId;
  final String name;
  final String championBadgeLabel;
  final String metaLabel;
  final int gamesCount;
  final int wins;
  final int losses;
  final int xpEarned;
  final String venueName;
  final String venueCity;
  final AthleteTournamentPartner partner;
  final String campaignTag;
  final List<AthleteTournamentCampaignMatch> matches;

  bool get isUndefeated => losses == 0 && wins > 0;
}
