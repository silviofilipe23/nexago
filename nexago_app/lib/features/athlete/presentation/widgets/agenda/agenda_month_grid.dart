import 'package:flutter/material.dart';

import '../../../../../core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../../../core/theme/app_typography.dart';
import '../../../domain/agenda/athlete_agenda_logic.dart';
import '../../../domain/agenda/athlete_agenda_models.dart';

const _weekdayHeaders = ['SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB', 'DOM'];

class AgendaMonthGrid extends StatelessWidget {
  const AgendaMonthGrid({
    super.key,
    required this.visibleMonth,
    required this.days,
    required this.onMonthChanged,
    required this.onDaySelected,
  });

  final DateTime visibleMonth;
  final List<AthleteAgendaMonthDay> days;
  final ValueChanged<DateTime> onMonthChanged;
  final ValueChanged<DateTime> onDaySelected;

  @override
  Widget build(BuildContext context) {
    final monthTitle = formatAgendaMonthGridTitle(visibleMonth);
    final first = startOfMonth(visibleMonth);
    final startWeekday = (first.weekday - 1) % 7;

    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 8, 20, 0),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              IconButton(
                onPressed: () => onMonthChanged(
                  DateTime(visibleMonth.year, visibleMonth.month - 1),
                ),
                icon: const Icon(Icons.chevron_left_rounded),
                color: context.themeColors.onSurfaceMuted,
              ),
              Expanded(
                child: Text(
                  monthTitle,
                  textAlign: TextAlign.center,
                  style: Theme.of(context).textTheme.titleSmall?.copyWith(
                        fontWeight: FontWeight.w800,
                        color: context.themeColors.onSurface,
                      ),
                ),
              ),
              IconButton(
                onPressed: () => onMonthChanged(
                  DateTime(visibleMonth.year, visibleMonth.month + 1),
                ),
                icon: const Icon(Icons.chevron_right_rounded),
                color: context.themeColors.onSurfaceMuted,
              ),
            ],
          ),
          const SizedBox(height: 8),
          Row(
            children: [
              for (final label in _weekdayHeaders)
                Expanded(
                  child: Text(
                    label,
                    textAlign: TextAlign.center,
                    style: AppTypography.mono(
                      fontSize: 10,
                      fontWeight: FontWeight.w700,
                      color: context.themeColors.onSurfaceMuted,
                    ),
                  ),
                ),
            ],
          ),
          const SizedBox(height: 8),
          GridView.builder(
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
              crossAxisCount: 7,
              mainAxisSpacing: 6,
              crossAxisSpacing: 6,
              childAspectRatio: 0.82,
            ),
            itemCount: startWeekday + days.length,
            itemBuilder: (context, index) {
              if (index < startWeekday) {
                return const SizedBox.shrink();
              }
              final day = days[index - startWeekday];
              return _MonthDayCell(
                day: day,
                onTap: () => onDaySelected(day.date),
              );
            },
          ),
        ],
      ),
    );
  }
}

class _MonthDayCell extends StatelessWidget {
  const _MonthDayCell({required this.day, required this.onTap});

  final AthleteAgendaMonthDay day;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final isSelected = day.isSelected;
    final isToday = day.isToday && !isSelected;

    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: Container(
          decoration: BoxDecoration(
            color: isSelected
                ? AppColors.brand
                : isToday
                    ? AppColors.brand.withValues(alpha: 0.12)
                    : context.themeColors.surfaceCard,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(
              color: isSelected
                  ? AppColors.brand
                  : isToday
                      ? AppColors.brand.withValues(alpha: 0.45)
                      : context.themeColors.surfaceRaised,
            ),
          ),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Text(
                '${day.dayNumber}',
                style: Theme.of(context).textTheme.titleSmall?.copyWith(
                      fontWeight: FontWeight.w800,
                      color: isSelected
                          ? AppColors.black
                          : context.themeColors.onSurface,
                    ),
              ),
              const SizedBox(height: 4),
              _DotRow(day: day, selected: isSelected),
            ],
          ),
        ),
      ),
    );
  }
}

class _DotRow extends StatelessWidget {
  const _DotRow({required this.day, required this.selected});

  final AthleteAgendaMonthDay day;
  final bool selected;

  @override
  Widget build(BuildContext context) {
    final dotColors = <Color>[];
    final rentalColor =
        selected ? AppColors.black : athleteAgendaRentalAccent;
    final tournamentColor =
        selected ? AppColors.black : athleteAgendaTournamentAccent;
    final challengeColor =
        selected ? AppColors.black : athleteAgendaChallengeAccent;

    for (var i = 0; i < day.rentalDots; i++) {
      dotColors.add(rentalColor);
    }
    for (var i = 0; i < day.tournamentDots; i++) {
      dotColors.add(tournamentColor);
    }
    for (var i = 0; i < day.challengeDots; i++) {
      dotColors.add(challengeColor);
    }

    if (dotColors.isEmpty) {
      return const SizedBox(height: 5);
    }

    return Row(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        for (var i = 0; i < dotColors.length; i++) ...[
          if (i > 0) const SizedBox(width: 3),
          _dot(dotColors[i]),
        ],
      ],
    );
  }

  Widget _dot(Color color) => Container(
        width: 5,
        height: 5,
        decoration: BoxDecoration(color: color, shape: BoxShape.circle),
      );
}
