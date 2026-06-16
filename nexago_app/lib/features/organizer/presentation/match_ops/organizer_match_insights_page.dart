import 'package:flutter/material.dart';
import 'package:nexago_app/core/layout/nexa_app_bar.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:nexago_app/core/theme/app_colors.dart';

import '../../domain/match_ops/match_ops_providers.dart';

/// J3 — Insights de atraso.
class OrganizerMatchInsightsPage extends ConsumerWidget {
  const OrganizerMatchInsightsPage({
    super.key,
    required this.tournamentId,
  });

  final String tournamentId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = ref.watch(organizerMatchOpsStateProvider(tournamentId));
    final insights = state.insights;

    return Scaffold(
      appBar: NexaAppBar(title: const Text('Insights')),
      body: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          Row(
            children: [
              Expanded(
                child: _InsightTile(
                  label: 'Atraso médio',
                  value: '${insights.averageDelayMin.toStringAsFixed(0)} min',
                ),
              ),
              Expanded(
                child: _InsightTile(
                  label: 'Atrasadas',
                  value: '${insights.delayedMatches}',
                ),
              ),
              Expanded(
                child: _InsightTile(
                  label: 'No horário',
                  value: '${insights.onTimeMatches}',
                ),
              ),
            ],
          ),
          if (insights.suggestion.isNotEmpty) ...[
            const SizedBox(height: 20),
            Card(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Text(insights.suggestion),
              ),
            ),
          ],
          const SizedBox(height: 20),
          const Text('Ritmo por quadra',
              style: TextStyle(fontWeight: FontWeight.bold)),
          for (final e in insights.courtPace.entries)
            ListTile(
              title: Text(e.key),
              trailing: Text('${e.value.toStringAsFixed(0)} min'),
            ),
        ],
      ),
    );
  }
}

class _InsightTile extends StatelessWidget {
  const _InsightTile({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Text(
          value,
          style: Theme.of(context).textTheme.titleLarge?.copyWith(
                color: AppColors.brand,
                fontWeight: FontWeight.bold,
              ),
        ),
        Text(label, textAlign: TextAlign.center),
      ],
    );
  }
}
