import 'package:flutter/material.dart';
import 'package:nexago_app/core/layout/nexa_app_bar.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:nexago_app/core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';

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
    final theme = Theme.of(context);

    return Scaffold(
      backgroundColor: context.themeColors.canvas,
      appBar: NexaAppBar(
        forceMaterial: true,
        backgroundColor: context.themeColors.canvas,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        scrolledUnderElevation: 0,
        centerTitle: false,
        titleSpacing: 8,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back_rounded),
          onPressed: () => context.pop(),
        ),
        title: Text(
          'Insights',
          style: theme.textTheme.titleLarge?.copyWith(
            fontWeight: FontWeight.w800,
            color: context.themeColors.onSurface,
            letterSpacing: -0.3,
            height: 1.1,
          ),
        ),
      ),
      body: ListView(
        clipBehavior: Clip.hardEdge,
        padding: const EdgeInsets.fromLTRB(20, 16, 20, 24),
        children: [
          IntrinsicHeight(
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Expanded(
                  child: _InsightTile(
                    label: 'Atraso médio',
                    value: '${insights.averageDelayMin.toStringAsFixed(0)} min',
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: _InsightTile(
                    label: 'Atrasadas',
                    value: '${insights.delayedMatches}',
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: _InsightTile(
                    label: 'No horário',
                    value: '${insights.onTimeMatches}',
                  ),
                ),
              ],
            ),
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
          Text(
            'Ritmo por quadra',
            style: theme.textTheme.titleSmall?.copyWith(
              fontWeight: FontWeight.w800,
              color: context.themeColors.onSurface,
            ),
          ),
          const SizedBox(height: 4),
          for (final e in insights.courtPace.entries)
            ListTile(
              contentPadding: EdgeInsets.zero,
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
    final theme = Theme.of(context);

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 12),
      decoration: BoxDecoration(
        color: context.themeColors.surfaceCard,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(
          color: context.themeColors.onSurfaceMuted.withValues(alpha: 0.12),
        ),
      ),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          FittedBox(
            fit: BoxFit.scaleDown,
            child: Text(
              value,
              style: theme.textTheme.titleLarge?.copyWith(
                color: AppColors.brand,
                fontWeight: FontWeight.w800,
                height: 1.05,
              ),
            ),
          ),
          const SizedBox(height: 6),
          Text(
            label,
            textAlign: TextAlign.center,
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
            style: theme.textTheme.bodySmall?.copyWith(
              color: context.themeColors.onSurfaceMuted,
              fontWeight: FontWeight.w600,
              height: 1.2,
            ),
          ),
        ],
      ),
    );
  }
}
