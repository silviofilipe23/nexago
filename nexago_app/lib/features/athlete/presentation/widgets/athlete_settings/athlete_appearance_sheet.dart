import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../../core/theme/app_theme_colors.dart';
import '../../../../../core/theme/app_theme_mode_preference.dart';
import '../../../../../core/theme/theme_mode_provider.dart';

/// Bottom sheet para escolher aparência (escuro / claro / automático).
Future<void> showAthleteAppearanceSheet(BuildContext context) async {
  await showModalBottomSheet<void>(
    context: context,
    backgroundColor: context.themeColors.surfaceSheet,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
    ),
    builder: (ctx) => const _AthleteAppearanceSheetBody(),
  );
}

class _AthleteAppearanceSheetBody extends ConsumerWidget {
  const _AthleteAppearanceSheetBody();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final current = ref.watch(appThemeModePreferenceProvider);
    final theme = Theme.of(context);

    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(20, 12, 20, 24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Center(
              child: Container(
                width: 40,
                height: 4,
                decoration: BoxDecoration(
                  color: context.themeColors.onSurfaceMuted.withValues(
                    alpha: 0.35,
                  ),
                  borderRadius: BorderRadius.circular(999),
                ),
              ),
            ),
            const SizedBox(height: 16),
            Text(
              'Aparência',
              style: theme.textTheme.titleMedium?.copyWith(
                fontWeight: FontWeight.w800,
                color: context.themeColors.onSurface,
              ),
            ),
            const SizedBox(height: 4),
            Text(
              'Escolha como o NexaGO deve ser exibido neste aparelho.',
              style: theme.textTheme.bodySmall?.copyWith(
                color: context.themeColors.onSurfaceMuted,
                height: 1.4,
              ),
            ),
            const SizedBox(height: 16),
            ...AppThemeModePreference.values.map((mode) {
              final selected = current == mode;
              return Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: Material(
                  color: selected
                      ? context.themeColors.brand.withValues(alpha: 0.12)
                      : context.themeColors.surfaceRaised,
                  borderRadius: BorderRadius.circular(12),
                  child: InkWell(
                    onTap: () async {
                      await ref
                          .read(appThemeModePreferenceProvider.notifier)
                          .setPreference(mode);
                      if (context.mounted) Navigator.of(context).pop();
                    },
                    borderRadius: BorderRadius.circular(12),
                    child: Padding(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 14,
                        vertical: 12,
                      ),
                      child: Row(
                        children: [
                          Icon(
                            _iconFor(mode),
                            color: selected
                                ? context.themeColors.brand
                                : context.themeColors.onSurfaceMuted,
                          ),
                          const SizedBox(width: 12),
                          Expanded(
                            child: Text(
                              mode.label,
                              style: theme.textTheme.bodyLarge?.copyWith(
                                fontWeight: FontWeight.w700,
                                color: context.themeColors.onSurface,
                              ),
                            ),
                          ),
                          if (selected)
                            Icon(
                              Icons.check_rounded,
                              color: context.themeColors.brand,
                              size: 22,
                            ),
                        ],
                      ),
                    ),
                  ),
                ),
              );
            }),
          ],
        ),
      ),
    );
  }

  IconData _iconFor(AppThemeModePreference mode) => switch (mode) {
        AppThemeModePreference.dark => Icons.dark_mode_outlined,
        AppThemeModePreference.light => Icons.light_mode_outlined,
        AppThemeModePreference.system => Icons.brightness_auto_outlined,
      };
}
