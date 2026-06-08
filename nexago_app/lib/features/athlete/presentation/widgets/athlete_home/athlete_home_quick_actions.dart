import 'package:flutter/material.dart';

import '../../../../../core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../../../core/ui/app_snackbar.dart';

class AthleteHomeQuickAction {
  const AthleteHomeQuickAction({
    required this.icon,
    required this.label,
    required this.onTap,
    this.highlighted = false,
  });

  final IconData icon;
  final String label;
  final VoidCallback onTap;
  final bool highlighted;
}

class AthleteHomeQuickActions extends StatelessWidget {
  const AthleteHomeQuickActions({super.key, required this.actions});

  final List<AthleteHomeQuickAction> actions;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        for (var i = 0; i < actions.length; i++) ...[
          if (i > 0) SizedBox(width: 8),
          Expanded(child: _ActionTile(action: actions[i])),
        ],
      ],
    );
  }

  static List<AthleteHomeQuickAction> defaultActions({
    required VoidCallback onReserve,
    required VoidCallback onTournaments,
  }) {
    return [
      AthleteHomeQuickAction(
        icon: Icons.add_rounded,
        label: 'Reservar',
        onTap: onReserve,
        highlighted: true,
      ),
      AthleteHomeQuickAction(
        icon: Icons.person_add_outlined,
        label: 'Convidar',
        onTap: () {},
      ),
      AthleteHomeQuickAction(
        icon: Icons.emoji_events_outlined,
        label: 'Torneios',
        onTap: onTournaments,
      ),
      // AthleteHomeQuickAction(
      //   icon: Icons.person_search_rounded,
      //   label: 'Play Match',
      //   onTap: () {},
      // ),
    ];
  }
}

class _ActionTile extends StatelessWidget {
  const _ActionTile({required this.action});

  final AthleteHomeQuickAction action;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final highlight = action.highlighted;
    final color = highlight ? AppColors.brand : context.themeColors.onSurface;

    return Material(
      color: context.themeColors.surfaceCard,
      borderRadius: BorderRadius.circular(14),
      child: InkWell(
        onTap: action.onTap,
        borderRadius: BorderRadius.circular(14),
        child: Container(
          padding: const EdgeInsets.symmetric(vertical: 14),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(14),
            border: Border.all(
              color: highlight
                  ? AppColors.brand.withValues(alpha: 0.55)
                  : context.themeColors.surfaceRaised,
            ),
          ),
          child: Column(
            children: [
              Icon(action.icon, color: color, size: 22),
              SizedBox(height: 6),
              Text(
                action.label,
                style: theme.textTheme.labelSmall?.copyWith(
                  fontWeight: FontWeight.w800,
                  color: color,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

void showAthleteHomeComingSoon(BuildContext context) {
  showAppSnackBar(context, 'Em breve.');
}
