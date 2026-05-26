import 'package:flutter/material.dart';

import '../../../domain/tournament_detail_logic.dart';
import '../../../domain/tournament_detail_model.dart';
import '../tournament_detail/tournament_detail_hero.dart';

/// Hero da inscrição — mesma apresentação do detalhe do torneio.
class TournamentRegistrationHeroCard extends StatelessWidget {
  const TournamentRegistrationHeroCard({
    super.key,
    required this.tournament,
    required this.stats,
  });

  final TournamentDetail tournament;
  final TournamentDetailStats stats;

  @override
  Widget build(BuildContext context) {
    return TournamentDetailHero(
      tournament: tournament,
      stats: stats,
    );
  }
}
