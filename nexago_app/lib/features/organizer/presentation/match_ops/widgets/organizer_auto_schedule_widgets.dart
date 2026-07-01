import 'package:flutter/material.dart';
import 'package:nexago_app/core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import 'package:nexago_app/core/theme/app_typography.dart';

import '../../../../tournaments/domain/tournament_match.dart';
import '../../../../tournaments/domain/tournament_match_display.dart';
import '../../category_ops/widgets/organizer_team_dual_avatars.dart';
import 'organizer_match_live_table_widgets.dart';

/// Card de prévia na auto-programação (padrão H1 / agendar partida).
class AutoSchedulePreviewMatchCard extends StatelessWidget {
  const AutoSchedulePreviewMatchCard({
    super.key,
    required this.categoryEyebrow,
    required this.phaseLabel,
    required this.courtLabel,
    required this.timeRange,
    required this.teamA,
    required this.teamB,
    this.matchNumberLabel = '',
    this.seedA,
    this.seedB,
  });

  const AutoSchedulePreviewMatchCard.fallback({
    super.key,
    required this.categoryEyebrow,
    required this.phaseLabel,
    required this.courtLabel,
    required this.timeRange,
    this.matchNumberLabel = '',
  }) : teamA = null,
       teamB = null,
       seedA = null,
       seedB = null;

  final String categoryEyebrow;
  final String phaseLabel;
  final String courtLabel;
  final String timeRange;
  final String matchNumberLabel;
  final LiveTableTeamData? teamA;
  final LiveTableTeamData? teamB;
  final int? seedA;
  final int? seedB;

  factory AutoSchedulePreviewMatchCard.fromMatch({
    required TournamentMatch match,
    required String categoryLabel,
    required LiveTableTeamData teamA,
    required LiveTableTeamData teamB,
    required String courtLabel,
    required String timeRange,
    List<TournamentMatch> categoryMatches = const [],
    int? seedA,
    int? seedB,
  }) {
    final category = categoryLabel.trim();
    final matchNumber = matchNumberLabelForCard(match);
    return AutoSchedulePreviewMatchCard(
      categoryEyebrow: category.isEmpty ? 'PARTIDA' : category,
      matchNumberLabel: matchNumber,
      phaseLabel: matchPhaseDisplayLabel(
        match,
        categoryMatches: categoryMatches,
      ),
      courtLabel: courtLabel,
      timeRange: timeRange,
      teamA: teamA,
      teamB: teamB,
      seedA: seedA,
      seedB: seedB,
    );
  }

  String _headerEyebrow() {
    final number = matchNumberLabel.trim();
    if (number.isEmpty) return categoryEyebrow;
    return '${number.toUpperCase()} · $categoryEyebrow';
  }

  @override
  Widget build(BuildContext context) {
    final borderColor = context.themeColors.onSurfaceMuted.withValues(
      alpha: 0.14,
    );

    return Material(
      color: context.themeColors.surfaceRaised,
      borderRadius: BorderRadius.circular(16),
      child: Container(
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: borderColor),
        ),
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Text(
                        _headerEyebrow(),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: AppTypography.mono(
                          fontSize: 9,
                          fontWeight: FontWeight.w700,
                          color: context.themeColors.onSurfaceMuted,
                          letterSpacing: 0.4,
                        ),
                      ),
                      if (phaseLabel.trim().isNotEmpty) ...[
                        const SizedBox(height: 4),
                        Text(
                          phaseLabel,
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          style: AppTypography.mono(
                            fontSize: 10,
                            fontWeight: FontWeight.w800,
                            color: context.themeColors.onSurface,
                            height: 1.2,
                          ),
                        ),
                      ],
                    ],
                  ),
                ),
                const SizedBox(width: 8),
                _TimeBadge(label: timeRange),
              ],
            ),
            const SizedBox(height: 10),
            Row(
              children: [
                Icon(
                  Icons.tablet_outlined,
                  size: 14,
                  color: context.themeColors.onSurfaceMuted,
                ),
                const SizedBox(width: 6),
                Expanded(
                  child: Text(
                    courtLabel,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: AppTypography.soraRegular(
                      fontSize: 12,
                      fontWeight: FontWeight.w600,
                      color: context.themeColors.onSurfaceMuted,
                    ),
                  ),
                ),
              ],
            ),
            if (teamA != null && teamB != null) ...[
              const SizedBox(height: 12),
              _AutoScheduleTeamRow(team: teamA!, seed: seedA),
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 8),
                child: Row(
                  children: [
                    Expanded(
                      child: Divider(
                        color: context.themeColors.onSurfaceMuted.withValues(
                          alpha: 0.12,
                        ),
                      ),
                    ),
                    Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 8),
                      child: Text(
                        'vs',
                        style: AppTypography.mono(
                          fontSize: 10,
                          fontWeight: FontWeight.w700,
                          color: context.themeColors.onSurfaceMuted,
                        ),
                      ),
                    ),
                    Expanded(
                      child: Divider(
                        color: context.themeColors.onSurfaceMuted.withValues(
                          alpha: 0.12,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
              _AutoScheduleTeamRow(team: teamB!, seed: seedB),
            ],
          ],
        ),
      ),
    );
  }
}

class _TimeBadge extends StatelessWidget {
  const _TimeBadge({required this.label});

  final String label;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: AppColors.brand.withValues(alpha: 0.14),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: AppColors.brand.withValues(alpha: 0.35)),
      ),
      child: Text(
        label,
        style: AppTypography.mono(
          fontSize: 10,
          fontWeight: FontWeight.w800,
          color: AppColors.brand,
        ),
      ),
    );
  }
}

class _AutoScheduleTeamRow extends StatelessWidget {
  const _AutoScheduleTeamRow({required this.team, this.seed});

  final LiveTableTeamData team;
  final int? seed;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        OrganizerTeamDualAvatars(
          player1: team.player1,
          player2: team.player2,
          avatarSize: 28,
          overlapRingColor: context.themeColors.surfaceRaised,
        ),
        const SizedBox(width: 10),
        Expanded(
          child: Text(
            team.label,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: AppTypography.soraRegular(
              fontSize: 14,
              fontWeight: FontWeight.w800,
              color: context.themeColors.onSurface,
            ),
          ),
        ),
        if (seed != null)
          Text(
            '#$seed',
            style: AppTypography.mono(
              fontSize: 11,
              fontWeight: FontWeight.w800,
              color: AppColors.brand,
            ),
          ),
      ],
    );
  }
}
