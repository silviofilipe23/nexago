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
    this.rosterSize = 2,
    this.rosterNames = const [],
  });

  final String displayName;
  final List<TournamentMatchCardPlayerViewModel> players;

  /// Atletas do elenco (1 individual, 2 dupla, 3–5 equipe) pelo `memberUids` gravado — é o
  /// que a mesa usa pro rodízio do saque e pro tempo médico. Sem a equipe resolvida, dupla.
  final int rosterSize;

  /// Nomes na ORDEM do elenco (`memberUids`; na dupla legada, player1/player2) — a posição
  /// que o doc da partida grava no saque e no tempo médico. Vazio sem a equipe resolvida.
  final List<String> rosterNames;
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
