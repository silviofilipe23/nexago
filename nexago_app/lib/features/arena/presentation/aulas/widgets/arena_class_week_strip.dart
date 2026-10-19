import 'package:flutter/material.dart';
import 'package:nexago_app/core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import 'package:nexago_app/core/theme/app_typography.dart';

import '../../../domain/arena_date_utils.dart';
import '../../../domain/aulas/arena_class_logic.dart';

/// Seletor de dias (segunda a domingo) com setas para a semana anterior e a
/// seguinte. Hoje ganha um ponto quando não está selecionado.
class ArenaClassWeekStrip extends StatelessWidget {
  const ArenaClassWeekStrip({
    super.key,
    required this.selected,
    required this.today,
    required this.onSelect,
  });

  final DateTime selected;
  final DateTime today;
  final ValueChanged<DateTime> onSelect;

  @override
  Widget build(BuildContext context) {
    final days = arenaClassWeekDays(selected);
    return Row(
      children: [
        _ArrowButton(
          icon: Icons.chevron_left_rounded,
          semanticLabel: 'Semana anterior',
          onTap: () => onSelect(
            DateTime(selected.year, selected.month, selected.day - 7),
          ),
        ),
        const SizedBox(width: 4),
        for (var i = 0; i < days.length; i++) ...[
          if (i > 0) const SizedBox(width: 5),
          Expanded(
            child: _DayCell(
              day: days[i],
              isSelected: arenaDateKey(days[i]) == arenaDateKey(selected),
              isToday: arenaDateKey(days[i]) == arenaDateKey(today),
              onTap: () => onSelect(days[i]),
            ),
          ),
        ],
        const SizedBox(width: 4),
        _ArrowButton(
          icon: Icons.chevron_right_rounded,
          semanticLabel: 'Próxima semana',
          onTap: () => onSelect(
            DateTime(selected.year, selected.month, selected.day + 7),
          ),
        ),
      ],
    );
  }
}

class _DayCell extends StatelessWidget {
  const _DayCell({
    required this.day,
    required this.isSelected,
    required this.isToday,
    required this.onTap,
  });

  final DateTime day;
  final bool isSelected;
  final bool isToday;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final fg = isSelected ? AppColors.black : colors.onSurface;
    return Semantics(
      button: true,
      selected: isSelected,
      label: arenaClassDayHeading(day),
      excludeSemantics: true,
      child: Material(
        color: isSelected ? AppColors.brand : colors.surfaceRaised,
        borderRadius: BorderRadius.circular(14),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: onTap,
          child: Container(
            height: 56,
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(14),
              border: Border.all(
                color: isSelected
                    ? Colors.transparent
                    : colors.onSurfaceMuted.withValues(alpha: 0.12),
              ),
            ),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Text(
                  arenaClassWeekdayInitial(day),
                  style: AppTypography.mono(
                    fontSize: 9,
                    color: isSelected ? AppColors.black : colors.onSurfaceMuted,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  '${day.day}',
                  style: AppTypography.soraRegular(
                    fontSize: 15,
                    fontWeight: FontWeight.w700,
                    color: fg,
                  ),
                ),
                const SizedBox(height: 2),
                Container(
                  width: 4,
                  height: 4,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: isToday && !isSelected
                        ? AppColors.brand
                        : Colors.transparent,
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _ArrowButton extends StatelessWidget {
  const _ArrowButton({
    required this.icon,
    required this.semanticLabel,
    required this.onTap,
  });

  final IconData icon;
  final String semanticLabel;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: 24,
      height: 56,
      child: InkWell(
        borderRadius: BorderRadius.circular(8),
        onTap: onTap,
        child: Icon(
          icon,
          size: 20,
          color: context.themeColors.onSurfaceMuted,
          semanticLabel: semanticLabel,
        ),
      ),
    );
  }
}

/// Os 3 números do topo: alunos, ocupação e aulas do dia.
class ArenaClassKpiRow extends StatelessWidget {
  const ArenaClassKpiRow({
    super.key,
    required this.view,
    required this.isToday,
  });

  final ArenaClassDayView view;
  final bool isToday;

  @override
  Widget build(BuildContext context) {
    final occupancy = view.occupancyPercent;
    final canceled = view.canceled.length;
    return Row(
      children: [
        Expanded(
          child: _Kpi(
            value: '${view.studentTotal}',
            label: isToday ? 'alunos hoje' : 'alunos no dia',
          ),
        ),
        const SizedBox(width: 8),
        Expanded(
          child: _Kpi(
            value: occupancy == null ? '—' : '$occupancy%',
            label: 'ocupação',
          ),
        ),
        const SizedBox(width: 8),
        Expanded(
          child: _Kpi(
            value: '${view.classCount}',
            label: canceled > 0
                ? 'aulas · $canceled cancel.'
                : (view.classCount == 1 ? 'aula' : 'aulas'),
          ),
        ),
      ],
    );
  }
}

class _Kpi extends StatelessWidget {
  const _Kpi({required this.value, required this.label});

  final String value;
  final String label;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Container(
      padding: const EdgeInsets.fromLTRB(12, 11, 12, 11),
      decoration: BoxDecoration(
        color: colors.surfaceRaised,
        borderRadius: BorderRadius.circular(14),
        border:
            Border.all(color: colors.onSurfaceMuted.withValues(alpha: 0.12)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            value,
            style: AppTypography.soraRegular(
              fontSize: 19,
              fontWeight: FontWeight.w800,
              color: colors.onSurface,
            ),
          ),
          const SizedBox(height: 2),
          Text(
            label,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(fontSize: 10.5, color: colors.onSurfaceMuted),
          ),
        ],
      ),
    );
  }
}
