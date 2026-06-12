import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../../core/router/routes.dart';
import '../../../../../core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../../../core/theme/app_typography.dart';
import '../../../../athlete/domain/athlete_profile_providers.dart';
import '../../../../athlete/domain/athlete_public_profile_models.dart';
import '../../../domain/team_discover_models.dart';
import 'team_discover_dual_avatars.dart';
import 'team_follow_button.dart';

class TeamDiscoverCard extends ConsumerWidget {
  const TeamDiscoverCard({super.key, required this.entry});

  final TeamDiscoverEntry entry;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final viewer = ref.watch(athleteProfileProvider).valueOrNull;
    final distance = entry.proximityDistanceLabel(viewer);

    return Material(
      color: context.themeColors.surfaceCard,
      borderRadius: BorderRadius.circular(16),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: () => context.pushNamed(
          AppRouteNames.teamProfile,
          pathParameters: {'teamId': entry.teamId},
        ),
        borderRadius: BorderRadius.circular(16),
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  TeamDiscoverDualAvatars(entry: entry),
                  SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            Flexible(
                              child: Text(
                                entry.displayName,
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: AppTypography.soraRegular(
                                  fontSize: 16,
                                  fontWeight: FontWeight.w800,
                                  color: context.themeColors.onSurface,
                                ),
                              ),
                            ),
                            if (entry.displayCategory.isNotEmpty) ...[
                              SizedBox(width: 6),
                              _CategoryBadge(label: entry.displayCategory),
                            ],
                          ],
                        ),
                        if (entry.membersLabel.isNotEmpty) ...[
                          SizedBox(height: 2),
                          Text(
                            entry.membersLabel,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: AppTypography.mono(
                              fontSize: 11,
                              color: context.themeColors.onSurfaceMuted,
                            ),
                          ),
                        ],
                        SizedBox(height: 4),
                        Row(
                          children: [
                            Flexible(
                              child: Text(
                                entry.primarySportLabel,
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: AppTypography.soraRegular(
                                  fontSize: 13,
                                  fontWeight: FontWeight.w700,
                                  color: context.themeColors.onSurface,
                                  height: 1.25,
                                ),
                              ),
                            ),
                            const SizedBox(width: 8),
                            _LevelDots(segments: entry.levelSegments),
                          ],
                        ),
                      ],
                    ),
                  ),
                  SizedBox(width: 8),
                  _RankColumn(entry: entry),
                ],
              ),
              if (distance != null) ...[
                SizedBox(height: 8),
                Row(
                  mainAxisAlignment: MainAxisAlignment.end,
                  children: [
                    Icon(
                      Icons.location_on_outlined,
                      size: 14,
                      color: context.themeColors.onSurfaceMuted.withValues(
                        alpha: 0.8,
                      ),
                    ),
                    SizedBox(width: 2),
                    Text(
                      distance,
                      style: AppTypography.mono(
                        fontSize: 11,
                        fontWeight: FontWeight.w600,
                        color: context.themeColors.onSurfaceMuted,
                      ),
                    ),
                  ],
                ),
              ],
              if (entry.isLookingForPartner) ...[
                SizedBox(height: 10),
                Align(
                  alignment: Alignment.centerLeft,
                  child: Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 10,
                      vertical: 5,
                    ),
                    decoration: BoxDecoration(
                      color: AppColors.brand.withValues(alpha: 0.12),
                      borderRadius: BorderRadius.circular(8),
                      border: Border.all(
                        color: AppColors.brand.withValues(alpha: 0.35),
                      ),
                    ),
                    child: Text(
                      'PROCURA DUPLA',
                      style: AppTypography.mono(
                        fontSize: 10,
                        fontWeight: FontWeight.w800,
                        color: AppColors.brand,
                        letterSpacing: 0.6,
                      ),
                    ),
                  ),
                ),
              ],
              SizedBox(height: 12),
              Row(
                crossAxisAlignment: CrossAxisAlignment.center,
                children: [
                  Spacer(flex: 2),
                  SizedBox(width: 8),
                  Expanded(flex: 3, child: TeamFollowButton(entry: entry)),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _CategoryBadge extends StatelessWidget {
  const _CategoryBadge({required this.label});

  final String label;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: AppColors.brand.withValues(alpha: 0.18),
        borderRadius: BorderRadius.circular(6),
        border: Border.all(color: AppColors.brand.withValues(alpha: 0.25)),
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

class _RankColumn extends StatelessWidget {
  const _RankColumn({required this.entry});

  final TeamDiscoverEntry entry;

  @override
  Widget build(BuildContext context) {
    final rank = entry.rankPosition;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.end,
      children: [
        Text(
          'RANK',
          style: AppTypography.mono(
            fontSize: 9,
            fontWeight: FontWeight.w700,
            color: context.themeColors.onSurfaceMuted,
            letterSpacing: 0.6,
          ),
        ),
        SizedBox(height: 2),
        Text(
          rank != null ? '#$rank' : '—',
          style: AppTypography.soraRegular(
            fontSize: 20,
            fontWeight: FontWeight.w800,
            color: context.themeColors.onSurface,
            height: 1,
          ),
        ),
        SizedBox(height: 2),
        Text(
          '${entry.formattedRankPoints} pts',
          style: AppTypography.mono(
            fontSize: 10,
            fontWeight: FontWeight.w600,
            color: context.themeColors.onSurfaceMuted,
          ),
        ),
      ],
    );
  }
}

class _LevelDots extends StatelessWidget {
  const _LevelDots({required this.segments});

  final int segments;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        for (var i = 0; i < athleteLevelSegmentCount; i++) ...[
          if (i > 0) SizedBox(width: 5),
          Container(
            width: 7,
            height: 7,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: i < segments
                  ? AppColors.brand
                  : context.themeColors.surfaceRaised,
            ),
          ),
        ],
      ],
    );
  }
}
