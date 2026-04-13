import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../../../core/theme/app_colors.dart';
import '../../domain/arena_schedule_providers.dart';

/// Faixa horizontal de dias (estilo Airbnb / leve).
class ArenaScheduleDayStrip extends ConsumerWidget {
  const ArenaScheduleDayStrip({
    super.key,
    this.daysCount = 21,
  });

  final int daysCount;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final selected = ref.watch(arenaScheduleSelectedDateProvider);
    final theme = Theme.of(context);
    final today = DateTime.now();
    final todayDate = DateTime(today.year, today.month, today.day);
    final weekdayFmt = DateFormat('EEE', 'pt_BR');
    final dayNumFmt = DateFormat('d');

    return SizedBox(
      height: 88,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        physics: const BouncingScrollPhysics(),
        padding: const EdgeInsets.symmetric(horizontal: 4),
        itemCount: daysCount,
        separatorBuilder: (context, index) => const SizedBox(width: 8),
        itemBuilder: (context, index) {
          final day = todayDate.add(Duration(days: index));
          final dOnly = DateTime(day.year, day.month, day.day);
          final isSelected = _sameDay(dOnly, selected);
          final isToday = index == 0;

          return Material(
            color: Colors.transparent,
            child: InkWell(
              onTap: () {
                ref.read(arenaScheduleSelectedDateProvider.notifier).state = dOnly;
              },
              borderRadius: BorderRadius.circular(16),
              child: AnimatedContainer(
                duration: const Duration(milliseconds: 180),
                width: 72,
                padding: const EdgeInsets.symmetric(vertical: 10, horizontal: 8),
                decoration: BoxDecoration(
                  color: isSelected
                      ? AppColors.brand.withValues(alpha: 0.12)
                      : theme.colorScheme.surfaceContainerHighest.withValues(alpha: 0.35),
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(
                    color: isSelected
                        ? AppColors.brand.withValues(alpha: 0.45)
                        : theme.colorScheme.outline.withValues(alpha: 0.12),
                    width: isSelected ? 1.5 : 1,
                  ),
                ),
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Text(
                      weekdayFmt.format(dOnly).replaceAll('.', ''),
                      style: theme.textTheme.labelSmall?.copyWith(
                        fontWeight: FontWeight.w600,
                        color: theme.colorScheme.onSurface.withValues(alpha: 0.5),
                        fontSize: 11,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      dayNumFmt.format(dOnly),
                      style: theme.textTheme.titleMedium?.copyWith(
                        fontWeight: FontWeight.w800,
                        color: isSelected ? AppColors.brand : null,
                      ),
                    ),
                    if (isToday)
                      Padding(
                        padding: const EdgeInsets.only(top: 4),
                        child: Container(
                          width: 5,
                          height: 5,
                          decoration: BoxDecoration(
                            color: AppColors.brand,
                            shape: BoxShape.circle,
                          ),
                        ),
                      ),
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
