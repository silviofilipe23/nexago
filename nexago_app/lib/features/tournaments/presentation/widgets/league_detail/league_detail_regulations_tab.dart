import 'package:flutter/material.dart';

import '../../../../../core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../domain/league_ranking_logic.dart';
import '../../../domain/tournament_discovery_models.dart';

class LeagueDetailRegulationsTab extends StatelessWidget {
  const LeagueDetailRegulationsTab({super.key, required this.league});

  final DiscoveryLeague league;

  @override
  Widget build(BuildContext context) {
    final description = league.description?.trim();
    final summaryItems = <String>[
      leagueCountingModeLabel(league.countingStagesMode),
      '${league.totalStagesCount} etapas na temporada',
      if (league.grandFinalEnabled)
        '${league.grandFinalSpots} vagas na Grande Final',
    ];

    return ListView(
      padding: const EdgeInsets.fromLTRB(20, 8, 20, 32),
      children: [
        Text(
          'Regulamento',
          style: Theme.of(context).textTheme.titleMedium?.copyWith(
                fontWeight: FontWeight.w800,
                color: context.themeColors.onSurface,
              ),
        ),
        const SizedBox(height: 12),
        Container(
          width: double.infinity,
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: context.themeColors.surfaceCard,
            borderRadius: BorderRadius.circular(16),
            border: Border.all(
              color: context.themeColors.outline.withValues(alpha: 0.35),
            ),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'Resumo da temporada',
                style: Theme.of(context).textTheme.labelLarge?.copyWith(
                      fontWeight: FontWeight.w800,
                      color: AppColors.brand,
                    ),
              ),
              const SizedBox(height: 10),
              for (final item in summaryItems) ...[
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      '• ',
                      style: TextStyle(color: context.themeColors.onSurfaceMuted),
                    ),
                    Expanded(
                      child: Text(
                        item,
                        style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                              color: context.themeColors.onSurface,
                              height: 1.45,
                            ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 6),
              ],
            ],
          ),
        ),
        const SizedBox(height: 16),
        if (description != null && description.isNotEmpty)
          Text(
            description,
            style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                  color: context.themeColors.onSurface.withValues(alpha: 0.9),
                  height: 1.55,
                ),
          )
        else
          Text(
            'O organizador ainda não publicou o regulamento completo. '
            'Entre em contato com ${league.organizationName ?? 'a organização'} '
            'para mais detalhes sobre pontuação, desempates e classificação.',
            style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                  color: context.themeColors.onSurfaceMuted,
                  height: 1.55,
                ),
          ),
      ],
    );
  }
}
