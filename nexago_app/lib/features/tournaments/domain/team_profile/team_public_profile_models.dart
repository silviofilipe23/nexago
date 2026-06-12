import '../../../athlete/domain/athlete_profile.dart';
import '../team_discover_models.dart';
import '../tournament_match.dart';
import '../tournament_team.dart';

enum TeamProfileTab { overview, history, headToHead }

class TeamPublicProfile {
  const TeamPublicProfile({
    required this.team,
    this.player1,
    this.player2,
    this.ranking = const TeamDiscoverRankingSnapshot(),
    this.isCurrentUserTeam = false,
  });

  final TournamentTeam team;
  final AthleteProfile? player1;
  final AthleteProfile? player2;
  final TeamDiscoverRankingSnapshot ranking;
  final bool isCurrentUserTeam;

  String get teamId => team.id;

  bool get isLookingForPartner => team.isLookingForPartner;
}

class TeamProfileStats {
  const TeamProfileStats({
    this.games = 0,
    this.winRatePercent = 0,
    this.titles = 0,
    this.points = 0,
  });

  final int games;
  final int winRatePercent;
  final int titles;
  final int points;
}

class TeamCampaignEntry {
  const TeamCampaignEntry({
    required this.tournamentId,
    required this.tournamentName,
    required this.resultLabel,
    required this.wins,
    required this.losses,
    this.playedAt,
    this.locationLabel = '',
  });

  final String tournamentId;
  final String tournamentName;
  final String resultLabel;
  final int wins;
  final int losses;
  final DateTime? playedAt;
  final String locationLabel;

  String get recordLabel => '${wins}V · ${losses}D';
}

class TeamHeadToHeadEntry {
  const TeamHeadToHeadEntry({
    required this.opponentTeamId,
    required this.opponentLabel,
    required this.wins,
    required this.losses,
    this.lastPlayedAt,
  });

  final String opponentTeamId;
  final String opponentLabel;
  final int wins;
  final int losses;
  final DateTime? lastPlayedAt;

  int get totalMatches => wins + losses;
  String get recordLabel => '${wins}V · ${losses}D';
}

class TeamMatchHistoryBundle {
  const TeamMatchHistoryBundle({
    this.matches = const [],
    this.tournamentNames = const {},
  });

  final List<TournamentMatch> matches;
  final Map<String, String> tournamentNames;
}
