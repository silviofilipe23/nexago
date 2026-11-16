import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../ranking/domain/ranking_providers.dart';
import '../../../domain/compete_hub_card_labels.dart';
import '../../../domain/tournament_discovery_labels.dart';
import '../../../domain/tournament_discovery_providers.dart';
import 'compete_hub_menu_card.dart';

/// Card "Torneios e ligas" com a contagem ao vivo (inscrições abertas e jogos
/// rolando). Carregando ou com erro, fica com o texto padrão.
class CompeteHubTournamentsCard extends ConsumerWidget {
  const CompeteHubTournamentsCard({super.key, required this.onTap});

  final VoidCallback onTap;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    // Direto da lista, não de `discoveryLiveStatsProvider`: lá o carregamento
    // vira lista vazia e o card diria "nada aberto" por um instante.
    final stats = ref
        .watch(discoveryTournamentsProvider)
        .whenOrNull(data: computeDiscoveryLiveStats);

    return CompeteHubMenuCard(
      imageAsset: CompeteHubArt.tournaments,
      title: 'Torneios e ligas',
      description: competeHubTournamentsCardDescription(stats),
      onTap: onTap,
    );
  }
}

/// Card "Ranking" com a posição e os pontos do atleta logado.
class CompeteHubRankingCard extends ConsumerWidget {
  const CompeteHubRankingCard({super.key, required this.onTap});

  final VoidCallback onTap;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final ranking = ref.watch(competeHubUserRankingProvider).valueOrNull;

    return CompeteHubMenuCard(
      imageAsset: CompeteHubArt.ranking,
      title: 'Ranking',
      description: competeHubRankingCardDescription(ranking),
      onTap: onTap,
    );
  }
}
