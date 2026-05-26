import 'package:flutter/material.dart';
import 'package:nexago_app/core/theme/app_typography.dart';

import '../../../../../core/theme/app_colors.dart';
import '../../../domain/tournament_discovery_models.dart';

class TournamentDetailCategoryChips extends StatelessWidget {
  const TournamentDetailCategoryChips({
    super.key,
    required this.offers,
    required this.selectedId,
    required this.onSelected,
  });

  final List<TournamentCategoryOffer> offers;
  final String selectedId;
  final ValueChanged<String> onSelected;

  @override
  Widget build(BuildContext context) {
    if (offers.isEmpty) return const SizedBox.shrink();

    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      padding: const EdgeInsets.fromLTRB(20, 0, 20, 12),
      child: Row(
        children: [
          for (final offer in offers) ...[
            if (offer != offers.first) const SizedBox(width: 8),
            _Chip(
              label: offer.name,
              selected: offer.id == selectedId,
              onTap: () => onSelected(offer.id),
            ),
          ],
        ],
      ),
    );
  }
}

class _Chip extends StatelessWidget {
  const _Chip({
    required this.label,
    required this.selected,
    required this.onTap,
  });

  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: selected
          ? AppColors.brand.withValues(alpha: 0.2)
          : AppColors.surfaceRaised,
      borderRadius: BorderRadius.circular(99),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(99),
        child: Ink(
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(99),
            border: Border.all(
              color: selected
                  ? AppColors.brand.withValues(alpha: 0.65)
                  : AppColors.onSurfaceMuted.withValues(alpha: 0.15),
            ),
          ),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
            child: Text(
              label,
              style: AppTypography.soraRegular(
                fontSize: 13,
                fontWeight: FontWeight.w700,
                color: selected ? AppColors.brand : AppColors.onSurfaceMuted,
              ),
            ),
          ),
        ),
      ),
    );
  }
}
