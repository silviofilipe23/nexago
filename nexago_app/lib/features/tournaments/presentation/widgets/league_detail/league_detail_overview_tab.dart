import 'package:flutter/material.dart';

import '../../../domain/league_detail_logic.dart';
import '../../../domain/tournament_discovery_models.dart';
import '../league_detail_ranking_section.dart';
import 'league_detail_tab_bar.dart';

class LeagueDetailOverviewTab extends StatelessWidget {
  const LeagueDetailOverviewTab({
    super.key,
    required this.league,
    required this.tournamentsById,
    required this.onViewFullRanking,
  });

  final DiscoveryLeague league;
  final Map<String, DiscoveryTournament> tournamentsById;
  final VoidCallback onViewFullRanking;

  @override
  Widget build(BuildContext context) {
    final bannerText = leagueGrandFinalBannerText(league);

    return ListView(
      padding: const EdgeInsets.fromLTRB(20, 8, 20, 32),
      children: [
        LeagueDetailRankingSection(
          league: league,
          tournamentsById: tournamentsById,
          previewLimit: 5,
          onViewFullRanking: onViewFullRanking,
        ),
        if (bannerText != null) ...[
          const SizedBox(height: 20),
          LeagueDetailGrandFinalBanner(text: bannerText),
        ],
      ],
    );
  }
}
