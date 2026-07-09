import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../../core/theme/app_typography.dart';
import '../../../athlete/domain/sand_rank/sand_rank_catalog.dart';
import '../../../athlete/domain/sand_rank/sand_rank_providers.dart';
import '../../../athlete/presentation/sand_rank/widgets/sand_rank_emblem.dart';
import '../../domain/ranking_display_helpers.dart';
import '../../domain/ranking_list_models.dart';
import 'ranking_podium.dart';

class RankingListTile extends ConsumerWidget {
  const RankingListTile({
    super.key,
    required this.entry,
    this.highlight = false,
    this.onTap,
  });

  /// Altura aproximada para placeholder de scroll (card flutuante).
  static const approximateHeight = 76.0;

  final RankingListEntry entry;
  final bool highlight;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final sandRankEnabled =
        ref.watch(sandRankEnabledProvider).valueOrNull ?? false;
    final rankStep = sandRankEnabled && entry.sandRankTrackIndex != null
        ? sandRankStepByTrackIndex(entry.sandRankTrackIndex!)
        : null;

    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(14),
        child: Container(
          margin: const EdgeInsets.symmetric(vertical: 4),
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
          decoration: highlight
              ? BoxDecoration(
                  color: context.themeColors.surfaceCard,
                  borderRadius: BorderRadius.circular(14),
                  border: Border.all(
                    color: AppColors.brand.withValues(alpha: 0.45),
                    width: 1.5,
                  ),
                )
              : BoxDecoration(
                  color: context.themeColors.surfaceCard,
                  borderRadius: BorderRadius.circular(14),
                  border: Border.all(color: context.themeColors.surfaceRaised),
                ),
          child: Row(
            children: [
              SizedBox(
                width: 32,
                child: Text(
                  '${entry.rank}',
                  style: AppTypography.mono(
                    fontSize: 16,
                    fontWeight: FontWeight.w800,
                    color: highlight
                        ? AppColors.brand
                        : entry.rank <= 3
                            ? AppColors.brand
                            : context.themeColors.onSurfaceMuted,
                  ),
                ),
              ),
              RankingAvatarGroup(entry: entry, size: RankingAvatarSizes.list),
              SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Flexible(
                          child: Text(
                            highlight
                                ? entry.userPositionLabel
                                : entry.displayName,
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                            style: theme.textTheme.bodyMedium?.copyWith(
                              fontWeight: FontWeight.w700,
                              color: context.themeColors.onSurface,
                            ),
                          ),
                        ),
                        if (rankStep != null) ...[
                          SizedBox(width: 6),
                          Tooltip(
                            message: 'Elo ${sandRankLabel(rankStep)}',
                            child: SandRankEmblem(
                              rankCode: rankStep.rankCode,
                              division: rankStep.division,
                              size: SandRankEmblemSize.small,
                            ),
                          ),
                        ],
                      ],
                    ),
                    if (entry.subtitle.isNotEmpty) ...[
                      SizedBox(height: 2),
                      Text(
                        entry.subtitle,
                        style: theme.textTheme.labelSmall?.copyWith(
                          color: context.themeColors.onSurfaceMuted,
                          fontWeight: FontWeight.w500,
                        ),
                      ),
                    ],
                  ],
                ),
              ),
              SizedBox(width: 8),
              Text(
                formatRankingPoints(entry.points),
                style: AppTypography.soraRegular(
                  fontSize: 16,
                  fontWeight: FontWeight.w800,
                  color: highlight ? AppColors.brand : context.themeColors.onSurface,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class RankingUserHighlightTile extends StatelessWidget {
  const RankingUserHighlightTile({
    super.key,
    required this.entry,
    this.onTap,
  });

  final RankingListEntry entry;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return RankingListTile(entry: entry, highlight: true, onTap: onTap);
  }
}
