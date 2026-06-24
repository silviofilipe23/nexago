import 'package:flutter/material.dart';

import '../../../../../core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../../../core/theme/app_typography.dart';
import '../../../domain/athlete_profile_options.dart';
import '../../../domain/athlete_sports_levels_labels.dart';
import '../../../domain/athlete_sports_levels_mapper.dart';

class AthleteSportLevelCard extends StatelessWidget {
  const AthleteSportLevelCard({
    super.key,
    required this.enrollment,
    required this.totalGames,
    required this.selectedLevel,
    required this.onLevelSelected,
    required this.onMakePrimary,
    this.enabled = true,
  });

  final AthleteSportEnrollment enrollment;
  final int totalGames;
  final String selectedLevel;
  final ValueChanged<String> onLevelSelected;
  final VoidCallback onMakePrimary;
  final bool enabled;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final subtitle = _subtitleFor(enrollment, totalGames);

    return DecoratedBox(
      decoration: BoxDecoration(
        color: context.themeColors.surfaceRaised,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: context.themeColors.onSurfaceMuted.withValues(alpha: 0.12),
        ),
      ),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                _SportIcon(
                  icon: enrollment.icon,
                  isPrimary: enrollment.isPrimary,
                ),
                SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Flexible(
                            child: Text(
                              enrollment.label,
                              style: theme.textTheme.titleSmall?.copyWith(
                                fontWeight: FontWeight.w800,
                                color: context.themeColors.onSurface,
                              ),
                            ),
                          ),
                          if (enrollment.isPrimary) ...[
                            SizedBox(width: 8),
                            Container(
                              padding: const EdgeInsets.symmetric(
                                horizontal: 8,
                                vertical: 3,
                              ),
                              decoration: BoxDecoration(
                                color: AppColors.brand,
                                borderRadius: BorderRadius.circular(6),
                              ),
                              child: Text(
                                'PRINCIPAL',
                                style: AppTypography.mono(
                                  fontSize: 9,
                                  fontWeight: FontWeight.w800,
                                  color: context.themeColors.canvas,
                                  letterSpacing: 0.4,
                                ),
                              ),
                            ),
                          ],
                        ],
                      ),
                      SizedBox(height: 4),
                      Text(
                        subtitle,
                        style: AppTypography.soraRegular(
                          fontWeight: FontWeight.w500,
                          color: context.themeColors.onSurfaceMuted,
                          fontSize: 12,
                        ),
                      ),
                    ],
                  ),
                ),
                if (!enrollment.isPrimary)
                  IconButton(
                    onPressed: enabled ? onMakePrimary : null,
                    icon: Icon(
                      Icons.chevron_right_rounded,
                      color: context.themeColors.onSurfaceMuted,
                    ),
                    tooltip: 'Tornar principal',
                  ),
              ],
            ),
            SizedBox(height: 16),
            Row(
              children: [
                Text(
                  'NÍVEL',
                  style: AppTypography.mono(
                    fontWeight: FontWeight.w600,
                    color: context.themeColors.onSurfaceMuted,
                    letterSpacing: 0.6,
                    fontSize: 10,
                  ),
                ),
                Spacer(),
                Text(
                  '3 níveis',
                  style: AppTypography.mono(
                    fontWeight: FontWeight.w600,
                    color: context.themeColors.onSurfaceMuted.withValues(
                      alpha: 0.7,
                    ),
                    letterSpacing: 0.6,
                    fontSize: 10,
                  ),
                ),
              ],
            ),
            SizedBox(height: 10),
            Row(
              children: [
                for (
                  var i = 0;
                  i < AthleteSportsLevelsLabels.levelLabels.length;
                  i++
                )
                  Expanded(
                    child: Padding(
                      padding: EdgeInsets.only(
                        left: i == 0 ? 0 : 4,
                        right:
                            i ==
                                AthleteSportsLevelsLabels.levelLabels.length - 1
                            ? 0
                            : 4,
                      ),
                      child: _LevelChip(
                        label: AthleteSportsLevelsLabels.abbreviationFor(
                          AthleteSportsLevelsLabels.levelLabels[i],
                        ),
                        selected:
                            selectedLevel ==
                            AthleteSportsLevelsLabels.levelLabels[i],
                        onTap: enabled
                            ? () => onLevelSelected(
                                AthleteSportsLevelsLabels.levelLabels[i],
                              )
                            : null,
                      ),
                    ),
                  ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  static String _subtitleFor(
    AthleteSportEnrollment enrollment,
    int totalGames,
  ) {
    final level = enrollment.levelLabel.isEmpty
        ? AthleteProfileOptions.levels.first
        : enrollment.levelLabel;
    if (enrollment.isPrimary && totalGames > 0) {
      final gamesLabel = totalGames == 1 ? '1 jogo' : '$totalGames jogos';
      return 'Nível: $level · $gamesLabel';
    }
    return 'Nível: $level';
  }
}

class _SportIcon extends StatelessWidget {
  const _SportIcon({required this.icon, required this.isPrimary});

  final IconData icon;
  final bool isPrimary;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 44,
      height: 44,
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(12),
        gradient: isPrimary
            ? LinearGradient(
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
                colors: [AppColors.brand, Color(0xFFE85D04)],
              )
            : null,
        color: isPrimary ? null : context.themeColors.surfaceCard,
      ),
      child: Icon(
        icon,
        color: isPrimary
            ? context.themeColors.canvas
            : context.themeColors.onSurfaceMuted,
        size: 24,
      ),
    );
  }
}

class _LevelChip extends StatelessWidget {
  const _LevelChip({
    required this.label,
    required this.selected,
    required this.onTap,
  });

  final String label;
  final bool selected;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Material(
      color: selected ? AppColors.brand : context.themeColors.surfaceCard,
      borderRadius: BorderRadius.circular(10),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(10),
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 10),
          child: Center(
            child: Text(
              label,
              style: AppTypography.mono(
                fontWeight: FontWeight.w700,
                color: selected
                    ? context.themeColors.canvas
                    : context.themeColors.onSurfaceMuted,
                fontSize: 11,
              ),
            ),
          ),
        ),
      ),
    );
  }
}
