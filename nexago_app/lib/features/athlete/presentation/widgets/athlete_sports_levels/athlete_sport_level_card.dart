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
    this.lockedLevelRank = -1,
    this.enabled = true,
  });

  final AthleteSportEnrollment enrollment;
  final int totalGames;
  final String selectedLevel;
  final ValueChanged<String> onLevelSelected;
  final VoidCallback onMakePrimary;

  /// Rank do nível já salvo (regra "nível só sobe"): chips abaixo dele ficam
  /// bloqueados visualmente. `-1` = sem nível salvo (tudo liberado).
  final int lockedLevelRank;
  final bool enabled;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final subtitle = _subtitleFor(enrollment, totalGames);
    final levelLabels =
        AthleteSportsLevelsLabels.levelLabelsFor(enrollment.firestoreSportId);

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
                  '${levelLabels.length} níveis',
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
                for (var i = 0; i < levelLabels.length; i++)
                  Expanded(
                    child: Padding(
                      padding: EdgeInsets.only(
                        left: i == 0 ? 0 : 4,
                        right: i == levelLabels.length - 1 ? 0 : 4,
                      ),
                      child: _LevelChip(
                        label: AthleteSportsLevelsLabels.abbreviationFor(
                          levelLabels[i],
                        ),
                        // Igualdade por rank: nível legado ainda não migrado
                        // ("Intermediário") acende o degrau equivalente da
                        // escada de 7 ("Int. 1").
                        selected: selectedLevel == levelLabels[i] ||
                            (AthleteProfileOptions.levelRank(selectedLevel) !=
                                    null &&
                                AthleteProfileOptions.levelRank(
                                        selectedLevel) ==
                                    AthleteProfileOptions.levelRank(
                                        levelLabels[i])),
                        // Abaixo do nível salvo (rank unificado, que tem
                        // buracos): visual bloqueado, mas o tap segue ativo
                        // para a página explicar a regra.
                        locked:
                            (AthleteProfileOptions.levelRank(levelLabels[i]) ??
                                    0) <
                                lockedLevelRank,
                        onTap: enabled
                            ? () => onLevelSelected(levelLabels[i])
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
    this.locked = false,
  });

  final String label;
  final bool selected;
  final VoidCallback? onTap;
  final bool locked;

  @override
  Widget build(BuildContext context) {
    final mutedColor = locked
        ? context.themeColors.onSurfaceMuted.withValues(alpha: 0.45)
        : context.themeColors.onSurfaceMuted;

    return Material(
      color: selected ? AppColors.brand : context.themeColors.surfaceCard,
      borderRadius: BorderRadius.circular(10),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(10),
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 10),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              if (locked) ...[
                Icon(Icons.lock_outline_rounded, size: 12, color: mutedColor),
                SizedBox(width: 4),
              ],
              Flexible(
                child: Text(
                  label,
                  overflow: TextOverflow.ellipsis,
                  style: AppTypography.mono(
                    fontWeight: FontWeight.w700,
                    color: selected
                        ? context.themeColors.canvas
                        : mutedColor,
                    fontSize: 11,
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
