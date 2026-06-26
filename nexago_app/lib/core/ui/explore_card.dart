import 'package:flutter/material.dart';
import 'package:nexago_app/core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import 'package:nexago_app/core/theme/app_typography.dart';

class ExploreCard extends StatelessWidget {
  const ExploreCard({
    super.key,
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.onTap,
    this.enabled = true,
  });

  final IconData icon;
  final String title;
  final String subtitle;
  final VoidCallback onTap;
  final bool enabled;

  @override
  Widget build(BuildContext context) {
    final muted = !enabled;

    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Material(
        color: context.themeColors.surfaceRaised,
        borderRadius: BorderRadius.circular(16),
        child: InkWell(
          onTap: enabled ? onTap : null,
          borderRadius: BorderRadius.circular(16),
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(16),
              border: Border.all(
                color: context.themeColors.onSurfaceMuted.withValues(
                  alpha: muted ? 0.08 : 0.12,
                ),
              ),
            ),
            child: Row(
              children: [
                Container(
                  width: 40,
                  height: 40,
                  decoration: BoxDecoration(
                    color: muted
                        ? context.themeColors.onSurfaceMuted.withValues(
                            alpha: 0.08,
                          )
                        : AppColors.brand.withValues(alpha: 0.12),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Icon(
                    icon,
                    size: 20,
                    color: muted
                        ? context.themeColors.onSurfaceMuted
                        : AppColors.brand,
                  ),
                ),
                const SizedBox(width: 14),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        title,
                        style: AppTypography.soraRegular(
                          fontSize: 15,
                          fontWeight: FontWeight.w800,
                          color: muted
                              ? context.themeColors.onSurfaceMuted
                              : context.themeColors.onSurface,
                        ),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        subtitle,
                        style: AppTypography.soraRegular(
                          fontSize: 12,
                          fontWeight: FontWeight.w500,
                          color: context.themeColors.onSurfaceMuted,
                        ),
                      ),
                    ],
                  ),
                ),
                Icon(
                  Icons.chevron_right_rounded,
                  color: context.themeColors.onSurfaceMuted.withValues(
                    alpha: muted ? 0.4 : 0.7,
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
