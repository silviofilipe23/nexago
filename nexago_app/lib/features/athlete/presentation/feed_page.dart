import 'package:flutter/material.dart';

import 'package:nexago_app/core/theme/app_theme_colors.dart';

/// Feed social (placeholder).
class FeedPage extends StatelessWidget {
  const FeedPage({super.key});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return ColoredBox(
      color: theme.colorScheme.surfaceContainerLowest,
      child: Center(
        child: Padding(
          padding: const EdgeInsets.all(32),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(
                Icons.dynamic_feed_outlined,
                size: 56,
                color: context.themeColors.onSurfaceMuted.withValues(
                  alpha: 0.5,
                ),
              ),
              SizedBox(height: 16),
              Text(
                'Feed',
                style: theme.textTheme.titleLarge?.copyWith(
                  fontWeight: FontWeight.w600,
                ),
              ),
              SizedBox(height: 8),
              Text(
                'Publicações da comunidade em breve.',
                textAlign: TextAlign.center,
                style: theme.textTheme.bodyMedium?.copyWith(
                  color: context.themeColors.onSurfaceMuted,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
