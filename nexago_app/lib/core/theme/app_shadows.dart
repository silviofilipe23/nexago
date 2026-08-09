import 'package:flutter/widgets.dart';

import 'app_theme_colors.dart';

/// Sombras padrão NexaGO (dark precisa de sombra mais forte que light).
abstract final class AppShadows {
  AppShadows._();

  static List<BoxShadow> card(AppThemeColors colors) => [
        BoxShadow(
          color: colors.black.withValues(alpha: colors.isDark ? 0.35 : 0.10),
          blurRadius: 16,
          offset: const Offset(0, 6),
        ),
      ];

  static List<BoxShadow> floating(AppThemeColors colors) => [
        BoxShadow(
          color: colors.black.withValues(alpha: colors.isDark ? 0.45 : 0.14),
          blurRadius: 20,
          offset: const Offset(0, 8),
        ),
      ];
}
