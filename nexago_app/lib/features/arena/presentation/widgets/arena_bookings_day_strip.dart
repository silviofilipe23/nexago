import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_theme_colors.dart';
import '../../domain/arena_bookings_day_providers.dart';
import '../../domain/arena_date_utils.dart';
import '../../domain/arena_manager_bookings_window.dart';

/// Faixa de 7 dias da aba Reservas: dia da semana, número e uma barrinha
/// com a ocupação de cada dia. O calendário ao lado abre qualquer dia da
/// janela carregada (30 dias para trás, 60 à frente).
class ArenaBookingsDayStrip extends ConsumerWidget {
  const ArenaBookingsDayStrip({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final days = ref.watch(arenaBookingsStripProvider);
    final selected = arenaDateKey(ref.watch(arenaBookingsSelectedDayProvider));
    final todayKey = arenaDateKey(arenaTodayDateOnly());

    return Row(
      children: [
        for (final d in days)
          Expanded(
            child: _DayCell(
              day: d,
              selected: d.dateKey == selected,
              isToday: d.dateKey == todayKey,
              onTap: () => ref
                  .read(arenaBookingsSelectedDayProvider.notifier)
                  .state = d.date,
            ),
          ),
        const SizedBox(width: 4),
        IconButton(
          key: const Key('arena-bookings-calendar'),
          tooltip: 'Escolher outro dia',
          onPressed: () => _pickDay(context, ref),
          icon: const Icon(Icons.calendar_month_rounded),
        ),
      ],
    );
  }

  Future<void> _pickDay(BuildContext context, WidgetRef ref) async {
    final today = arenaTodayDateOnly();
    final picked = await showDatePicker(
      context: context,
      initialDate: ref.read(arenaBookingsSelectedDayProvider),
      firstDate: today.subtract(const Duration(days: arenaBookingsDaysBack)),
      lastDate: today.add(const Duration(days: arenaBookingsDaysAhead)),
      helpText: 'Ver reservas do dia',
    );
    if (picked == null) return;
    ref.read(arenaBookingsSelectedDayProvider.notifier).state =
        arenaDateOnly(picked);
  }
}

class _DayCell extends StatelessWidget {
  const _DayCell({
    required this.day,
    required this.selected,
    required this.isToday,
    required this.onTap,
  });

  final ArenaBookingsStripDay day;
  final bool selected;
  final bool isToday;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final weekday = isToday
        ? 'HOJE'
        : DateFormat('EEE', 'pt_BR')
            .format(day.date)
            .replaceAll('.', '')
            .toUpperCase();
    final occupancy = day.occupancyPercent;
    final fg = selected ? AppColors.black : colors.onSurface;
    final muted = selected ? AppColors.black : colors.onSurfaceMuted;
    final semantics = [
      isToday
          ? 'Hoje'
          : DateFormat("EEEE, d 'de' MMMM", 'pt_BR').format(day.date),
      if (occupancy != null) '$occupancy% ocupado',
    ].join(', ');

    return Semantics(
      button: true,
      selected: selected,
      label: semantics,
      excludeSemantics: true,
      child: Material(
        color: selected ? AppColors.brand : Colors.transparent,
        borderRadius: BorderRadius.circular(12),
        child: InkWell(
          key: Key('arena-bookings-day-${day.dateKey}'),
          borderRadius: BorderRadius.circular(12),
          onTap: onTap,
          child: Padding(
            padding: const EdgeInsets.symmetric(vertical: 7),
            child: Column(
              children: [
                Text(
                  weekday,
                  style: TextStyle(
                    fontSize: 10,
                    fontWeight: FontWeight.w800,
                    letterSpacing: 0.4,
                    color: isToday && !selected ? colors.brandText : muted,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  '${day.date.day}',
                  style: TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.w800,
                    color: fg,
                  ),
                ),
                const SizedBox(height: 4),
                _OccupancyBar(percent: occupancy, selected: selected),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _OccupancyBar extends StatelessWidget {
  const _OccupancyBar({required this.percent, required this.selected});

  final int? percent;
  final bool selected;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final track = selected
        ? AppColors.black.withValues(alpha: 0.18)
        : colors.onSurfaceMuted.withValues(alpha: 0.18);
    final fill = selected ? AppColors.black : AppColors.brand;
    return ClipRRect(
      borderRadius: BorderRadius.circular(2),
      child: SizedBox(
        width: 22,
        height: 3,
        child: Stack(
          children: [
            Positioned.fill(child: ColoredBox(color: track)),
            FractionallySizedBox(
              alignment: Alignment.centerLeft,
              heightFactor: 1,
              widthFactor: ((percent ?? 0) / 100).clamp(0.0, 1.0),
              child: ColoredBox(color: fill),
            ),
          ],
        ),
      ),
    );
  }
}
