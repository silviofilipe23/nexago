import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import 'package:nexago_app/core/theme/app_typography.dart';

import '../../../../core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../domain/arena_providers.dart';
import '../../domain/arena_schedule_providers.dart';

class ArenaScheduleHeader extends ConsumerWidget {
  const ArenaScheduleHeader({super.key, required this.onOpenCalendar});

  final VoidCallback onOpenCalendar;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final arenaAsync = ref.watch(managedArenaDetailProvider);
    final arenaName =
        arenaAsync.maybeWhen(data: (a) => a?.name.trim(), orElse: () => null) ??
        'Arena';
    final selected = ref.watch(arenaScheduleSelectedDateProvider);
    final stats = ref.watch(arenaScheduleDayStatsProvider);

    final dateLine = DateFormat(
      'EEE d MMM',
      'pt_BR',
    ).format(selected).toUpperCase().replaceAll('.', '');

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'GESTOR • ${arenaName.toUpperCase()}',
                    style: AppTypography.mono(
                      color: AppColors.brand,
                      fontWeight: FontWeight.w700,
                      letterSpacing: 0.8,
                      fontSize: 11,
                    ),
                  ),
                  Text(
                    'Agenda',
                    style: theme.textTheme.headlineMedium?.copyWith(
                      fontWeight: FontWeight.w800,
                      letterSpacing: -0.5,
                      color: context.themeColors.onSurface,
                    ),
                  ),
                ],
              ),
            ),
            Material(
              color: context.themeColors.surfaceRaised,
              borderRadius: BorderRadius.circular(12),
              child: InkWell(
                onTap: onOpenCalendar,
                borderRadius: BorderRadius.circular(12),
                child: SizedBox(
                  width: 44,
                  height: 44,
                  child: Icon(
                    Icons.calendar_month_outlined,
                    color: context.themeColors.onSurface,
                    size: 22,
                  ),
                ),
              ),
            ),
          ],
        ),
        SizedBox(height: 12),
        Text(
          '$dateLine · ${stats.total} SLOTS',
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
