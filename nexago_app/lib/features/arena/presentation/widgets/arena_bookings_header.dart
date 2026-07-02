import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/formatting/app_currency_format.dart';
import '../../../../core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import 'package:nexago_app/core/theme/app_typography.dart';
import '../../domain/arena_providers.dart';

class ArenaBookingsHeader extends ConsumerWidget {
  const ArenaBookingsHeader({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final arenaName = ref.watch(managedArenaDetailProvider).maybeWhen(
          data: (a) => a?.name.trim(),
          orElse: () => null,
        ) ??
        'Arena';
    final label = arenaName.isNotEmpty ? arenaName.toUpperCase() : 'ARENA';
    final mode = ref.watch(bookingViewModeProvider);
    final count = ref.watch(arenaBookingsTabCountsProvider).forMode(mode);
    final money = formatBRL(ref.watch(arenaBookingsTabSummaryProvider));
    final reservations = count == 1 ? 'RESERVA' : 'RESERVAS';

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'GESTOR · $label',
          style: AppTypography.mono(
            color: AppColors.brand,
            fontWeight: FontWeight.w700,
            letterSpacing: 0.8,
            fontSize: 11,
          ),
        ),
        const SizedBox(height: 2),
        Text(
          'Reservas',
          style: theme.textTheme.headlineMedium?.copyWith(
            fontWeight: FontWeight.w800,
            letterSpacing: -0.5,
            color: context.themeColors.onSurface,
            fontSize: 26,
            height: 1.05,
          ),
        ),
        const SizedBox(height: 12),
        Text(
          '${mode.label.toUpperCase()} · $count $reservations · $money',
          style: theme.textTheme.labelLarge?.copyWith(
            color: context.themeColors.onSurfaceMuted,
            fontWeight: FontWeight.w700,
            letterSpacing: 0.4,
          ),
        ),
      ],
    );
  }
}
