import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../domain/arena_schedule_models.dart';
import '../../domain/arena_schedule_providers.dart';

class ArenaScheduleFilters extends ConsumerWidget {
  const ArenaScheduleFilters({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final stats = ref.watch(arenaScheduleDayStatsProvider);
    final statusFilter = ref.watch(arenaScheduleStatusFilterProvider);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'FILTRAR',
          style: theme.textTheme.labelSmall?.copyWith(
            color: context.themeColors.onSurfaceMuted,
            fontWeight: FontWeight.w800,
            letterSpacing: 0.8,
          ),
        ),
        SizedBox(height: 10),
        SingleChildScrollView(
          scrollDirection: Axis.horizontal,
          child: Row(
            children: [
              _FilterChip(
                label: 'Todas',
                count: stats.total,
                selected: statusFilter == ArenaScheduleStatusFilter.all,
                onTap: () => ref
                    .read(arenaScheduleStatusFilterProvider.notifier)
                    .state = ArenaScheduleStatusFilter.all,
              ),
              SizedBox(width: 8),
              _FilterChip(
                label: 'Disponível',
                count: stats.available,
                selected:
                    statusFilter == ArenaScheduleStatusFilter.available,
                accent: AppColors.win,
                onTap: () => ref
                    .read(arenaScheduleStatusFilterProvider.notifier)
                    .state = ArenaScheduleStatusFilter.available,
              ),
              SizedBox(width: 8),
              _FilterChip(
                label: 'Reservado',
                count: stats.booked,
                selected: statusFilter == ArenaScheduleStatusFilter.booked,
                accent: AppColors.live,
                onTap: () => ref
                    .read(arenaScheduleStatusFilterProvider.notifier)
                    .state = ArenaScheduleStatusFilter.booked,
              ),
              if (stats.blocked > 0) ...[
                SizedBox(width: 8),
                _FilterChip(
                  label: 'Bloqueado',
                  count: stats.blocked,
                  selected: statusFilter == ArenaScheduleStatusFilter.blocked,
                  accent: context.themeColors.onSurfaceMuted,
                  onTap: () => ref
                      .read(arenaScheduleStatusFilterProvider.notifier)
                      .state = ArenaScheduleStatusFilter.blocked,
                ),
              ],
            ],
          ),
        ),
      ],
    );
  }
}

class _FilterChip extends StatelessWidget {
  const _FilterChip({
    required this.label,
    required this.count,
    required this.selected,
    required this.onTap,
    this.accent,
  });

  final String label;
  final int count;
  final bool selected;
  final VoidCallback onTap;
  final Color? accent;

  @override
  Widget build(BuildContext context) {
    final fg = selected ? AppColors.black : context.themeColors.onSurface;
    return Material(
      color: selected ? AppColors.brand : context.themeColors.surfaceRaised,
      borderRadius: BorderRadius.circular(999),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(999),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
          child: Text(
            '$label $count',
            style: TextStyle(
              color: fg,
              fontWeight: FontWeight.w700,
              fontSize: 13,
            ),
          ),
        ),
      ),
    );
  }
}
