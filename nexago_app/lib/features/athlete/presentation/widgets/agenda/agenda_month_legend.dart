import 'package:flutter/material.dart';

import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../domain/agenda/athlete_agenda_logic.dart';

class AgendaMonthLegend extends StatelessWidget {
  const AgendaMonthLegend({super.key});

  static const _labels = [
    ('ALUGUEL', athleteAgendaRentalAccent),
    ('TORNEIO', athleteAgendaTournamentAccent),
    ('DESAFIO', athleteAgendaChallengeAccent),
  ];

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 12, 20, 4),
      child: Wrap(
        spacing: 14,
        runSpacing: 8,
        children: [
          for (final entry in _labels)
            Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Container(
                  width: 6,
                  height: 6,
                  decoration: BoxDecoration(
                    color: entry.$2,
                    shape: BoxShape.circle,
                  ),
                ),
                const SizedBox(width: 6),
                Text(
                  entry.$1,
                  style: Theme.of(context).textTheme.labelSmall?.copyWith(
                        color: context.themeColors.onSurfaceMuted,
                        fontWeight: FontWeight.w700,
                        letterSpacing: 0.4,
                        fontSize: 10,
                      ),
                ),
              ],
            ),
        ],
      ),
    );
  }
}
