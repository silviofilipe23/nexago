import 'package:flutter/material.dart';
import 'package:nexago_app/core/theme/app_typography.dart';

import '../../../../../core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../domain/match_history/athlete_match_detail_models.dart';
import 'match_detail_section_header.dart';

class MatchDetailLiveScorePanel extends StatelessWidget {
  const MatchDetailLiveScorePanel({super.key, required this.detail});

  final AthleteMatchDetail detail;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final setNum = (detail.currentSetIndex ?? detail.sets.length - 1) + 1;
    final our = detail.currentSetOurPoints ?? 0;
    final opp = detail.currentSetOpponentPoints ?? 0;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        MatchDetailSectionHeader(
          eyebrow: 'PLACAR AO VIVO',
          title: 'Set $setNum',
        ),
        SizedBox(height: 14),
        Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: context.themeColors.surfaceCard,
            borderRadius: BorderRadius.circular(14),
            border: Border.all(
              color: AppColors.live.withValues(alpha: 0.35),
            ),
          ),
          child: Column(
            children: [
              Row(
                children: [
                  Expanded(
                    child: Row(
                      children: [
                        Container(
                          width: 6,
                          height: 6,
                          decoration: const BoxDecoration(
                            color: AppColors.live,
                            shape: BoxShape.circle,
                          ),
                        ),
                        SizedBox(width: 6),
                        Expanded(
                          child: Text(
                            detail.ourTeam.label,
                            style: theme.textTheme.labelMedium?.copyWith(
                              fontWeight: FontWeight.w800,
                              color: context.themeColors.onSurface,
                            ),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                      ],
                    ),
                  ),
                  Expanded(
                    child: Text(
                      detail.opponentTeam.label,
                      textAlign: TextAlign.end,
                      style: theme.textTheme.labelMedium?.copyWith(
                        fontWeight: FontWeight.w800,
                        color: context.themeColors.onSurfaceMuted,
                      ),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                ],
              ),
              SizedBox(height: 16),
              Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Text(
                    '$our',
                    style: theme.textTheme.displayMedium?.copyWith(
                      fontWeight: FontWeight.w900,
                      color: AppColors.brand,
                      height: 1,
                    ),
                  ),
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 16),
                    child: Text(
                      ':',
                      style: theme.textTheme.headlineMedium?.copyWith(
                        color: context.themeColors.onSurfaceMuted,
                        fontWeight: FontWeight.w300,
                      ),
                    ),
                  ),
                  Text(
                    '$opp',
                    style: theme.textTheme.displayMedium?.copyWith(
                      fontWeight: FontWeight.w900,
                      color: context.themeColors.onSurface,
                      height: 1,
                    ),
                  ),
                ],
              ),
              if (detail.sets.isNotEmpty) ...[
                SizedBox(height: 18),
                Row(
                  children: [
                    for (var i = 0; i < detail.sets.length; i++) ...[
                      if (i > 0) SizedBox(width: 8),
                      Expanded(
                        child: _SetScoreChip(
                          set: detail.sets[i],
                          isCurrentSet: detail.sets[i].isCurrentSet,
                        ),
                      ),
                    ],
                  ],
                ),
              ],
              SizedBox(height: 12),
              Text(
                'Placar atualizado em tempo real pela organização.',
                textAlign: TextAlign.center,
                style: theme.textTheme.labelSmall?.copyWith(
                  color: context.themeColors.onSurfaceMuted,
                  fontSize: 10,
                  fontWeight: FontWeight.w600,
                  height: 1.35,
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class _SetScoreChip extends StatelessWidget {
  const _SetScoreChip({
    required this.set,
    required this.isCurrentSet,
  });

  final MatchSetScore set;
  final bool isCurrentSet;

  @override
  Widget build(BuildContext context) {
    final borderColor = isCurrentSet
        ? AppColors.live.withValues(alpha: 0.55)
        : context.themeColors.onSurfaceMuted.withValues(alpha: 0.2);
    final textColor = isCurrentSet
        ? AppColors.live
        : context.themeColors.onSurfaceMuted;

    return Container(
      padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 6),
      decoration: BoxDecoration(
        color: context.themeColors.canvas.withValues(alpha: 0.65),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: borderColor),
      ),
      child: Text(
        '${set.ourScore} · ${set.opponentScore}',
        textAlign: TextAlign.center,
        style: AppTypography.mono(
          fontSize: 11,
          fontWeight: FontWeight.w700,
          color: textColor,
          letterSpacing: 0.2,
        ),
      ),
    );
  }
}
