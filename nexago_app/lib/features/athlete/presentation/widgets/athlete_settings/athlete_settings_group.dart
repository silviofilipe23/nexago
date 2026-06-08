import 'package:flutter/material.dart';

import '../../../../../core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../../../core/theme/app_typography.dart';

enum AthleteSettingsIconVariant { orange, neutral, green, yellow }

abstract final class AthleteSettingsTokens {
  AthleteSettingsTokens._();

  static const double cardRadius = 16;
  static const double horizontalPadding = 20;
  static const double sectionGap = 24;
  static const double tileDividerIndent = 68;

  static BoxDecoration cardDecoration(BuildContext context, {Color? color}) =>
      BoxDecoration(
        color: color ?? context.themeColors.surfaceRaised,
        borderRadius: BorderRadius.circular(cardRadius),
        border: Border.all(
          color: context.themeColors.onSurfaceMuted.withValues(alpha: 0.12),
        ),
      );

  static BoxDecoration dangerDecoration(BuildContext context) => BoxDecoration(
    color: context.themeColors.surfaceRaised,
    borderRadius: BorderRadius.circular(cardRadius),
    border: Border.all(color: AppColors.live.withValues(alpha: 0.35)),
  );
}

class AthleteSettingsGroup extends StatelessWidget {
  const AthleteSettingsGroup({
    super.key,
    required this.sectionLabel,
    required this.children,
  });

  final String sectionLabel;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(
          sectionLabel,
          style: theme.textTheme.labelSmall?.copyWith(
            color: context.themeColors.onSurfaceMuted,
            fontWeight: FontWeight.w800,
            letterSpacing: 0.8,
            fontSize: 10,
          ),
        ),
        SizedBox(height: 10),
        DecoratedBox(
          decoration: AthleteSettingsTokens.cardDecoration(context),
          child: ClipRRect(
            borderRadius: BorderRadius.circular(
              AthleteSettingsTokens.cardRadius,
            ),
            child: Column(mainAxisSize: MainAxisSize.min, children: children),
          ),
        ),
      ],
    );
  }
}

class AthleteSettingsDangerGroup extends StatelessWidget {
  const AthleteSettingsDangerGroup({super.key, required this.children});

  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: AthleteSettingsTokens.dangerDecoration(context),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(AthleteSettingsTokens.cardRadius),
        child: Column(mainAxisSize: MainAxisSize.min, children: children),
      ),
    );
  }
}

class AthleteSettingsTile extends StatelessWidget {
  const AthleteSettingsTile({
    super.key,
    required this.icon,
    required this.title,
    required this.subtitle,
    this.onTap,
    this.variant = AthleteSettingsIconVariant.orange,
    this.titleColor,
    this.iconColor,
    this.trailing,
    this.trailingBadge,
    this.showDivider = true,
    this.showChevron = true,
  });

  final IconData icon;
  final String title;
  final String subtitle;
  final VoidCallback? onTap;
  final AthleteSettingsIconVariant variant;
  final Color? titleColor;
  final Color? iconColor;
  final Widget? trailing;
  final Widget? trailingBadge;
  final bool showDivider;
  final bool showChevron;

  Color _iconColor(BuildContext context) =>
      iconColor ??
      switch (variant) {
        AthleteSettingsIconVariant.orange => AppColors.brand,
        AthleteSettingsIconVariant.green => AppColors.win,
        AthleteSettingsIconVariant.yellow => AppColors.pending,
        AthleteSettingsIconVariant.neutral => context.themeColors.onSurface,
      };

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final resolvedIconColor = _iconColor(context);

    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Material(
          color: Colors.transparent,
          child: InkWell(
            onTap: onTap,
            child: Padding(
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
                    child: Icon(icon, color: resolvedIconColor, size: 22),
                  ),
                  SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            Flexible(
                              child: Text(
                                title,
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: theme.textTheme.bodyMedium?.copyWith(
                                  fontWeight: FontWeight.w800,
                                  color:
                                      titleColor ??
                                      context.themeColors.onSurface,
                                ),
                              ),
                            ),
                            if (trailingBadge != null) ...[
                              SizedBox(width: 8),
                              trailingBadge!,
                            ],
                          ],
                        ),
                        SizedBox(height: 3),
                        Text(
                          subtitle,
                          style: theme.textTheme.bodySmall?.copyWith(
                            color: context.themeColors.onSurfaceMuted,
                            fontWeight: FontWeight.w500,
                            height: 1.35,
                          ),
                        ),
                      ],
                    ),
                  ),
                  if (trailing != null) ...[SizedBox(width: 8), trailing!],
                  if (showChevron)
                    Icon(
                      Icons.chevron_right_rounded,
                      size: 22,
                      color: context.themeColors.onSurfaceMuted.withValues(
                        alpha: 0.85,
                      ),
                    ),
                ],
              ),
            ),
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

class AthleteSettingsToggleTile extends StatelessWidget {
  const AthleteSettingsToggleTile({
    super.key,
    required this.title,
    required this.subtitle,
    required this.value,
    required this.onChanged,
    this.enabled = true,
    this.showDivider = true,
  });

  final String title;
  final String subtitle;
  final bool value;
  final ValueChanged<bool>? onChanged;
  final bool enabled;
  final bool showDivider;

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
                  color: context.themeColors.surfaceSheet,
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Icon(Icons.face_rounded, color: AppColors.win, size: 22),
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
                    Text(
                      subtitle,
                      style: theme.textTheme.bodySmall?.copyWith(
                        color: context.themeColors.onSurfaceMuted,
                        fontWeight: FontWeight.w500,
                        height: 1.35,
                      ),
                    ),
                  ],
                ),
              ),
              Switch.adaptive(
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

class AthleteSettingsOrangeBadge extends StatelessWidget {
  const AthleteSettingsOrangeBadge({super.key, required this.label});

  final String label;

  @override
  Widget build(BuildContext context) {
    return Text(
      label,
      style: AppTypography.mono(
        fontSize: 12,
        fontWeight: FontWeight.w800,
        color: AppColors.brand,
        letterSpacing: 0.2,
      ),
    );
  }
}

class AthleteSettingsMutedTrailing extends StatelessWidget {
  const AthleteSettingsMutedTrailing({super.key, required this.label});

  final String label;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(right: 4),
      child: Text(
        label,
        style: Theme.of(context).textTheme.bodySmall?.copyWith(
          color: context.themeColors.onSurfaceMuted,
          fontWeight: FontWeight.w600,
        ),
      ),
    );
  }
}
