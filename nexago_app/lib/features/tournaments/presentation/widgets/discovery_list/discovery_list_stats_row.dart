import 'package:flutter/material.dart';

import '../../../../../core/theme/app_colors.dart';
import '../../../domain/tournament_discovery_hub_providers.dart';
import 'discovery_list_stat_tile.dart';

/// Linha de estatísticas (inscritos, ao vivo, abertos) do topo da lista de
/// descoberta.
class DiscoveryListStatsRow extends StatelessWidget {
  const DiscoveryListStatsRow({super.key, required this.stats});

  final TournamentHubStats stats;

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Expanded(
          child: DiscoveryListStatTile(
            label: 'Inscritos',
            value: '${stats.subscriptions}',
            icon: Icons.emoji_events_outlined,
          ),
        ),
        const SizedBox(width: 6),
        Expanded(
          child: DiscoveryListStatTile(
            label: 'Ao vivo',
            value: '${stats.liveNow}',
            icon: Icons.sensors_rounded,
            accent: AppColors.live,
          ),
        ),
        const SizedBox(width: 6),
        Expanded(
          child: DiscoveryListStatTile(
            label: 'Abertos',
            value: '${stats.openRegistrations}',
            icon: Icons.person_add_outlined,
          ),
        ),
      ],
    );
  }
}
