import 'package:flutter/material.dart';

import '../../../../../core/theme/app_colors.dart';
import '../../../domain/match_history/athlete_match_history_models.dart';

class MatchHistoryTabSwitcher extends StatelessWidget {
  const MatchHistoryTabSwitcher({
    super.key,
    required this.tab,
    required this.matchCount,
    required this.tournamentCount,
    required this.onTabChanged,
  });

  final MatchHistoryTab tab;
  final int matchCount;
  final int tournamentCount;
  final ValueChanged<MatchHistoryTab> onTabChanged;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Container(
      padding: const EdgeInsets.all(4),
      decoration: BoxDecoration(
        color: AppColors.surfaceRaised,
        borderRadius: BorderRadius.circular(14),
      ),
      child: Row(
        children: [
          _pill(
            theme: theme,
            label: 'Partidas ($matchCount)',
            selected: tab == MatchHistoryTab.matches,
            onTap: () => onTabChanged(MatchHistoryTab.matches),
          ),
          _pill(
            theme: theme,
            label: 'Torneios ($tournamentCount)',
            selected: tab == MatchHistoryTab.tournaments,
            onTap: () => onTabChanged(MatchHistoryTab.tournaments),
          ),
        ],
      ),
    );
  }

  Widget _pill({
    required ThemeData theme,
    required String label,
    required bool selected,
    required VoidCallback onTap,
  }) {
    return Expanded(
      child: Material(
        color: selected ? AppColors.surfaceCard : Colors.transparent,
        borderRadius: BorderRadius.circular(10),
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(10),
          child: Padding(
            padding: const EdgeInsets.symmetric(vertical: 10),
            child: Text(
              label,
              textAlign: TextAlign.center,
              style: theme.textTheme.labelLarge?.copyWith(
                fontWeight: FontWeight.w800,
                color: selected ? AppColors.onSurface : AppColors.onSurfaceMuted,
              ),
            ),
          ),
        ),
      ),
    );
  }
}
