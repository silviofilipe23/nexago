import 'tournament_match.dart';

class TournamentMatchCardViewModel {
  const TournamentMatchCardViewModel({
    required this.match,
    required this.teamADisplayName,
    required this.teamBDisplayName,
  });

  final TournamentMatch match;
  final String teamADisplayName;
  final String teamBDisplayName;

  String get teamsLabel => '$teamADisplayName vs $teamBDisplayName';
}
