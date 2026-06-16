import 'package:flutter/material.dart';
import 'package:nexago_app/core/layout/nexa_app_bar.dart';

import '../../../../../core/theme/app_theme_colors.dart';
import '../../../../../core/theme/app_typography.dart';

class MyTournamentsAppBar extends StatelessWidget implements PreferredSizeWidget {
  const MyTournamentsAppBar({
    super.key,
    required this.subtitle,
    required this.onBack,
    required this.onSearchTap,
    this.searchActive = false,
  });

  final String subtitle;
  final VoidCallback onBack;
  final VoidCallback onSearchTap;
  final bool searchActive;

  static const _toolbarHeight = 64.0;

  @override
  Size get preferredSize => const Size.fromHeight(_toolbarHeight);

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return NexaAppBar(
      backgroundColor: context.themeColors.canvas,
      surfaceTintColor: Colors.transparent,
      elevation: 0,
      centerTitle: false,
      toolbarHeight: _toolbarHeight,
      titleSpacing: 8,
      leading: Padding(
        padding: const EdgeInsets.only(left: 12),
        child: Center(
          child: Material(
            color: context.themeColors.surfaceRaised,
            borderRadius: BorderRadius.circular(12),
            child: InkWell(
              onTap: onBack,
              borderRadius: BorderRadius.circular(12),
              child: SizedBox(
                width: 40,
                height: 40,
                child: Icon(
                  Icons.chevron_left_rounded,
                  color: context.themeColors.onSurface,
                ),
              ),
            ),
          ),
        ),
      ),
      title: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisAlignment: MainAxisAlignment.center,
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(
            subtitle.toUpperCase(),
            style: AppTypography.mono(
              fontSize: 10,
              fontWeight: FontWeight.w600,
              color: context.themeColors.onSurfaceMuted,
              letterSpacing: 0.6,
            ),
          ),
          SizedBox(height: 4),
          Text(
            'Meus torneios',
            style: theme.textTheme.titleLarge?.copyWith(
              fontWeight: FontWeight.w800,
              color: context.themeColors.onSurface,
              letterSpacing: -0.3,
              height: 1.1,
            ),
          ),
        ],
      ),
      actions: [
        Padding(
          padding: const EdgeInsets.only(right: 16),
          child: Center(
            child: Material(
              color: searchActive
                  ? context.themeColors.surfaceCard
                  : context.themeColors.surfaceRaised,
              borderRadius: BorderRadius.circular(12),
              child: InkWell(
                onTap: onSearchTap,
                borderRadius: BorderRadius.circular(12),
                child: SizedBox(
                  width: 40,
                  height: 40,
                  child: Icon(
                    Icons.search_rounded,
                    color: context.themeColors.onSurface,
                    size: 22,
                  ),
                ),
              ),
            ),
          ),
        ),
      ],
    );
  }
}
