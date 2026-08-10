import 'package:flutter/material.dart';

import '../../../../../core/theme/app_colors.dart';
import '../../../../../core/theme/app_radii.dart';
import '../../../../../core/theme/app_spacing.dart';
import '../../../../../core/theme/app_typography.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../domain/tournament_discovery_hub_providers.dart';

/// Pills compactas de estatísticas (X inscritos · Y ao vivo · Z abertos) —
/// paridade com a toolbar do portal web.
class DiscoveryListStatsRow extends StatelessWidget {
  const DiscoveryListStatsRow({super.key, required this.stats});

  final TournamentHubStats stats;

  @override
  Widget build(BuildContext context) {
    return Wrap(
      spacing: AppSpacing.sm - 2,
      runSpacing: AppSpacing.xs,
      children: [
        _StatPill(
          label: '${stats.subscriptions} '
              'inscrito${stats.subscriptions == 1 ? '' : 's'}',
          color: AppColors.brand,
        ),
        _StatPill(label: '${stats.liveNow} ao vivo', color: AppColors.live),
        _StatPill(
          label: '${stats.openRegistrations} '
              'aberto${stats.openRegistrations == 1 ? '' : 's'}',
          color: context.themeColors.onSurfaceMuted,
        ),
      ],
    );
  }
}

class _StatPill extends StatelessWidget {
  const _StatPill({required this.label, required this.color});

  final String label;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(
        horizontal: AppSpacing.sm + 2,
        vertical: AppSpacing.xs,
      ),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.12),
        borderRadius: AppRadii.pillAll,
        border: Border.all(color: color.withValues(alpha: 0.3)),
      ),
      child: Text(
        label,
        style: AppTypography.monoMeta.copyWith(color: color),
      ),
    );
  }
}
