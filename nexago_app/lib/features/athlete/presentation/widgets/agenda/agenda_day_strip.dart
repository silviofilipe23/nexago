import 'package:flutter/material.dart';

import '../../../../../core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../domain/agenda/athlete_agenda_logic.dart';
import '../../../domain/agenda/athlete_agenda_models.dart';

class AgendaDayStrip extends StatelessWidget {
  const AgendaDayStrip({
    super.key,
    required this.days,
    required this.onSelect,
  });

  final List<AthleteAgendaWeekDay> days;
  final ValueChanged<DateTime> onSelect;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 96,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        physics: const BouncingScrollPhysics(),
        padding: const EdgeInsets.symmetric(horizontal: 20),
        itemCount: days.length,
        separatorBuilder: (_, __) => const SizedBox(width: 8),
        itemBuilder: (context, index) {
          final day = days[index];
          return _DayCell(day: day, onTap: () => onSelect(day.date));
        },
      ),
    );
  }
}

class _DayCell extends StatelessWidget {
  const _DayCell({required this.day, required this.onTap});

  final AthleteAgendaWeekDay day;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isSelected = day.isSelected;
    final isPast = day.isPast && !isSelected;

    final weekdayColor = isSelected
        ? AppColors.black.withValues(alpha: 0.65)
        : isPast
            ? context.themeColors.onSurfaceMuted.withValues(alpha: 0.45)
            : context.themeColors.onSurfaceMuted;

    final dayNumberColor = isSelected
        ? AppColors.black
        : isPast
            ? context.themeColors.onSurfaceMuted.withValues(alpha: 0.45)
            : context.themeColors.onSurface;

    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(16),
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 200),
          width: 54,
          padding: const EdgeInsets.symmetric(vertical: 10, horizontal: 4),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(16),
            color: isSelected ? AppColors.brand : Colors.transparent,
            border: isSelected
                ? null
                : Border.all(
                    color: context.themeColors.surfaceRaised,
                    width: 1,
                  ),
          ),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Text(
                day.weekdayLabel,
                style: theme.textTheme.labelSmall?.copyWith(
                  fontWeight: FontWeight.w700,
                  color: weekdayColor,
                  fontSize: 10,
                  letterSpacing: 0.3,
                ),
              ),
              const SizedBox(height: 4),
              Text(
                '${day.dayNumber}',
                style: theme.textTheme.headlineSmall?.copyWith(
                  fontWeight: FontWeight.w900,
                  fontSize: 22,
                  height: 1,
                  color: dayNumberColor,
                ),
              ),
              const SizedBox(height: 8),
              _DotRow(day: day, isSelected: isSelected),
            ],
          ),
        ),
      ),
    );
  }
}

class _DotRow extends StatelessWidget {
  const _DotRow({required this.day, required this.isSelected});

  final AthleteAgendaWeekDay day;
  final bool isSelected;

  @override
  Widget build(BuildContext context) {
    final dotColors = <Color>[];
    final rentalColor =
        isSelected ? AppColors.black : athleteAgendaRentalAccent;
    final tournamentColor =
        isSelected ? AppColors.black : athleteAgendaTournamentAccent;
    final challengeColor =
        isSelected ? AppColors.black : athleteAgendaChallengeAccent;

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

    return SizedBox(
      height: 5,
      width: double.infinity,
      child: FittedBox(
        fit: BoxFit.scaleDown,
        alignment: Alignment.center,
        child: Row(
          mainAxisSize: MainAxisSize.min,
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            for (var i = 0; i < dotColors.length; i++) ...[
              if (i > 0) const SizedBox(width: 3),
              _dot(dotColors[i]),
            ],
          ],
        ),
      ),
    );
  }

  Widget _dot(Color color) => Container(
        width: 5,
        height: 5,
        decoration: BoxDecoration(color: color, shape: BoxShape.circle),
      );
}
