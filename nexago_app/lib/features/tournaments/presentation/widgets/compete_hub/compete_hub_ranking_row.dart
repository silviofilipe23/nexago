import 'package:flutter/material.dart';

import '../../../../../core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../../../core/theme/app_typography.dart';
import '../../../../athlete/presentation/widgets/athlete_profile_avatar.dart';
import '../../../../ranking/domain/ranking_display_helpers.dart';
import '../../../domain/compete_hub_models.dart';

const _hubRankingAvatarSize = 36.0;

class CompeteHubRankingRow extends StatelessWidget {
  const CompeteHubRankingRow({super.key, required this.entry});

  final CompeteHubRankingEntry entry;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final highlight = entry.isCurrentUser;

    return Container(
      margin: const EdgeInsets.symmetric(vertical: 4),
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 8),
      decoration: highlight
          ? BoxDecoration(
              color: AppColors.brand.withValues(alpha: 0.08),
              borderRadius: BorderRadius.circular(10),
              border: Border.all(
                color: AppColors.brand.withValues(alpha: 0.25),
              ),
            )
          : null,
      child: Row(
        children: [
          SizedBox(
            width: 28,
            child: Text(
              '#${entry.rank}',
              style: AppTypography.mono(
                fontSize: 12,
                fontWeight: FontWeight.w800,
                color: entry.rank <= 3
                    ? AppColors.brand
                    : context.themeColors.onSurfaceMuted,
              ),
            ),
          ),
          AthleteProfileAvatar(
            size: _hubRankingAvatarSize,
            initials: entry.initials,
            imageUrl: entry.avatarUrl,
          ),
          SizedBox(width: 10),
          Expanded(
            child: Text(
              entry.name,
              style: theme.textTheme.bodyMedium?.copyWith(
                fontWeight: FontWeight.w700,
                color: context.themeColors.onSurface,
              ),
            ),
          ),
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Text(
                formatRankingPoints(entry.points),
                style: AppTypography.soraRegular(
                  fontSize: 15,
                  fontWeight: FontWeight.w800,
                  color:
                      entry.rank == 1 ? AppColors.brand : context.themeColors.onSurface,
                ),
              ),
              if (entry.tournamentsCount > 0)
                Text(
                  '${entry.tournamentsCount} '
                  'etapa${entry.tournamentsCount == 1 ? '' : 's'}',
                  style: theme.textTheme.labelSmall?.copyWith(
                    color: context.themeColors.onSurfaceMuted,
                    fontWeight: FontWeight.w500,
                  ),
                ),
            ],
          ),
        ],
      ),
    );
  }
}
