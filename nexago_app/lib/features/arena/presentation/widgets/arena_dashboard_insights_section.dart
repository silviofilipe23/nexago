import 'package:flutter/material.dart';

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

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'Insights',
          style: theme.textTheme.titleMedium?.copyWith(
            fontWeight: FontWeight.w800,
            letterSpacing: -0.3,
          ),
        ),
        const SizedBox(height: 16),
        ...lines.map(
          (line) => Padding(
            padding: const EdgeInsets.only(bottom: 10),
            child: DecoratedBox(
              decoration: BoxDecoration(
                color: theme.colorScheme.surfaceContainerHighest
                    .withValues(alpha: 0.45),
                borderRadius: BorderRadius.circular(16),
                border: Border.all(
                  color: theme.colorScheme.outline.withValues(alpha: 0.08),
                ),
              ),
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 16),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Icon(
                      Icons.auto_awesome_rounded,
                      size: 22,
                      color: theme.colorScheme.primary.withValues(alpha: 0.85),
                    ),
                    const SizedBox(width: 14),
                    Expanded(
                      child: Text(
                        line,
                        style: theme.textTheme.bodyLarge?.copyWith(
                          height: 1.4,
                          fontWeight: FontWeight.w500,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ],
    );
  }
}
