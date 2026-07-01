import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../../../../core/router/routes.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../domain/tournament_discovery_models.dart';
import '../tournament_discovery_card.dart';

class LeagueDetailStagesTab extends StatelessWidget {
  const LeagueDetailStagesTab({
    super.key,
    required this.league,
    required this.tournamentsById,
  });

  final DiscoveryLeague league;
  final Map<String, DiscoveryTournament> tournamentsById;

  @override
  Widget build(BuildContext context) {
    if (league.stages.isEmpty) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Text(
            'As etapas desta liga ainda não foram publicadas.',
            textAlign: TextAlign.center,
            style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                  color: context.themeColors.onSurfaceMuted,
                ),
          ),
        ),
      );
    }

    return ListView(
      padding: const EdgeInsets.fromLTRB(20, 8, 20, 32),
      children: [
        for (final stage in league.stages) ...[
          Text(
            stage.name,
            style: Theme.of(context).textTheme.titleMedium?.copyWith(
                  fontWeight: FontWeight.w800,
                  color: context.themeColors.onSurface,
                ),
          ),
          if (stage.dateLabel != null) ...[
            const SizedBox(height: 4),
            Text(
              stage.dateLabel!,
              style: Theme.of(context).textTheme.bodySmall?.copyWith(
                    color: context.themeColors.onSurfaceMuted,
                  ),
            ),
          ],
          const SizedBox(height: 10),
          if (stage.tournamentIds.isEmpty)
            Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: Text(
                'Torneios desta etapa em breve.',
                style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                      color: context.themeColors.onSurfaceMuted,
                    ),
              ),
            )
          else
            for (final tid in stage.tournamentIds)
              if (tournamentsById.containsKey(tid)) ...[
                TournamentDiscoveryCard(
                  tournament: tournamentsById[tid]!,
                  onTap: () => context.pushNamed(
                    AppRouteNames.tournamentDetail,
                    pathParameters: {'tournamentId': tid},
                  ),
                ),
                const SizedBox(height: 10),
              ],
          const SizedBox(height: 14),
        ],
      ],
    );
  }
}
