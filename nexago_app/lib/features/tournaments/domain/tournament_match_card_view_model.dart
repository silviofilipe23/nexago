import 'package:flutter/material.dart';

import 'tournament_match.dart';

class TournamentMatchCardPlayerViewModel {
  const TournamentMatchCardPlayerViewModel({
    required this.initials,
    required this.avatarColor,
    this.avatarUrl,
  });

  final String initials;
  final Color avatarColor;
  final String? avatarUrl;
}

class TournamentMatchCardTeamViewModel {
  const TournamentMatchCardTeamViewModel({
    required this.displayName,
    required this.players,
  });

  final String displayName;
  final List<TournamentMatchCardPlayerViewModel> players;
}

class TournamentMatchCardViewModel {
  const TournamentMatchCardViewModel({
    required this.match,
    required this.teamA,
    required this.teamB,
  });

  final TournamentMatch match;
  final TournamentMatchCardTeamViewModel teamA;
  final TournamentMatchCardTeamViewModel teamB;
}
