import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../athlete/domain/favorites_providers.dart';
import '../../domain/arena_schedule_providers.dart';
import 'arena_dashboard_followers_card.dart';
import 'arena_dashboard_reputation_section.dart';

/// Aba "Clientes": seguidores e reputação.
class ArenaClientsTab extends ConsumerWidget {
  const ArenaClientsTab({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final arenaId = ref.watch(managedArenaIdProvider).valueOrNull;
    final followers = arenaId == null || arenaId.isEmpty
        ? const AsyncValue<ArenaFollowersInsights>.data(
            ArenaFollowersInsights(
              totalFollowers: 0,
              growthLastWeek: 0,
              qualityBookedPercent: 0,
              activeRecentlyPercent: 0,
            ),
          )
        : ref.watch(arenaFollowersInsightsProvider(arenaId));

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        ArenaDashboardFollowersCard(insightsAsync: followers, arenaId: arenaId),
        const SizedBox(height: 16),
        const ArenaDashboardReputationSection(),
      ],
    );
  }
}
