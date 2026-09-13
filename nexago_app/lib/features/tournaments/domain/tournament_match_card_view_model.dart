import 'package:flutter/material.dart';

import 'tournament_match.dart';

class TournamentMatchCardPlayerViewModel {
  const TournamentMatchCardPlayerViewModel({
    required this.initials,
    required this.avatarColor,
    this.avatarUrl,
    this.name = '',
  });

  final String initials;
  final Color avatarColor;
  final String? avatarUrl;

  /// Nome de exibição do atleta. Vazio quando a partida não trouxe a equipe
  /// (só há o rótulo da dupla) — quem mostra nome precisa tratar o vazio.
  final String name;
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
