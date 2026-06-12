import 'package:flutter/material.dart';

import '../../../../../core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../domain/team_discover_logic.dart';
import '../../../domain/team_discover_models.dart';
import '../team_discover/team_discover_dual_avatars.dart';

class CompeteHubTeamPreviewRow extends StatelessWidget {
  const CompeteHubTeamPreviewRow({super.key, required this.entry, this.onTap});

  final TeamDiscoverEntry entry;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final highlight = entry.isCurrentUserTeam;
    final genderLabel = teamDiscoverGenderLabel(entry);

    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(10),
        child: Container(
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
              TeamDiscoverDualAvatars(entry: entry),
              SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      entry.displayName,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: theme.textTheme.bodyMedium?.copyWith(
                        fontWeight: FontWeight.w700,
                        color: context.themeColors.onSurface,
                      ),
                    ),
                    if (genderLabel.isNotEmpty) ...[
                      SizedBox(height: 2),
                      Text(
                        genderLabel,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: theme.textTheme.labelSmall?.copyWith(
                          color: context.themeColors.onSurfaceMuted,
                          fontWeight: FontWeight.w500,
                        ),
                      ),
                    ],
                  ],
                ),
              ),
              // if (trailingLabel.isNotEmpty)
              //   Text(
              //     trailingLabel,
              //     style: AppTypography.mono(
              //       fontSize: 10,
              //       fontWeight: FontWeight.w800,
              //       color: entry.rankPoints > 0
              //           ? context.themeColors.onSurface
              //           : context.themeColors.onSurfaceMuted,
              //     ),
              //   ),
              SizedBox(width: 4),
              Icon(
                Icons.chevron_right_rounded,
                color: context.themeColors.onSurfaceMuted.withValues(
                  alpha: 0.6,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
