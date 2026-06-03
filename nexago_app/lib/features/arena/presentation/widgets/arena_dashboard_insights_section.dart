import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../../../../core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../data/arena_dashboard_insights.dart';
import '../../domain/arena_dashboard_summary.dart';

class ArenaDashboardInsightsSection extends StatelessWidget {
  const ArenaDashboardInsightsSection({
    super.key,
    required this.summary,
  });

  final ArenaDashboardSummary summary;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final lines = ArenaDashboardInsights.lines(summary);
    if (lines.isEmpty) {
      return const SizedBox.shrink();
    }

    final updatedAt = DateFormat.Hm('pt_BR').format(DateTime.now());

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          crossAxisAlignment: CrossAxisAlignment.end,
          children: [
            Text(
              'Insights',
              style: theme.textTheme.titleMedium?.copyWith(
                fontWeight: FontWeight.w800,
                letterSpacing: -0.3,
                color: context.themeColors.onSurface,
              ),
            ),
            Spacer(),
            Text(
              'IA • ATUALIZADO $updatedAt',
              style: theme.textTheme.labelSmall?.copyWith(
                color: context.themeColors.onSurfaceMuted,
                fontWeight: FontWeight.w700,
                letterSpacing: 0.4,
              ),
            ),
          ],
        ),
        SizedBox(height: 14),
        SizedBox(
          height: 132,
          child: ListView.separated(
            scrollDirection: Axis.horizontal,
            itemCount: lines.length,
            separatorBuilder: (_, __) => SizedBox(width: 12),
            itemBuilder: (context, index) {
              return _InsightCard(line: lines[index]);
            },
          ),
        ),
      ],
    );
  }
}

class _InsightCard extends StatelessWidget {
  const _InsightCard({required this.line});

  final ArenaDashboardInsightLine line;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final (bg, accent, icon) = switch (line.tone) {
      ArenaDashboardInsightTone.warning => (
          const Color(0xFF2A1F12),
          AppColors.pending,
          Icons.warning_amber_rounded,
        ),
      ArenaDashboardInsightTone.success => (
          const Color(0xFF122A1C),
          AppColors.win,
          Icons.check_circle_outline_rounded,
        ),
      ArenaDashboardInsightTone.highlight => (
          context.themeColors.surfaceRaised,
          AppColors.brand,
          Icons.emoji_events_outlined,
        ),
    };

    return Container(
      width: 280,
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: accent.withValues(alpha: 0.25)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, color: accent, size: 22),
          SizedBox(width: 12),
          Expanded(
            child: Text(
              line.message,
              style: theme.textTheme.bodyMedium?.copyWith(
                height: 1.4,
                fontWeight: FontWeight.w500,
                color: context.themeColors.onSurface,
              ),
            ),
          ),
        ],
      ),
    );
  }
}
