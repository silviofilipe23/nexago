import 'package:flutter/material.dart';

import '../../../../../core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../domain/match_history/athlete_match_detail_models.dart';

class MatchDetailXpCard extends StatelessWidget {
  const MatchDetailXpCard({super.key, required this.xp});

  final MatchDetailXpInfo xp;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: context.themeColors.surfaceCard,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.brand.withValues(alpha: 0.45)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                width: 44,
                height: 44,
                decoration: BoxDecoration(
                  color: AppColors.brand.withValues(alpha: 0.15),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Icon(
                  Icons.bolt_rounded,
                  color: AppColors.brand,
                  size: 26,
                ),
              ),
              SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    RichText(
                      text: TextSpan(
                        style: theme.textTheme.titleSmall?.copyWith(
                          fontWeight: FontWeight.w800,
                          color: context.themeColors.onSurface,
                        ),
                        children: [
                          if (xp.xpGained != null)
                            TextSpan(text: '+${xp.xpGained} XP • você subiu para ')
                          else
                            const TextSpan(text: 'Vitória • você está em '),
                          TextSpan(
                            text: xp.rankLabel,
                            style: TextStyle(color: AppColors.brand),
                          ),
                        ],
                      ),
                    ),
                    SizedBox(height: 4),
                    Text(
                      xp.levelProgressLabel != null
                          ? '${xp.streakLabel} • ${xp.levelProgressLabel}'
                          : xp.streakLabel,
                      style: theme.textTheme.bodySmall?.copyWith(
                        color: context.themeColors.onSurfaceMuted,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
          if (xp.progress != null) ...[
            SizedBox(height: 14),
            ClipRRect(
              borderRadius: BorderRadius.circular(4),
              child: LinearProgressIndicator(
                value: xp.progress!.clamp(0.0, 1.0),
                minHeight: 6,
                backgroundColor: context.themeColors.surfaceRaised,
                color: AppColors.brand,
              ),
            ),
          ],
        ],
      ),
    );
  }
}
