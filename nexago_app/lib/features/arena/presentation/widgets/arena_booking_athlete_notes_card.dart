import 'package:flutter/material.dart';

import 'package:nexago_app/core/theme/app_theme_colors.dart';
import 'arena_dashboard_tokens.dart';

/// Recado que o atleta deixou para a arena ao reservar (`athleteNotes`).
/// Só aparece quando há recado; o texto é selecionável para copiar.
class ArenaBookingAthleteNotesCard extends StatelessWidget {
  const ArenaBookingAthleteNotesCard({super.key, required this.notes});

  final String notes;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return DecoratedBox(
      key: const Key('arena-booking-athlete-notes'),
      decoration: ArenaDashboardTokens.cardDecoration(context),
      child: Padding(
        padding: const EdgeInsets.all(18),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(
                  Icons.chat_bubble_outline_rounded,
                  size: 18,
                  color: context.themeColors.onSurfaceMuted,
                ),
                const SizedBox(width: 8),
                Text(
                  'Recado do atleta',
                  style: theme.textTheme.titleSmall?.copyWith(
                    fontWeight: FontWeight.w800,
                    color: context.themeColors.onSurface,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 10),
            SelectableText(
              notes,
              style: theme.textTheme.bodyMedium?.copyWith(
                color: context.themeColors.onSurface,
                height: 1.4,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
