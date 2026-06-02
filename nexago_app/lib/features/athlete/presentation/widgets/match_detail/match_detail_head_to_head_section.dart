import 'package:flutter/material.dart';

import '../../../../../core/theme/app_colors.dart';
import '../../../domain/match_history/athlete_match_detail_models.dart';
import 'match_detail_section_header.dart';

class MatchDetailHeadToHeadSection extends StatelessWidget {
  const MatchDetailHeadToHeadSection({super.key, required this.info});

  final MatchDetailHeadToHeadInfo info;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final total = info.totalMatches;
    final winRatio = total > 0 ? info.ourWins / total : 0.0;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        MatchDetailSectionHeader(
          eyebrow: 'HISTÓRICO',
          title: info.title,
        ),
        const SizedBox(height: 14),
        Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: AppColors.surfaceCard,
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: AppColors.surfaceRaised),
          ),
          child: Column(
            children: [
              Row(
                children: [
                  Expanded(
                    child: _StatColumn(
                      value: '${info.ourWins}',
                      label: 'SUAS VITÓRIAS',
                      color: AppColors.win,
                      theme: theme,
                    ),
                  ),
                  Expanded(
                    flex: 2,
                    child: Column(
                      children: [
                        ClipRRect(
                          borderRadius: BorderRadius.circular(4),
                          child: SizedBox(
                            height: 8,
                            child: Row(
                              children: [
                                if (winRatio > 0)
                                  Expanded(
                                    flex: (winRatio * 100).round().clamp(1, 100),
                                    child: const ColoredBox(color: AppColors.win),
                                  ),
                                if (winRatio < 1)
                                  Expanded(
                                    flex: ((1 - winRatio) * 100).round().clamp(1, 100),
                                    child: const ColoredBox(color: AppColors.live),
                                  ),
                              ],
                            ),
                          ),
                        ),
                        const SizedBox(height: 6),
                        Text(
                          '$total CONFRONTOS',
                          style: theme.textTheme.labelSmall?.copyWith(
                            fontWeight: FontWeight.w800,
                            color: AppColors.onSurfaceMuted,
                            letterSpacing: 0.4,
                            fontSize: 9,
                          ),
                        ),
                      ],
                    ),
                  ),
                  Expanded(
                    child: _StatColumn(
                      value: '${info.ourLosses}',
                      label: 'DERROTAS',
                      color: AppColors.live,
                      theme: theme,
                      alignEnd: true,
                    ),
                  ),
                ],
              ),
              if (info.pastMatches.isNotEmpty) ...[
                const SizedBox(height: 16),
                ...info.pastMatches.map(
                  (m) => Padding(
                    padding: const EdgeInsets.only(bottom: 8),
                    child: _PastMatchRow(match: m, theme: theme),
                  ),
                ),
              ],
            ],
          ),
        ),
      ],
    );
  }
}

class _StatColumn extends StatelessWidget {
  const _StatColumn({
    required this.value,
    required this.label,
    required this.color,
    required this.theme,
    this.alignEnd = false,
  });

  final String value;
  final String label;
  final Color color;
  final ThemeData theme;
  final bool alignEnd;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment:
          alignEnd ? CrossAxisAlignment.end : CrossAxisAlignment.start,
      children: [
        Text(
          value,
          style: theme.textTheme.headlineMedium?.copyWith(
            fontWeight: FontWeight.w900,
            color: color,
            height: 1,
          ),
        ),
        const SizedBox(height: 4),
        Text(
          label,
          style: theme.textTheme.labelSmall?.copyWith(
            fontWeight: FontWeight.w800,
            color: AppColors.onSurfaceMuted,
            fontSize: 8,
            letterSpacing: 0.3,
          ),
        ),
      ],
    );
  }
}

class _PastMatchRow extends StatelessWidget {
  const _PastMatchRow({required this.match, required this.theme});

  final MatchDetailHeadToHeadPastMatch match;
  final ThemeData theme;

  @override
  Widget build(BuildContext context) {
    final accent = match.isWin ? AppColors.win : AppColors.live;
    final letter = match.isWin ? 'V' : 'D';

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: AppColors.surfaceRaised.withValues(alpha: 0.5),
        borderRadius: BorderRadius.circular(10),
      ),
      child: Row(
        children: [
          Container(
            width: 28,
            height: 28,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              color: accent,
              borderRadius: BorderRadius.circular(6),
            ),
            child: Text(
              letter,
              style: theme.textTheme.labelMedium?.copyWith(
                fontWeight: FontWeight.w900,
                color: AppColors.black,
              ),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Text(
              match.label,
              style: theme.textTheme.bodySmall?.copyWith(
                fontWeight: FontWeight.w700,
                color: AppColors.onSurface,
              ),
            ),
          ),
          Text(
            match.score,
            style: theme.textTheme.labelLarge?.copyWith(
              fontWeight: FontWeight.w800,
              color: AppColors.onSurface,
            ),
          ),
        ],
      ),
    );
  }
}
