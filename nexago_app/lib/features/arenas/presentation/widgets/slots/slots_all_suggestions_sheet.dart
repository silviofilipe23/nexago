import 'package:flutter/material.dart';

import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../domain/slots_suggestion_models.dart';
import 'slots_suggestion_tile.dart';

Future<void> showSlotsAllSuggestionsSheet({
  required BuildContext context,
  required List<SlotsSuggestion> suggestions,
  required void Function(SlotsSuggestion suggestion) onSuggestionAction,
}) {
  return showModalBottomSheet<void>(
    context: context,
    backgroundColor: context.themeColors.surfaceSheet,
    isScrollControlled: true,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
    ),
    builder: (ctx) {
      final theme = Theme.of(ctx);
      return DraggableScrollableSheet(
        expand: false,
        initialChildSize: 0.55,
        minChildSize: 0.35,
        maxChildSize: 0.9,
        builder: (context, scrollController) {
          return Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              SizedBox(height: 12),
              Center(
                child: Container(
                  width: 40,
                  height: 4,
                  decoration: BoxDecoration(
                    color: context.themeColors.onSurfaceMuted.withValues(
                      alpha: 0.35,
                    ),
                    borderRadius: BorderRadius.circular(2),
                  ),
                ),
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(20, 16, 20, 8),
                child: Text(
                  'Sugestões',
                  style: theme.textTheme.titleMedium?.copyWith(
                    fontWeight: FontWeight.w800,
                  ),
                ),
              ),
              Expanded(
                child: ListView(
                  controller: scrollController,
                  padding: const EdgeInsets.fromLTRB(16, 0, 16, 24),
                  children: [
                    for (final s in suggestions)
                      SlotsSuggestionTile(
                        suggestion: s,
                        onAction: () {
                          Navigator.of(ctx).pop();
                          onSuggestionAction(s);
                        },
                      ),
                  ],
                ),
              ),
            ],
          );
        },
      );
    },
  );
}
