import 'package:flutter/material.dart';

import '../../../../../core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../domain/match_history/athlete_match_detail_models.dart';
import 'match_detail_section_header.dart';

class MatchDetailFormSection extends StatelessWidget {
  const MatchDetailFormSection({super.key, required this.rows});

  final List<MatchDetailFormRow> rows;

  @override
  Widget build(BuildContext context) {
    if (rows.isEmpty) return const SizedBox.shrink();

    final theme = Theme.of(context);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const MatchDetailSectionHeader(
          eyebrow: 'MOMENTO',
          title: 'Como chegaram',
        ),
        SizedBox(height: 14),
        Container(
          width: double.infinity,
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
          decoration: BoxDecoration(
            color: context.themeColors.surfaceCard,
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: context.themeColors.surfaceRaised),
          ),
          child: Column(
            children: [
              for (var i = 0; i < rows.length; i++) ...[
                if (i > 0)
                  Divider(
                    height: 1,
                    color: context.themeColors.surfaceRaised,
                  ),
                _FormRow(
                  row: rows[i],
                  theme: theme,
                  emphasizeLabel: i == 0,
                ),
              ],
            ],
          ),
        ),
      ],
    );
  }
}

class _FormRow extends StatelessWidget {
  const _FormRow({
    required this.row,
    required this.theme,
    required this.emphasizeLabel,
  });

  final MatchDetailFormRow row;
  final ThemeData theme;
  final bool emphasizeLabel;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 14),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          SizedBox(
            width: 96,
            child: Text(
              row.label,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: theme.textTheme.labelSmall?.copyWith(
                fontWeight: FontWeight.w800,
                color: emphasizeLabel
                    ? AppColors.brand
                    : context.themeColors.onSurfaceMuted,
                letterSpacing: 0.3,
                fontSize: 10,
                height: 1.3,
              ),
            ),
          ),
          SizedBox(width: 12),
          Expanded(
            child: Wrap(
              spacing: 6,
              runSpacing: 6,
              children: [
                for (final won in row.results) _FormChip(isWin: won, theme: theme),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _FormChip extends StatelessWidget {
  const _FormChip({required this.isWin, required this.theme});

  final bool isWin;
  final ThemeData theme;

  @override
  Widget build(BuildContext context) {
    final color = isWin ? AppColors.win : AppColors.live;

    return Container(
      width: 28,
      height: 28,
      alignment: Alignment.center,
      decoration: BoxDecoration(
        color: color,
        borderRadius: BorderRadius.circular(6),
      ),
      child: Text(
        isWin ? 'V' : 'D',
        style: theme.textTheme.labelMedium?.copyWith(
          fontWeight: FontWeight.w900,
          color: AppColors.black,
          fontSize: 11,
        ),
      ),
    );
  }
}
