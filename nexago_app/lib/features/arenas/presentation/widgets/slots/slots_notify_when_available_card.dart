import 'package:flutter/material.dart';

import '../../../../../core/theme/app_colors.dart';

class SlotsNotifyWhenAvailableCard extends StatelessWidget {
  const SlotsNotifyWhenAvailableCard({
    super.key,
    required this.courtName,
    required this.weekdayLabel,
    required this.isActive,
    required this.isLoading,
    required this.onToggle,
  });

  final String courtName;
  final String weekdayLabel;
  final bool isActive;
  final bool isLoading;
  final VoidCallback onToggle;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Container(
      margin: const EdgeInsets.fromLTRB(16, 8, 16, 16),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AppColors.surfaceCard,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppColors.surfaceRaised),
      ),
      child: Row(
        children: [
          Container(
            width: 44,
            height: 44,
            decoration: BoxDecoration(
              color: AppColors.brand.withValues(alpha: 0.18),
              borderRadius: BorderRadius.circular(12),
            ),
            child: const Icon(
              Icons.notifications_outlined,
              color: AppColors.brand,
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Avisar quando liberar',
                  style: theme.textTheme.titleSmall?.copyWith(
                    fontWeight: FontWeight.w800,
                    color: AppColors.onSurface,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  'Te notificamos se alguém cancelar $courtName no $weekdayLabel',
                  style: theme.textTheme.bodySmall?.copyWith(
                    color: AppColors.onSurfaceMuted,
                    height: 1.25,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(width: 8),
          if (isLoading)
            const SizedBox(
              width: 24,
              height: 24,
              child: CircularProgressIndicator(strokeWidth: 2),
            )
          else if (isActive)
            OutlinedButton(
              onPressed: onToggle,
              style: OutlinedButton.styleFrom(
                foregroundColor: AppColors.win,
                side: BorderSide(color: AppColors.win.withValues(alpha: 0.5)),
              ),
              child: const Text('Ativo'),
            )
          else
            OutlinedButton(
              onPressed: onToggle,
              style: OutlinedButton.styleFrom(
                foregroundColor: AppColors.brand,
                side: BorderSide(color: AppColors.brand.withValues(alpha: 0.6)),
              ),
              child: const Text('Ativar'),
            ),
        ],
      ),
    );
  }
}
