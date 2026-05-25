import 'package:flutter/material.dart';

import '../../../../../core/theme/app_colors.dart';
import '../../../domain/slots_suggestion_models.dart';

class SlotsSuggestionTile extends StatelessWidget {
  const SlotsSuggestionTile({
    super.key,
    required this.suggestion,
    required this.onAction,
  });

  final SlotsSuggestion suggestion;
  final VoidCallback onAction;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isPrimary =
        suggestion.actionStyle == SlotsSuggestionActionStyle.primaryFilled;

    return Container(
      margin: const EdgeInsets.only(bottom: 10),
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
              color: suggestion.iconBackground,
              borderRadius: BorderRadius.circular(12),
            ),
            child: Icon(
              suggestion.icon,
              color: isPrimary ? AppColors.white : AppColors.onSurface,
              size: 22,
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  suggestion.title,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: theme.textTheme.titleSmall?.copyWith(
                    fontWeight: FontWeight.w800,
                    color: AppColors.onSurface,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  suggestion.subtitle,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: theme.textTheme.bodySmall?.copyWith(
                    color: AppColors.onSurfaceMuted,
                    height: 1.25,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(width: 8),
          if (isPrimary)
            FilledButton(
              onPressed: onAction,
              style: FilledButton.styleFrom(
                minimumSize: const Size(72, 36),
                padding: const EdgeInsets.symmetric(horizontal: 14),
              ),
              child: Text(suggestion.actionLabel),
            )
          else
            OutlinedButton(
              onPressed: onAction,
              style: OutlinedButton.styleFrom(
                minimumSize: const Size(56, 36),
                padding: const EdgeInsets.symmetric(horizontal: 12),
                side: BorderSide(color: AppColors.surfaceRaised),
              ),
              child: Text(suggestion.actionLabel),
            ),
        ],
      ),
    );
  }
}
