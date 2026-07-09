import 'package:flutter/material.dart';

import '../../../../../core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../../../core/theme/app_typography.dart';
import '../../../domain/athlete_firestore_codes.dart';

class AthleteDiscoverSportChips extends StatelessWidget {
  const AthleteDiscoverSportChips({
    super.key,
    required this.selectedSportId,
    required this.onSelected,
    this.horizontalPadding = 20,
  });

  final String? selectedSportId;
  final ValueChanged<String?> onSelected;
  final double horizontalPadding;

  static const _options = <(String, String, IconData)>[
    ('VOLEI_PRAIA', 'Vôlei de praia', Icons.sports_volleyball_rounded),
    ('FUTEBOL', 'Futebol', Icons.sports_football_rounded),
    ('BEACH_TENNIS', 'Beach tennis', Icons.sports_tennis_rounded),
    ('VOLEI_QUADRA', 'Vôlei de quadra', Icons.sports_volleyball_rounded),
    ('BASQUETE', 'Basquete', Icons.sports_basketball_rounded),
    ('TENIS', 'Tênis', Icons.sports_tennis_rounded),
  ];

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 40,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        padding: EdgeInsets.symmetric(horizontal: horizontalPadding),
        itemCount: _options.length,
        separatorBuilder: (_, __) => const SizedBox(width: 8),
        itemBuilder: (context, index) {
          final (id, fallbackLabel, icon) = _options[index];
          final label =
              AthleteFirestoreCodes.sportFirestoreToLabel(id) ?? fallbackLabel;
          final selected = selectedSportId == id;
          return FilterChip(
            selected: selected,
            showCheckmark: false,
            avatar: Icon(
              icon,
              size: 18,
              color: selected
                  ? AppColors.black
                  : context.themeColors.onSurfaceMuted,
            ),
            label: Text(
              label,
              style: AppTypography.soraRegular(
                fontSize: 13,
                fontWeight: FontWeight.w800,
                color: selected
                    ? AppColors.black
                    : context.themeColors.onSurface,
              ),
            ),
            selectedColor: AppColors.brand,
            backgroundColor: context.themeColors.surfaceCard,
            side: BorderSide(
              color: selected
                  ? AppColors.brand
                  : context.themeColors.outline.withValues(alpha: 0.35),
            ),
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(999),
            ),
            onSelected: (_) => onSelected(selected ? null : id),
          );
        },
      ),
    );
  }
}
