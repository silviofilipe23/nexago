import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../../../core/theme/app_colors.dart';
import '../../domain/arena_bookings_providers.dart';
import '../../domain/arena_providers.dart';

class ArenaBookingsHeader extends ConsumerWidget {
  const ArenaBookingsHeader({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final arenaAsync = ref.watch(managedArenaDetailProvider);
    final arenaName = arenaAsync.maybeWhen(
          data: (a) => a?.name.trim(),
          orElse: () => null,
        ) ??
        'Arena';
    final sum = ref.watch(arenaBookingsTabSummaryProvider);
    final money = NumberFormat.currency(locale: 'pt_BR', symbol: r'R$')
        .format(sum);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'GESTOR • ${arenaName.toUpperCase()}',
          style: theme.textTheme.labelSmall?.copyWith(
            color: AppColors.brand,
            fontWeight: FontWeight.w700,
            letterSpacing: 0.8,
          ),
        ),
        const SizedBox(height: 8),
        Text(
          'Reservas',
          style: theme.textTheme.headlineMedium?.copyWith(
            fontWeight: FontWeight.w800,
            letterSpacing: -0.5,
            color: AppColors.onSurface,
          ),
        ),
        const SizedBox(height: 12),
        Text(
          'RESERVAS · $money',
          style: theme.textTheme.labelLarge?.copyWith(
            color: AppColors.onSurfaceMuted,
            fontWeight: FontWeight.w700,
            letterSpacing: 0.4,
          ),
        ),
      ],
    );
  }
}
