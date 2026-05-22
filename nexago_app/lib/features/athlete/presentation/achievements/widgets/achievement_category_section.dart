import 'package:flutter/material.dart';

import '../../../../../core/theme/app_colors.dart';
import '../../../domain/achievements/achievement_category.dart';
import '../../../domain/achievements/achievement_status.dart';
import '../../../../../core/theme/app_typography.dart';
import 'achievement_card.dart';

class AchievementCategorySection extends StatelessWidget {
  const AchievementCategorySection({
    super.key,
    required this.category,
    required this.items,
  });

  final AchievementCategory category;
  final List<AchievementViewModel> items;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    if (items.isEmpty) return const SizedBox.shrink();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Icon(category.headerIcon, size: 18, color: AppColors.brand),
            const SizedBox(width: 8),
            Text(
              category.label,
              style: AppTypography.mono(
                fontSize: theme.textTheme.labelMedium?.fontSize ?? 14,
                color: AppColors.brand,
                fontWeight: FontWeight.w700,
                letterSpacing: 1,
              ),
            ),
          ],
        ),
        const SizedBox(height: 12),
        SizedBox(
          height: AchievementCard.cardHeight + 24,
          child: ListView.separated(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 6),
            clipBehavior: Clip.none,
            itemCount: items.length,
            separatorBuilder: (_, __) => const SizedBox(width: 12),
            itemBuilder: (context, index) {
              return AchievementCard(viewModel: items[index]);
            },
          ),
        ),
      ],
    );
  }
}
