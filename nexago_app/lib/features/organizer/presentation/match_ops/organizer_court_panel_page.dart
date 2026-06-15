import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:nexago_app/core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';

import '../../domain/match_ops/match_ops_models.dart';
import '../../domain/match_ops/match_ops_providers.dart';
import 'organizer_match_navigation.dart';
import 'sheets/organizer_schedule_match_sheet.dart';
import 'widgets/organizer_match_card.dart';

/// G3 — Painel de quadras.
class OrganizerCourtPanelPage extends ConsumerWidget {
  const OrganizerCourtPanelPage({
    super.key,
    required this.tournamentId,
  });

  final String tournamentId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = ref.watch(organizerMatchOpsStateProvider(tournamentId));

    return Scaffold(
      appBar: AppBar(title: const Text('Painel de quadras')),
      body: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          OrganizerCourtKpiRow(kpis: state.courtKpis),
          const SizedBox(height: 20),
          for (final summary in state.courtSummaries)
            _CourtCard(
              summary: summary,
              tournamentId: tournamentId,
            ),
        ],
      ),
    );
  }
}

class _CourtCard extends StatelessWidget {
  const _CourtCard({
    required this.summary,
    required this.tournamentId,
  });

  final CourtSummary summary;
  final String tournamentId;

  @override
  Widget build(BuildContext context) {
    final court = summary.court;
    final current = summary.currentMatch;
    final next = summary.nextMatch;
    final isFree = summary.isFree;

    return Card(
      color: context.themeColors.surfaceCard,
      margin: const EdgeInsets.only(bottom: 12),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Text(
                  court.name,
                  style: Theme.of(context).textTheme.titleMedium?.copyWith(
                        fontWeight: FontWeight.bold,
                      ),
                ),
                const Spacer(),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                  decoration: BoxDecoration(
                    color: (isFree ? AppColors.win : AppColors.brand)
                        .withValues(alpha: 0.15),
                    borderRadius: BorderRadius.circular(6),
                  ),
                  child: Text(
                    isFree ? 'LIVRE' : 'AO VIVO',
                    style: TextStyle(
                      color: isFree ? AppColors.win : AppColors.brand,
                      fontSize: 11,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 8),
            if (current != null)
              Text(current.teamsLabel)
            else
              Text(
                'Aguardando próxima partida',
                style: TextStyle(color: context.themeColors.onSurfaceMuted),
              ),
            if (next != null) ...[
              const SizedBox(height: 6),
              Text(
                'Próxima: ${next.teamsLabel}',
                style: Theme.of(context).textTheme.bodySmall,
              ),
            ],
            const SizedBox(height: 12),
            Row(
              children: [
                if (current != null)
                  Expanded(
                    child: FilledButton(
                      onPressed: () => context.push(
                        organizerMatchLivePath(tournamentId, current.id),
                      ),
                      style: FilledButton.styleFrom(
                        backgroundColor: AppColors.brand,
                      ),
                      child: const Text('Mesa'),
                    ),
                  ),
                if (current != null && next != null) const SizedBox(width: 8),
                if (next != null)
                  Expanded(
                    child: OutlinedButton(
                      onPressed: () => context.push(
                        organizerMatchCheckInPath(tournamentId, next.id),
                      ),
                      child: const Text('Check-in'),
                    ),
                  ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
