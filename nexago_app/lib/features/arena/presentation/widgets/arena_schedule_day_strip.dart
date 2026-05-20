import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../../../core/theme/app_colors.dart';
import '../../domain/arena_date_utils.dart';
import '../../domain/arena_schedule_providers.dart';

/// Faixa horizontal de dias (compacta, tema dark).
class ArenaScheduleDayStrip extends ConsumerWidget {
  const ArenaScheduleDayStrip({
    super.key,
    this.daysCount = 14,
  });

  final int daysCount;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final selected = ref.watch(arenaScheduleSelectedDateProvider);
    final stats = ref.watch(arenaScheduleDayStatsProvider);
    final theme = Theme.of(context);
    final today = arenaTodayDateOnly();
    final weekdayFmt = DateFormat('EEE', 'pt_BR');

    return SizedBox(
      height: 96,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        physics: const BouncingScrollPhysics(),
        padding: const EdgeInsets.symmetric(horizontal: 4),
        itemCount: daysCount,
        separatorBuilder: (_, __) => const SizedBox(width: 8),
        itemBuilder: (context, index) {
          final day = today.add(Duration(days: index));
          final dOnly = arenaDateOnly(day);
          final isSelected = _sameDay(dOnly, selected);
          final isToday = index == 0;

          return Material(
            color: Colors.transparent,
            child: InkWell(
              onTap: () {
                ref.read(arenaScheduleSelectedDateProvider.notifier).state =
                    dOnly;
              },
              borderRadius: BorderRadius.circular(14),
              child: AnimatedContainer(
                duration: const Duration(milliseconds: 180),
                width: isSelected ? 72 : 56,
                padding: EdgeInsets.symmetric(
                  vertical: isSelected ? 8 : 10,
                  horizontal: 6,
                ),
                decoration: BoxDecoration(
                  color: isSelected
                      ? AppColors.brand.withValues(alpha: 0.15)
                      : AppColors.surfaceRaised,
                  borderRadius: BorderRadius.circular(14),
                  border: Border.all(
                    color: isSelected
                        ? AppColors.brand
                        : AppColors.onSurfaceMuted.withValues(alpha: 0.15),
                    width: isSelected ? 1.5 : 1,
                  ),
                ),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Text(
                      weekdayFmt.format(dOnly).replaceAll('.', '').toUpperCase(),
                      style: theme.textTheme.labelSmall?.copyWith(
                        fontWeight: FontWeight.w700,
                        color: isSelected
                            ? AppColors.brand
                            : AppColors.onSurfaceMuted,
                        fontSize: 10,
                        letterSpacing: 0.3,
                        height: 1.1,
                      ),
                    ),
                    SizedBox(height: isSelected ? 3 : 4),
                    Text(
                      '${dOnly.day}',
                      style: (isSelected
                              ? theme.textTheme.titleMedium
                              : theme.textTheme.titleLarge)
                          ?.copyWith(
                        fontWeight: FontWeight.w800,
                        color: isSelected
                            ? AppColors.onSurface
                            : AppColors.onSurfaceMuted,
                        height: 1,
                      ),
                    ),
                    if (isSelected && stats.total > 0) ...[
                      const SizedBox(height: 3),
                      Text(
                        '${stats.total} SLOTS',
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: theme.textTheme.labelSmall?.copyWith(
                          color: AppColors.brand,
                          fontWeight: FontWeight.w800,
                          fontSize: 8,
                          letterSpacing: 0.3,
                          height: 1.1,
                        ),
                      ),
                    ] else if (isToday && !isSelected) ...[
                      const SizedBox(height: 4),
                      Container(
                        width: 5,
                        height: 5,
                        decoration: const BoxDecoration(
                          color: AppColors.brand,
                          shape: BoxShape.circle,
                        ),
                      ),
                    ],
                  ],
                ),
              ),
            ),
          );
        },
      ),
    );
  }

  static bool _sameDay(DateTime a, DateTime b) =>
      a.year == b.year && a.month == b.month && a.day == b.day;
}
