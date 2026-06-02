import 'package:flutter/material.dart';

import '../../../../../core/theme/app_colors.dart';
import '../../../domain/match_history/athlete_match_detail_models.dart';
import 'match_detail_section_header.dart';

class MatchDetailFormSection extends StatelessWidget {
  const MatchDetailFormSection({super.key, required this.rows});

  final List<MatchDetailFormRow> rows;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const MatchDetailSectionHeader(
          eyebrow: 'MOMENTO',
          title: 'Como chegaram',
        ),
        const SizedBox(height: 14),
        ...rows.map(
          (row) => Padding(
            padding: const EdgeInsets.only(bottom: 12),
            child: Row(
              children: [
                SizedBox(
                  width: 100,
                  child: Text(
                    row.label,
                    style: theme.textTheme.bodyMedium?.copyWith(
                      fontWeight: FontWeight.w800,
                      color: AppColors.onSurface,
                    ),
                  ),
                ),
                Expanded(
                  child: Wrap(
                    spacing: 6,
                    children: [
                      for (final won in row.results)
                        _FormChip(isWin: won),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }
}

class _FormChip extends StatelessWidget {
  const _FormChip({required this.isWin});

  final bool isWin;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final color = isWin ? AppColors.win : AppColors.live;

    return Container(
      width: 28,
      height: 28,
      alignment: Alignment.center,
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.15),
        shape: BoxShape.circle,
        border: Border.all(color: color.withValues(alpha: 0.5)),
      ),
      child: Text(
        isWin ? 'V' : 'D',
        style: theme.textTheme.labelSmall?.copyWith(
          fontWeight: FontWeight.w900,
          color: color,
          fontSize: 11,
        ),
      ),
    );
  }
}
