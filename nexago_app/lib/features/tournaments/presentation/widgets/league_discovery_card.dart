import 'package:flutter/material.dart';

import '../../../../core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../domain/tournament_discovery_models.dart';

class LeagueDiscoveryCard extends StatelessWidget {
  const LeagueDiscoveryCard({
    super.key,
    required this.league,
    required this.tournamentCount,
    required this.onTap,
    this.completedStages = 0,
    this.totalStagesLabel,
    this.enrolled = false,
    this.open = false,
  });

  final DiscoveryLeague league;
  final int tournamentCount;
  final VoidCallback onTap;
  final int completedStages;
  final String? totalStagesLabel;
  final bool enrolled;
  final bool open;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final stageCount = league.stages.length;
    final stagesLabel = totalStagesLabel ?? '$completedStages/$stageCount ETAPAS';

    return Material(
      color: context.themeColors.surfaceRaised,
      borderRadius: BorderRadius.circular(16),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Ink(
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(16),
            border: Border.all(
              color: AppColors.brand.withValues(alpha: 0.35),
            ),
            gradient: LinearGradient(
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
              colors: [
                AppColors.brand.withValues(alpha: 0.12),
                context.themeColors.surfaceRaised,
              ],
            ),
          ),
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        'Ligas',
                        style: theme.textTheme.labelSmall?.copyWith(
                          color: context.themeColors.onSurfaceMuted,
                          fontWeight: FontWeight.w800,
                          letterSpacing: 0.6,
                        ),
                      ),
                    ),
                    if (enrolled)
                      _TopPill(
                        label: 'Inscrito',
                        fg: AppColors.black,
                        bg: AppColors.brand,
                      )
                    else if (open)
                      _TopPill(
                        label: 'Inscrições abertas',
                        fg: AppColors.win,
                        bg: Colors.transparent,
                        border: AppColors.win.withValues(alpha: 0.65),
                      ),
                  ],
                ),
                SizedBox(height: 10),
                Text(
                  league.name,
                  style: theme.textTheme.titleMedium?.copyWith(
                    fontWeight: FontWeight.w800,
                    color: context.themeColors.onSurface,
                    letterSpacing: -0.3,
                  ),
                ),
                SizedBox(height: 6),
                Text(
                  [
                    if (league.city != null) league.city!,
                    '$stageCount etapas',
                  ].join(' · '),
                  style: theme.textTheme.bodySmall?.copyWith(
                    color: context.themeColors.onSurfaceMuted,
                    fontWeight: FontWeight.w500,
                  ),
                ),
                SizedBox(height: 12),
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        stagesLabel,
                        style: theme.textTheme.labelSmall?.copyWith(
                          color: AppColors.brand,
                          fontWeight: FontWeight.w800,
                          letterSpacing: 0.3,
                        ),
                      ),
                    ),
                    Icon(
                      Icons.chevron_right_rounded,
                      color: context.themeColors.onSurfaceMuted.withValues(alpha: 0.8),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _TopPill extends StatelessWidget {
  const _TopPill({
    required this.label,
    required this.fg,
    required this.bg,
    this.border,
  });

  final String label;
  final Color fg;
  final Color bg;
  final Color? border;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(20),
        border: border != null ? Border.all(color: border!) : null,
      ),
      child: Text(
        label,
        style: Theme.of(context).textTheme.labelSmall?.copyWith(
              color: fg,
              fontWeight: FontWeight.w800,
            ),
      ),
    );
  }
}
