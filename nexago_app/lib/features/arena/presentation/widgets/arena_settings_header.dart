import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:nexago_app/core/theme/app_typography.dart';

import '../../../../core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../domain/arena_schedule_providers.dart';

class ArenaSettingsHeader extends ConsumerWidget {
  const ArenaSettingsHeader({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final arenaName =
        ref
            .watch(managedArenaDetailProvider)
            .maybeWhen(data: (a) => a?.name.trim(), orElse: () => null) ??
        'Arena';

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          '${arenaName.toUpperCase()} • OWNER',
          style: AppTypography.mono(
            color: AppColors.brand,
            fontWeight: FontWeight.w700,
            letterSpacing: 0.8,
            fontSize: 11,
          ),
        ),
        Text(
          'Ajustes',
          style: theme.textTheme.headlineMedium?.copyWith(
            fontWeight: FontWeight.w800,
            letterSpacing: -0.5,
            color: context.themeColors.onSurface,
          ),
        ),
        SizedBox(height: 12),
        Text(
          'Perfil da arena, disponibilidade e quadras — tudo num só lugar.',
          style: theme.textTheme.bodyLarge?.copyWith(
            color: context.themeColors.onSurfaceMuted,
            fontWeight: FontWeight.w500,
            height: 1.45,
          ),
        ),
      ],
    );
  }
}
