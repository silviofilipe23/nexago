import 'package:flutter/material.dart';

import '../../../domain/match_history/athlete_match_detail_models.dart';
import 'match_detail_info_section.dart';
import 'match_detail_section_header.dart';

class MatchDetailWhereWhenSection extends StatelessWidget {
  const MatchDetailWhereWhenSection({
    super.key,
    required this.detail,
  });

  final AthleteMatchDetail detail;

  @override
  Widget build(BuildContext context) {
    final rows = <MatchDetailInfoRow>[
      MatchDetailInfoRow(
        icon: Icons.emoji_events_outlined,
        label: 'TORNEIO',
        value: detail.tournamentName,
      ),
      MatchDetailInfoRow(
        icon: Icons.calendar_today_outlined,
        label: 'DATA',
        value: detail.dateTimeLabel,
      ),
      MatchDetailInfoRow(
        icon: Icons.location_on_outlined,
        label: 'LOCAL',
        value: detail.venueLabel.isNotEmpty ? detail.venueLabel : '—',
      ),
      MatchDetailInfoRow(
        icon: Icons.sports_volleyball_outlined,
        label: 'CATEGORIA',
        value: detail.categoryLabel.isNotEmpty ? detail.categoryLabel : '—',
      ),
    ];

    if (detail.durationLabel != '—' &&
        detail.phase == MatchDetailPhase.completed) {
      rows.add(
        MatchDetailInfoRow(
          icon: Icons.timer_outlined,
          label: 'DURAÇÃO',
          value: detail.durationLabel,
        ),
      );
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const MatchDetailSectionHeader(
          eyebrow: 'ONDE & QUANDO',
          title: 'Detalhes',
        ),
        const SizedBox(height: 14),
        MatchDetailInfoSection(rows: rows),
      ],
    );
  }
}
