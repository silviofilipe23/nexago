import 'package:flutter/material.dart';

import '../../../../../core/theme/app_colors.dart';
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

  Color _iconColor() {
    return switch (variant) {
      AthleteSettingsIconVariant.orange => AppColors.brand,
      AthleteSettingsIconVariant.green => AppColors.win,
      AthleteSettingsIconVariant.yellow => AppColors.pending,
      AthleteSettingsIconVariant.neutral => AppColors.onSurface,
    };
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

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
                  color: AppColors.surfaceSheet,
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Icon(icon, color: _iconColor(), size: 22),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      title,
                      style: theme.textTheme.bodyMedium?.copyWith(
                        fontWeight: FontWeight.w800,
                        color: AppColors.onSurface,
                      ),
                    ),
                    const SizedBox(height: 3),
                    GestureDetector(
                      onTap: onSubtitleTap,
                      behavior: HitTestBehavior.opaque,
                      child: Text(
                        subtitle,
                        style: theme.textTheme.bodySmall?.copyWith(
                          color: AppColors.onSurfaceMuted,
                          fontWeight: FontWeight.w500,
                          height: 1.35,
                          decoration: onSubtitleTap != null
                              ? TextDecoration.underline
                              : null,
                          decorationColor:
                              AppColors.onSurfaceMuted.withValues(alpha: 0.5),
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
            color: AppColors.onSurfaceMuted.withValues(alpha: 0.15),
          ),
      ],
    );
  }
}
