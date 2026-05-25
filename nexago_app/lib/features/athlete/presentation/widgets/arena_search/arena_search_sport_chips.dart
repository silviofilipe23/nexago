import 'package:flutter/material.dart';

import '../../../../../core/theme/app_colors.dart';
import '../../../../arenas/domain/arena_search_filters.dart';

/// Ícone do chip de esporte (busca Reservar + card de arena).
IconData arenaSearchSportChipIcon(ArenaSportChip chip) {
  return switch (chip) {
    ArenaSportChip.all => Icons.grid_view_rounded,
    ArenaSportChip.beachVolleyball => Icons.sports_volleyball_rounded,
    ArenaSportChip.beachTennis => Icons.sports_tennis_rounded,
    ArenaSportChip.tennis => Icons.sports_baseball_rounded,
    ArenaSportChip.padel => Icons.sports_handball_rounded,
    ArenaSportChip.volleyball => Icons.sports_volleyball_rounded,
    ArenaSportChip.football => Icons.sports_football_rounded,
  };
}

class ArenaSearchSportChips extends StatelessWidget {
  const ArenaSearchSportChips({
    super.key,
    required this.selected,
    required this.onSelected,
  });

  final ArenaSportChip selected;
  final ValueChanged<ArenaSportChip> onSelected;

  static const _options = [
    (ArenaSportChip.all, 'Todos', Icons.grid_view_rounded),
    (
      ArenaSportChip.beachVolleyball,
      'Vôlei de praia',
      Icons.sports_volleyball_rounded,
    ),
    (ArenaSportChip.beachTennis, 'Beach tênis', Icons.sports_tennis_rounded),
    (ArenaSportChip.tennis, 'Tênis', Icons.sports_baseball_rounded),
    (ArenaSportChip.padel, 'Padel', Icons.sports_handball_rounded),
    (ArenaSportChip.volleyball, 'Vôlei', Icons.sports_volleyball_rounded),
    (ArenaSportChip.football, 'Futebol', Icons.sports_football_rounded),
  ];

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 40,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        itemCount: _options.length,
        separatorBuilder: (_, _) => const SizedBox(width: 8),
        itemBuilder: (context, index) {
          final (chip, label, icon) = _options[index];
          final isSelected = selected == chip;
          return FilterChip(
            selected: isSelected,
            showCheckmark: false,
            avatar: Icon(
              icon,
              size: 18,
              color: isSelected ? AppColors.black : AppColors.onSurfaceMuted,
            ),
            label: Text(
              label,
              style: TextStyle(
                fontWeight: FontWeight.w800,
                color: isSelected ? AppColors.black : AppColors.onSurface,
              ),
            ),
            selectedColor: AppColors.brand,
            backgroundColor: AppColors.surfaceCard,
            side: BorderSide(
              color: isSelected ? AppColors.brand : AppColors.surfaceRaised,
            ),
            onSelected: (_) => onSelected(chip),
          );
        },
      ),
    );
  }
}
