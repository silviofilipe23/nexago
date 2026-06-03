import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';

import '../../../../core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import 'arena_dashboard_tokens.dart';

enum ArenaSettingsIconVariant { orange, neutral }

class ArenaSettingsGroup extends StatelessWidget {
  const ArenaSettingsGroup({
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
          decoration: ArenaDashboardTokens.cardDecoration(context,
            color: context.themeColors.surfaceRaised,
          ),
          child: ClipRRect(
            borderRadius: BorderRadius.circular(ArenaDashboardTokens.cardRadius),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: children,
            ),
          ),
        ),
      ],
    );
  }
}

class ArenaSettingsTile extends StatelessWidget {
  const ArenaSettingsTile({
    super.key,
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.onTap,
    this.variant = ArenaSettingsIconVariant.orange,
    this.leading,
    this.trailingBadge,
    this.showDivider = true,
  });

  final IconData icon;
  final String title;
  final String subtitle;
  final VoidCallback? onTap;
  final ArenaSettingsIconVariant variant;
  final Widget? leading;
  final Widget? trailingBadge;
  final bool showDivider;

  static const _dividerIndent = 68.0;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final iconColor = variant == ArenaSettingsIconVariant.orange
        ? AppColors.brand
        : context.themeColors.onSurface;

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
                  leading ??
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
                        Row(
                          children: [
                            Flexible(
                              child: Text(
                                title,
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: theme.textTheme.bodyMedium?.copyWith(
                                  fontWeight: FontWeight.w800,
                                  color: context.themeColors.onSurface,
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
                  Icon(
                    Icons.chevron_right_rounded,
                    size: 22,
                    color: context.themeColors.onSurfaceMuted.withValues(alpha: 0.85),
                  ),
                ],
              ),
            ),
          ),
        ),
        if (showDivider)
          Divider(
            height: 1,
            indent: _dividerIndent,
            endIndent: 14,
            color: context.themeColors.onSurfaceMuted.withValues(alpha: 0.15),
          ),
      ],
    );
  }
}

class ArenaSettingsProfileBadge extends StatelessWidget {
  const ArenaSettingsProfileBadge({super.key});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: AppColors.win.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(
          color: AppColors.win.withValues(alpha: 0.35),
        ),
      ),
      child: Text(
        'PERFIL DA ARENA',
        style: Theme.of(context).textTheme.labelSmall?.copyWith(
              color: AppColors.win,
              fontWeight: FontWeight.w800,
              letterSpacing: 0.3,
              fontSize: 9,
            ),
      ),
    );
  }
}

class ArenaSettingsArenaLogo extends StatelessWidget {
  const ArenaSettingsArenaLogo({
    super.key,
    this.logoUrl,
  });

  final String? logoUrl;

  static const _size = 44.0;

  @override
  Widget build(BuildContext context) {
    final hasLogo = logoUrl != null && logoUrl!.isNotEmpty;

    return SizedBox(
      width: _size,
      height: _size,
      child: Stack(
        clipBehavior: Clip.none,
        children: [
          Container(
            width: _size,
            height: _size,
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(12),
              border: Border.all(
                color: context.themeColors.onSurfaceMuted.withValues(alpha: 0.2),
              ),
            ),
            clipBehavior: Clip.antiAlias,
            child: hasLogo
                ? CachedNetworkImage(
                    imageUrl: logoUrl!,
                    width: _size,
                    height: _size,
                    fit: BoxFit.cover,
                    fadeInDuration: const Duration(milliseconds: 220),
                    placeholder: (_, __) => const _ArenaLogoSkeleton(),
                    errorWidget: (_, __, ___) => _fallback(),
                  )
                : _fallback(),
          ),
          Positioned(
            right: -2,
            bottom: -2,
            child: Container(
              width: 12,
              height: 12,
              decoration: BoxDecoration(
                color: AppColors.win,
                shape: BoxShape.circle,
                border: Border.all(
                  color: context.themeColors.surfaceRaised,
                  width: 2,
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _fallback() {
    return ColoredBox(
      color: AppColors.brand.withValues(alpha: 0.18),
      child: Icon(
        Icons.stadium_rounded,
        color: AppColors.brand,
        size: 22,
      ),
    );
  }
}

class _ArenaLogoSkeleton extends StatefulWidget {
  const _ArenaLogoSkeleton();

  @override
  State<_ArenaLogoSkeleton> createState() => _ArenaLogoSkeletonState();
}

class _ArenaLogoSkeletonState extends State<_ArenaLogoSkeleton>
    with SingleTickerProviderStateMixin {
  late final AnimationController _pulse;

  @override
  void initState() {
    super.initState();
    _pulse = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 900),
    )..repeat(reverse: true);
  }

  @override
  void dispose() {
    _pulse.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _pulse,
      builder: (context, _) {
        final t = Curves.easeInOut.transform(_pulse.value);
        return ColoredBox(
          color: Color.lerp(
            context.themeColors.surfaceSheet,
            context.themeColors.onSurfaceMuted.withValues(alpha: 0.28),
            t,
          )!,
        );
      },
    );
  }
}
