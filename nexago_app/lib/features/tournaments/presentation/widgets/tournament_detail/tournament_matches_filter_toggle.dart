import 'package:flutter/material.dart';
import 'package:nexago_app/core/theme/app_typography.dart';

import '../../../../../core/theme/app_colors.dart';

enum TournamentMatchesFilter {
  all,
  mine,
}

class TournamentMatchesFilterToggle extends StatelessWidget {
  const TournamentMatchesFilterToggle({
    super.key,
    required this.value,
    required this.onChanged,
  });

  final TournamentMatchesFilter value;
  final ValueChanged<TournamentMatchesFilter> onChanged;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 8, 20, 8),
      child: Container(
        padding: const EdgeInsets.all(3),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(10),
          border: Border.all(
            color: AppColors.onSurfaceMuted.withValues(alpha: 0.12),
          ),
        ),
        child: Row(
          children: [
            Expanded(
              child: _Segment(
                label: 'Todos os jogos',
                selected: value == TournamentMatchesFilter.all,
                onTap: () => onChanged(TournamentMatchesFilter.all),
              ),
            ),
            Expanded(
              child: _Segment(
                label: 'Só os meus',
                selected: value == TournamentMatchesFilter.mine,
                onTap: () => onChanged(TournamentMatchesFilter.mine),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _Segment extends StatelessWidget {
  const _Segment({
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
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(8),
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 180),
          padding: const EdgeInsets.symmetric(vertical: 9),
          decoration: BoxDecoration(
            color: selected ? AppColors.surfaceCard : Colors.transparent,
            borderRadius: BorderRadius.circular(8),
          ),
          alignment: Alignment.center,
          child: Text(
            label,
            style: AppTypography.soraRegular(
              fontSize: 13,
              fontWeight: selected ? FontWeight.w600 : FontWeight.w500,
              color: selected ? AppColors.onSurface : AppColors.onSurfaceMuted,
            ),
          ),
        ),
      ),
    );
  }
}
