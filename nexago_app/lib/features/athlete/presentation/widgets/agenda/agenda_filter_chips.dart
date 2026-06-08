import 'package:flutter/material.dart';

import '../../../../../core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../domain/agenda/athlete_agenda_logic.dart';
import '../../../domain/agenda/athlete_agenda_models.dart';

class AgendaFilterChips extends StatelessWidget {
  const AgendaFilterChips({
    super.key,
    required this.selected,
    required this.counts,
    required this.onSelected,
  });

  final AthleteAgendaFilter selected;
  final AthleteAgendaFilterCounts counts;
  final ValueChanged<AthleteAgendaFilter> onSelected;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 40,
      child: ListView(
        scrollDirection: Axis.horizontal,
        physics: const BouncingScrollPhysics(),
        padding: const EdgeInsets.symmetric(horizontal: 20),
        children: [
          _Chip(
            label: 'Tudo',
            count: counts.all,
            dotColor: null,
            selected: selected == AthleteAgendaFilter.all,
            onTap: () => onSelected(AthleteAgendaFilter.all),
          ),
          const SizedBox(width: 8),
          _Chip(
            label: 'Aluguéis',
            count: counts.rentals,
            dotColor: athleteAgendaRentalAccent,
            selected: selected == AthleteAgendaFilter.rentals,
            onTap: () => onSelected(AthleteAgendaFilter.rentals),
          ),
          const SizedBox(width: 8),
          _Chip(
            label: 'Torneios',
            count: counts.tournaments,
            dotColor: athleteAgendaTournamentAccent,
            selected: selected == AthleteAgendaFilter.tournaments,
            onTap: () => onSelected(AthleteAgendaFilter.tournaments),
          ),
          const SizedBox(width: 8),
          _Chip(
            label: 'Desafios',
            count: counts.challenges,
            dotColor: athleteAgendaChallengeAccent,
            selected: selected == AthleteAgendaFilter.challenges,
            onTap: () => onSelected(AthleteAgendaFilter.challenges),
          ),
        ],
      ),
    );
  }
}

class _Chip extends StatelessWidget {
  const _Chip({
    required this.label,
    required this.count,
    required this.selected,
    required this.onTap,
    this.dotColor,
  });

  final String label;
  final int count;
  final bool selected;
  final VoidCallback onTap;
  final Color? dotColor;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(999),
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 180),
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
          decoration: BoxDecoration(
            color: selected
                ? AppColors.brand.withValues(alpha: 0.14)
                : context.themeColors.surfaceCard,
            borderRadius: BorderRadius.circular(999),
            border: Border.all(
              color: selected
                  ? AppColors.brand
                  : context.themeColors.surfaceRaised,
              width: selected ? 1.5 : 1,
            ),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              if (dotColor != null) ...[
                Container(
                  width: 6,
                  height: 6,
                  decoration: BoxDecoration(
                    color: dotColor,
                    shape: BoxShape.circle,
                  ),
                ),
                const SizedBox(width: 6),
              ],
              Text(
                label,
                style: theme.textTheme.labelMedium?.copyWith(
                  fontWeight: FontWeight.w700,
                  color: selected
                      ? AppColors.brand
                      : context.themeColors.onSurface,
                ),
              ),
              if (count > 0) ...[
                const SizedBox(width: 6),
                Text(
                  '$count',
                  style: theme.textTheme.labelSmall?.copyWith(
                    color: context.themeColors.onSurfaceMuted,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}
