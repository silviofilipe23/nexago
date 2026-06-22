import 'package:flutter/material.dart';

import '../../../domain/tournament_detail_logic.dart';
import '../../../domain/tournament_detail_model.dart';
import '../tournament_detail/tournament_detail_hero.dart';

/// Hero da inscrição — mesma apresentação imersiva do detalhe do torneio.
class TournamentRegistrationHeroCard extends StatelessWidget {
  const TournamentRegistrationHeroCard({
    super.key,
    required this.tournament,
    required this.stats,
    required this.topInset,
    required this.toolbar,
  });

  final TournamentDetail tournament;
  final TournamentDetailStats stats;
  final double topInset;
  final Widget toolbar;

  @override
  Widget build(BuildContext context) {
    return TournamentDetailHero(
      tournament: tournament,
      stats: stats,
      topInset: topInset,
      toolbar: toolbar,
    );
  }
}
