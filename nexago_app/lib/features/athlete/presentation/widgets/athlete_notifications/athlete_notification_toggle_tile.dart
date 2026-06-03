import 'package:flutter/material.dart';

import '../../../../../core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../athlete_settings/athlete_settings_group.dart';

class AthleteNotificationToggleTile extends StatelessWidget {
  const AthleteNotificationToggleTile({
    super.key,
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.value,
    required this.onChanged,
    this.variant = AthleteSettingsIconVariant.neutral,
    this.enabled = true,
    this.showDivider = true,
    this.onSubtitleTap,
  });

  final IconData icon;
  final String title;
  final String subtitle;
  final bool value;
  final ValueChanged<bool>? onChanged;
  final AthleteSettingsIconVariant variant;
  final bool enabled;
  final bool showDivider;
  final VoidCallback? onSubtitleTap;

  Color _iconColor(BuildContext context) {
    return switch (variant) {
      AthleteSettingsIconVariant.orange => AppColors.brand,
      AthleteSettingsIconVariant.green => AppColors.win,
      AthleteSettingsIconVariant.yellow => AppColors.pending,
      AthleteSettingsIconVariant.neutral => context.themeColors.onSurface,
    };
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final iconColor = _iconColor(context);

    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.center,
            children: [
              Container(
                width: 44,
                height: 44,
                decoration: BoxDecoration(
                  color: context.themeColors.surfaceSheet,
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Icon(icon, color: iconColor, size: 22),
              ),
              SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      title,
                      style: theme.textTheme.bodyMedium?.copyWith(
                        fontWeight: FontWeight.w800,
                        color: context.themeColors.onSurface,
                      ),
                    ),
                    SizedBox(height: 3),
                    GestureDetector(
                      onTap: onSubtitleTap,
                      behavior: HitTestBehavior.opaque,
                      child: Text(
                        subtitle,
                        style: theme.textTheme.bodySmall?.copyWith(
                          color: context.themeColors.onSurfaceMuted,
                          fontWeight: FontWeight.w500,
                          height: 1.35,
                          decoration: onSubtitleTap != null
                              ? TextDecoration.underline
                              : null,
                          decorationColor:
                              context.themeColors.onSurfaceMuted.withValues(alpha: 0.5),
                        ),
                      ),
                    ),
                  ],
                ),
              ),
              Switch.adaptive(
                key: ValueKey(title),
                value: value,
                onChanged: enabled ? onChanged : null,
                activeTrackColor: AppColors.brand.withValues(alpha: 0.55),
                activeThumbColor: AppColors.brand,
              ),
            ],
          ),
        ),
        if (showDivider)
          Divider(
            height: 1,
            indent: AthleteSettingsTokens.tileDividerIndent,
            endIndent: 14,
            color: context.themeColors.onSurfaceMuted.withValues(alpha: 0.15),
          ),
      ],
    );
  }
}
