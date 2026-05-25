import 'package:flutter/material.dart';

import '../../../../../core/theme/app_colors.dart';
import '../../../domain/athlete_quest/athlete_quest_logic.dart';
import '../../../domain/gamification_models.dart';

class AthleteQuestLevelCard extends StatelessWidget {
  const AthleteQuestLevelCard({
    super.key,
    required this.summary,
  });

  final GamificationSummary summary;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final displayLevel = gamificationDisplayLevel(summary);
    final title = levelTitle(displayLevel);
    final xpCurrent = summary.xpInCurrentLevel;
    const xpGoal = 100;
    final xpRemaining = summary.xpForNextLevel.clamp(0, xpGoal);
    final nextLevel = displayLevel + 1;
    final nextTitle = levelTitle(nextLevel);
    final unlockHint = nextLevelUnlockHint(nextLevel);

    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AppColors.surfaceCard,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppColors.surfaceRaised),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Container(
                width: 36,
                height: 36,
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  color: AppColors.brand.withValues(alpha: 0.15),
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(color: AppColors.brand.withValues(alpha: 0.4)),
                ),
                child: Text(
                  '$displayLevel',
                  style: theme.textTheme.titleSmall?.copyWith(
                    fontWeight: FontWeight.w900,
                    color: AppColors.brand,
                  ),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Text(
                  'Nível $displayLevel · $title',
                  style: theme.textTheme.bodyMedium?.copyWith(
                    fontWeight: FontWeight.w800,
                    color: AppColors.onSurface,
                  ),
                ),
              ),
              Text(
                '$xpCurrent / $xpGoal XP',
                style: theme.textTheme.labelSmall?.copyWith(
                  fontWeight: FontWeight.w800,
                  color: AppColors.onSurfaceMuted,
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          ClipRRect(
            borderRadius: BorderRadius.circular(999),
            child: LinearProgressIndicator(
              minHeight: 6,
              value: summary.progressToNextLevel,
              backgroundColor: AppColors.surfaceRaised,
              color: AppColors.brand,
            ),
          ),
          const SizedBox(height: 10),
          RichText(
            text: TextSpan(
              style: theme.textTheme.bodySmall?.copyWith(
                color: AppColors.onSurfaceMuted,
              ),
              children: [
                TextSpan(text: '$xpRemaining XP pra '),
                TextSpan(
                  text: 'Nível $nextLevel · $nextTitle',
                  style: const TextStyle(
                    color: AppColors.brand,
                    fontWeight: FontWeight.w800,
                  ),
                ),
                if (unlockHint != null) TextSpan(text: ' ($unlockHint)'),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
