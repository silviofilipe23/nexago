import 'package:flutter/material.dart';

import '../../../../arenas/domain/arena_search_filters.dart';

/// Vocabulário de esporte da busca: rótulo e ícone de cada opção.
///
/// Fonte única — a folha de filtros e o card de arena leem daqui. Duplicar a
/// lista faria uma superfície ganhar um esporte novo e a outra não.
const List<(ArenaSportChip chip, String label, IconData icon)>
    arenaSearchSportOptions = [
  (ArenaSportChip.all, 'Todos', Icons.grid_view_rounded),
  (
    ArenaSportChip.beachVolleyball,
    'Vôlei de praia',
    Icons.sports_volleyball_rounded,
  ),
  (ArenaSportChip.beachTennis, 'Beach tênis', Icons.sports_tennis_rounded),
  (ArenaSportChip.tennis, 'Tênis', Icons.sports_baseball_rounded),
  (ArenaSportChip.padel, 'Padel', Icons.sports_handball_rounded),
  (
    ArenaSportChip.volleyball,
    'Vôlei de quadra',
    Icons.sports_volleyball_rounded,
  ),
  (ArenaSportChip.football, 'Futebol', Icons.sports_football_rounded),
];

/// Ícone do esporte (folha de filtros + card de arena).
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

/// Rótulo do esporte, para quem só tem o valor em mãos.
String arenaSearchSportChipLabel(ArenaSportChip chip) {
  for (final option in arenaSearchSportOptions) {
    if (option.$1 == chip) return option.$2;
  }
  return 'Todos';
}
