import 'package:flutter/material.dart';
import 'package:nexago_app/core/theme/app_typography.dart';

import '../../../../../core/theme/app_colors.dart';

class AthleteNotificationsFilterBar extends StatelessWidget {
  const AthleteNotificationsFilterBar({
    super.key,
    required this.showUnreadOnly,
    required this.unreadCount,
    required this.onChanged,
  });

  final bool showUnreadOnly;
  final int unreadCount;
  final ValueChanged<bool> onChanged;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        _FilterChip(
          label: 'Todas',
          selected: !showUnreadOnly,
          onTap: () => onChanged(false),
        ),
        const SizedBox(width: 8),
        _FilterChip(
          label: 'Não lidas',
          selected: showUnreadOnly,
          badgeCount: unreadCount,
          onTap: () => onChanged(true),
        ),
      ],
    );
  }
}

class _FilterChip extends StatelessWidget {
  const _FilterChip({
    required this.label,
    required this.selected,
    required this.onTap,
    this.badgeCount,
  });

  final String label;
  final bool selected;
  final VoidCallback onTap;
  final int? badgeCount;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Material(
      color: selected ? AppColors.brand : AppColors.surfaceRaised,
      borderRadius: BorderRadius.circular(999),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(999),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                label,
                style: theme.textTheme.labelLarge?.copyWith(
                  fontWeight: FontWeight.w700,
                  color: selected ? AppColors.black : AppColors.onSurface,
                ),
              ),
              if (badgeCount != null && badgeCount! > 0) ...[
                const SizedBox(width: 6),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                  decoration: BoxDecoration(
                    color: selected
                        ? AppColors.black.withValues(alpha: 0.2)
                        : AppColors.brand,
                    borderRadius: BorderRadius.circular(999),
                  ),
                  child: Text(
                    '$badgeCount',
                    style: AppTypography.mono(
                      fontSize: 10,
                      fontWeight: FontWeight.w800,
                      color: selected ? AppColors.black : AppColors.black,
                    ),
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
