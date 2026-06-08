import 'package:flutter/material.dart';

import '../../../../../core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../domain/agenda/athlete_agenda_logic.dart';
import '../../../domain/agenda/athlete_agenda_models.dart';

class AgendaSummaryCard extends StatelessWidget {
  const AgendaSummaryCard({
    super.key,
    required this.summary,
    this.onExportIcs,
  });

  final AthleteAgendaDaySummary summary;
  final VoidCallback? onExportIcs;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 12, 20, 8),
      child: Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: context.themeColors.surfaceCard,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(
            color: AppColors.brand.withValues(alpha: 0.55),
            width: 1.5,
          ),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    summary.headline,
                    style: theme.textTheme.titleSmall?.copyWith(
                      fontWeight: FontWeight.w800,
                      color: context.themeColors.onSurface,
                    ),
                  ),
                ),
                if (onExportIcs != null)
                  TextButton.icon(
                    onPressed: onExportIcs,
                    icon: const Icon(Icons.ios_share_rounded, size: 16),
                    label: const Text('ICS'),
                    style: TextButton.styleFrom(
                      foregroundColor: AppColors.brand,
                      padding: const EdgeInsets.symmetric(
                        horizontal: 10,
                        vertical: 6,
                      ),
                      textStyle: theme.textTheme.labelMedium?.copyWith(
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ),
              ],
            ),
            if (summary.totalToday > 0) ...[
              SizedBox(height: 12),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  if (summary.tournamentsToday > 0)
                    _SummaryPill(
                      label: '${summary.tournamentsToday} torneio',
                      color: athleteAgendaTournamentAccent,
                    ),
                  if (summary.challengesToday > 0)
                    _SummaryPill(
                      label: '${summary.challengesToday} desafio',
                      color: athleteAgendaChallengeAccent,
                    ),
                  if (summary.rentalsToday > 0)
                    _SummaryPill(
                      label: '${summary.rentalsToday} aluguel',
                      color: athleteAgendaRentalAccent,
                    ),
                ],
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _SummaryPill extends StatelessWidget {
  const _SummaryPill({required this.label, required this.color});

  final String label;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.14),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: color.withValues(alpha: 0.35)),
      ),
      child: Text(
        label,
        style: Theme.of(context).textTheme.labelSmall?.copyWith(
              color: color,
              fontWeight: FontWeight.w700,
            ),
      ),
    );
  }
}
