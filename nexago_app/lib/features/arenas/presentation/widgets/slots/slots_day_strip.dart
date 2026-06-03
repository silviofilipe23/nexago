import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../../../../../core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../domain/slots_page_providers.dart';

class SlotsDayStrip extends StatelessWidget {
  const SlotsDayStrip({
    super.key,
    required this.selectedDay,
    required this.daysCount,
    required this.calendarDays,
    required this.onSelect,
    required this.sameDay,
    required this.dateOnly,
  });

  final DateTime selectedDay;
  final int daysCount;
  final List<SlotsCalendarDayStatus>? calendarDays;
  final ValueChanged<DateTime> onSelect;
  final bool Function(DateTime a, DateTime b) sameDay;
  final DateTime Function(DateTime d) dateOnly;

  static final _weekdayFmt = DateFormat('EEE', 'pt_BR');

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final today = dateOnly(DateTime.now());

    return SizedBox(
      height: 88,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        physics: const BouncingScrollPhysics(),
        padding: const EdgeInsets.symmetric(horizontal: 16),
        itemCount: daysCount,
        separatorBuilder: (_, __) => SizedBox(width: 8),
        itemBuilder: (context, index) {
          final day = today.add(Duration(days: index));
          final d = dateOnly(day);
          final isSelected = sameDay(d, selectedDay);
          final status = _statusFor(d);
          final weekLabel =
              _weekdayFmt.format(d).replaceAll('.', '').toUpperCase();
          final dayNum = d.day.toString();

          final dotColor = isSelected
              ? AppColors.brand
              : status?.availability.hasAnyFree == true
                  ? AppColors.win
                  : AppColors.live;

          return Material(
            color: Colors.transparent,
            child: InkWell(
              onTap: () => onSelect(d),
              borderRadius: BorderRadius.circular(14),
              child: AnimatedContainer(
                duration: const Duration(milliseconds: 200),
                width: 56,
                padding: const EdgeInsets.symmetric(vertical: 10, horizontal: 6),
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(14),
                  border: Border.all(
                    color: isSelected
                        ? AppColors.brand
                        : context.themeColors.surfaceRaised,
                    width: isSelected ? 2 : 1,
                  ),
                  color: isSelected
                      ? AppColors.brand.withValues(alpha: 0.12)
                      : context.themeColors.surfaceCard,
                ),
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Text(
                      weekLabel,
                      style: theme.textTheme.labelSmall?.copyWith(
                        fontWeight: FontWeight.w700,
                        color: context.themeColors.onSurfaceMuted,
                        fontSize: 10,
                      ),
                    ),
                    SizedBox(height: 4),
                    Text(
                      dayNum,
                      style: theme.textTheme.titleMedium?.copyWith(
                        fontWeight: FontWeight.w900,
                        color: context.themeColors.onSurface,
                      ),
                    ),
                    SizedBox(height: 6),
                    Container(
                      width: 6,
                      height: 6,
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        color: status == null
                            ? context.themeColors.surfaceRaised
                            : dotColor,
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

  SlotsCalendarDayStatus? _statusFor(DateTime d) {
    if (calendarDays == null) return null;
    for (final s in calendarDays!) {
      if (sameDay(s.date, d)) return s;
    }
    return null;
  }
}
