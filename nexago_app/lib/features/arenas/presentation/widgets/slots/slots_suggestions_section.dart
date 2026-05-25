import 'package:flutter/material.dart';

import '../../../../../core/theme/app_colors.dart';
import '../../../domain/slots_suggestion_models.dart';
import 'slots_suggestion_tile.dart';

class SlotsSuggestionsSection extends StatelessWidget {
  const SlotsSuggestionsSection({
    super.key,
    required this.suggestions,
    required this.onSuggestionAction,
    required this.onSeeAll,
    this.loading = false,
    this.maxPreview = 3,
  });

  final List<SlotsSuggestion> suggestions;
  final void Function(SlotsSuggestion suggestion) onSuggestionAction;
  final VoidCallback onSeeAll;
  final bool loading;
  final int maxPreview;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    if (loading) {
      return const Padding(
        padding: EdgeInsets.symmetric(vertical: 24),
        child: Center(
          child: CircularProgressIndicator(
            color: AppColors.brand,
            strokeWidth: 2,
          ),
        ),
      );
    }

    if (suggestions.isEmpty) return const SizedBox.shrink();

    final preview = suggestions.length <= maxPreview
        ? suggestions
        : suggestions.sublist(0, maxPreview);

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  'SUGESTÕES INTELIGENTES',
                  style: theme.textTheme.labelSmall?.copyWith(
                    fontWeight: FontWeight.w800,
                    letterSpacing: 0.8,
                    color: AppColors.onSurfaceMuted,
                  ),
                ),
              ),
              if (suggestions.length > maxPreview)
                TextButton(
                  onPressed: onSeeAll,
                  style: TextButton.styleFrom(
                    foregroundColor: AppColors.brand,
                    padding: EdgeInsets.zero,
                    minimumSize: Size.zero,
                    tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                  ),
                  child: const Text(
                    'ver todas',
                    style: TextStyle(fontWeight: FontWeight.w700),
                  ),
                ),
            ],
          ),
          const SizedBox(height: 10),
          for (final s in preview)
            SlotsSuggestionTile(
              suggestion: s,
              onAction: () => onSuggestionAction(s),
            ),
        ],
      ),
    );
  }
}
