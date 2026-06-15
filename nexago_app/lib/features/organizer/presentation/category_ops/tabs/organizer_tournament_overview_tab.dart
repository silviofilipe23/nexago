import 'package:flutter/material.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';

import '../../../domain/tournament_ops/tournament_ops_models.dart';

class OrganizerTournamentOverviewTab extends StatelessWidget {
  const OrganizerTournamentOverviewTab({
    super.key,
    required this.summary,
    required this.tournament,
  });

  final OrganizerTournamentSummary summary;
  final Map<String, dynamic> tournament;

  @override
  Widget build(BuildContext context) {
    final format = summary.bracketSystem.isNotEmpty
        ? summary.bracketSystem
        : (tournament['format'] as String?) ?? 'Dupla';
    return ListView(
      padding: const EdgeInsets.all(20),
      children: [
        _InfoCard(
          title: 'Formato',
          value: format,
        ),
        const SizedBox(height: 12),
        _InfoCard(
          title: 'Quadras',
          value: '${summary.courtsCount}',
        ),
        const SizedBox(height: 12),
        _InfoCard(
          title: 'Inscrições',
          value: summary.listingStatus == 'open'
              ? 'Abertas'
              : 'Encerradas',
        ),
      ],
    );
  }
}

class _InfoCard extends StatelessWidget {
  const _InfoCard({required this.title, required this.value});

  final String title;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: context.themeColors.surfaceCard,
        borderRadius: BorderRadius.circular(14),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            title,
            style: Theme.of(context).textTheme.labelSmall?.copyWith(
                  color: context.themeColors.onSurfaceMuted,
                ),
          ),
          const SizedBox(height: 4),
          Text(
            value,
            style: Theme.of(context).textTheme.titleMedium?.copyWith(
                  fontWeight: FontWeight.w700,
                ),
          ),
        ],
      ),
    );
  }
}
