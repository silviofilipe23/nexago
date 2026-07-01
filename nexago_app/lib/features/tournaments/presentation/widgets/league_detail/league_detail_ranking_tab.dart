import 'package:flutter/material.dart';

import '../../../domain/tournament_discovery_models.dart';
import '../league_detail_ranking_section.dart';

class LeagueDetailRankingTab extends StatelessWidget {
  const LeagueDetailRankingTab({
    super.key,
    required this.league,
    required this.tournamentsById,
  });

  final DiscoveryLeague league;
  final Map<String, DiscoveryTournament> tournamentsById;

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.fromLTRB(20, 8, 20, 32),
      children: [
        LeagueDetailRankingSection(
          league: league,
          tournamentsById: tournamentsById,
        ),
      ],
    );
  }
}
