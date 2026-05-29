import 'package:flutter/material.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_typography.dart';
import '../../domain/ranking_list_models.dart';

class RankingModeSegment extends StatelessWidget {
  const RankingModeSegment({
    super.key,
    required this.mode,
    required this.onChanged,
  });

  final RankingListMode mode;
  final ValueChanged<RankingListMode> onChanged;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(4),
      decoration: BoxDecoration(
        color: AppColors.surfaceCard,
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: AppColors.surfaceRaised),
      ),
      child: Row(
        children: [
          Expanded(
            child: _SegmentButton(
              label: 'Equipes',
              selected: mode == RankingListMode.teams,
              onTap: () => onChanged(RankingListMode.teams),
            ),
          ),
          Expanded(
            child: _SegmentButton(
              label: 'Atletas',
              selected: mode == RankingListMode.athletes,
              onTap: () => onChanged(RankingListMode.athletes),
            ),
          ),
        ],
      ),
    );
  }
}

class _SegmentButton extends StatelessWidget {
  const _SegmentButton({
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
      color: selected ? AppColors.brand : Colors.transparent,
      borderRadius: BorderRadius.circular(999),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(999),
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 10),
          child: Center(
            child: Text(
              label,
              style: AppTypography.soraRegular(
                fontSize: 14,
                fontWeight: FontWeight.w700,
                color: selected ? Colors.black : AppColors.onSurfaceMuted,
              ),
            ),
          ),
        ),
      ),
    );
  }
}
