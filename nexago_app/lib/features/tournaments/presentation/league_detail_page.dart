import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/router/routes.dart';
import '../../../core/theme/app_colors.dart';
import '../domain/tournament_discovery_providers.dart';
import 'widgets/tournament_discovery_card.dart';

class LeagueDetailPage extends ConsumerWidget {
  const LeagueDetailPage({super.key, required this.leagueId});

  final String leagueId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final leagueAsync = ref.watch(leagueDetailProvider(leagueId));
    final tournamentsAsync = ref.watch(discoveryTournamentsProvider);

    return Scaffold(
      backgroundColor: AppColors.canvas,
      appBar: AppBar(
        backgroundColor: AppColors.canvas,
        title: leagueAsync.maybeWhen(
          data: (l) => Text(l?.name ?? 'Liga'),
          orElse: () => const Text('Liga'),
        ),
      ),
      body: leagueAsync.when(
        loading: () => const Center(
          child: CircularProgressIndicator(color: AppColors.brand),
        ),
        error: (e, _) => Center(
          child: Text(
            'Não foi possível carregar a liga.\n$e',
            style: theme.textTheme.bodyLarge?.copyWith(color: AppColors.live),
          ),
        ),
        data: (league) {
          if (league == null) {
            return const Center(child: Text('Liga não encontrada.'));
          }
          final tournaments = tournamentsAsync.valueOrNull ?? [];
          final byId = {for (final t in tournaments) t.id: t};

          return ListView(
            padding: const EdgeInsets.fromLTRB(20, 8, 20, 32),
            children: [
              if (league.seasonLabel != null) ...[
                Text(
                  league.seasonLabel!,
                  style: theme.textTheme.labelLarge?.copyWith(
                    color: AppColors.brand,
                    fontWeight: FontWeight.w800,
                  ),
                ),
                const SizedBox(height: 4),
              ],
              if (league.city != null)
                Text(
                  league.city!,
                  style: theme.textTheme.bodyMedium?.copyWith(
                    color: AppColors.onSurfaceMuted,
                  ),
                ),
              const SizedBox(height: 20),
              for (final stage in league.stages) ...[
                Text(
                  stage.name,
                  style: theme.textTheme.titleMedium?.copyWith(
                    fontWeight: FontWeight.w800,
                    color: AppColors.onSurface,
                  ),
                ),
                if (stage.dateLabel != null) ...[
                  const SizedBox(height: 4),
                  Text(
                    stage.dateLabel!,
                    style: theme.textTheme.bodySmall?.copyWith(
                      color: AppColors.onSurfaceMuted,
                    ),
                  ),
                ],
                const SizedBox(height: 10),
                for (final tid in stage.tournamentIds) ...[
                  if (byId.containsKey(tid)) ...[
                    TournamentDiscoveryCard(
                      tournament: byId[tid]!,
                      onTap: () => context.pushNamed(
                        AppRouteNames.tournamentDetail,
                        pathParameters: {'tournamentId': tid},
                      ),
                    ),
                    const SizedBox(height: 10),
                  ],
                ],
                const SizedBox(height: 14),
              ],
            ],
          );
        },
      ),
    );
  }
}
