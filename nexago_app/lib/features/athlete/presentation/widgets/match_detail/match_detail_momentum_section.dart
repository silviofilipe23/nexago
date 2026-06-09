import 'package:flutter/material.dart';
import 'package:nexago_app/core/theme/app_typography.dart';

import '../../../../../core/theme/app_colors.dart';
import '../../../domain/match_history/athlete_match_detail_models.dart';
import 'match_detail_momentum_chart.dart';
import 'match_detail_section_header.dart';

class MatchDetailMomentumSection extends StatelessWidget {
  const MatchDetailMomentumSection({
    super.key,
    required this.momentum,
    this.isLive = false,
    this.onViewPlayByPlay,
  });

  final MatchDetailMomentumInfo momentum;
  final bool isLive;
  final VoidCallback? onViewPlayByPlay;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final lineColor = isLive ? AppColors.brand : AppColors.win;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        MatchDetailSectionHeader(
          eyebrow: momentum.eyebrow,
          title: momentum.title,
        ),
        SizedBox(height: 14),
        Container(
          padding: const EdgeInsets.fromLTRB(12, 16, 12, 12),
          decoration: BoxDecoration(
            color: AppColors.surfaceCard,
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: AppColors.surfaceRaised),
          ),
          child: Column(
            children: [
              if (momentum.summaryLabel != null &&
                  momentum.summaryLabel!.isNotEmpty) ...[
                _SummaryPill(label: momentum.summaryLabel!, color: lineColor),
                SizedBox(height: 12),
              ],
              MatchDetailMomentumChart(
                chartPoints: momentum.chartPoints,
                ourTeamLabel: momentum.ourTeamLabel,
                opponentTeamLabel: momentum.opponentTeamLabel,
              ),
              if (momentum.chartHint != null &&
                  momentum.chartHint!.isNotEmpty) ...[
                SizedBox(height: 10),
                Text(
                  momentum.chartHint!,
                  textAlign: TextAlign.center,
                  style: AppTypography.soraRegular(
                    color: AppColors.onSurfaceMuted,
                    fontSize: 10,
                    fontWeight: FontWeight.w400,
                    height: 1.35,
                  ),
                ),
              ],
              if (momentum.narrative.isNotEmpty) ...[
                SizedBox(height: 12),
                _MomentumNarrative(text: momentum.narrative, theme: theme),
              ],
              if (onViewPlayByPlay != null) ...[
                SizedBox(height: 8),
                Align(
                  alignment: Alignment.centerRight,
                  child: TextButton(
                    onPressed: onViewPlayByPlay,
                    child: Text(
                      'Ver ponto a ponto →',
                      style: AppTypography.soraRegular(
                        fontWeight: FontWeight.w800,
                        color: AppColors.brand,
                      ),
                    ),
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

class _SummaryPill extends StatelessWidget {
  const _SummaryPill({required this.label, required this.color});

  final String label;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Align(
      alignment: Alignment.centerLeft,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
        decoration: BoxDecoration(
          color: color.withValues(alpha: 0.12),
          borderRadius: BorderRadius.circular(999),
          border: Border.all(color: color.withValues(alpha: 0.35)),
        ),
        child: Text(
          label,
          style: AppTypography.mono(
            color: color,
            fontWeight: FontWeight.w800,
            letterSpacing: 0.2,
            fontSize: 11,
          ),
        ),
      ),
    );
  }
}

class _MomentumNarrative extends StatelessWidget {
  const _MomentumNarrative({required this.text, required this.theme});

  final String text;
  final ThemeData theme;

  @override
  Widget build(BuildContext context) {
    return Text.rich(
      TextSpan(
        style: AppTypography.soraRegular(
          color: AppColors.onSurfaceMuted,
          fontWeight: FontWeight.w400,
          fontSize: 13,
        ),
        children: _buildSpans(text),
      ),
    );
  }

  List<TextSpan> _buildSpans(String text) {
    final spans = <TextSpan>[];
    var remaining = text;

    while (remaining.isNotEmpty) {
      final zeroTwo = RegExp(r'0-2').firstMatch(remaining);
      final fivePts = RegExp(r'\d+ pontos seguidos').firstMatch(remaining);
      final score = RegExp(r'\d+-\d+').firstMatch(remaining);

      Match? earliest;
      _SpanKind? kind;

      for (final entry in [
        (zeroTwo, _SpanKind.loss),
        (fivePts, _SpanKind.win),
        (score, _SpanKind.bold),
      ]) {
        final m = entry.$1;
        if (m == null) continue;
        if (earliest == null || m.start < earliest.start) {
          earliest = m;
          kind = entry.$2;
        }
      }

      if (earliest == null || kind == null) {
        spans.add(TextSpan(text: remaining));
        break;
      }

      if (earliest.start > 0) {
        spans.add(TextSpan(text: remaining.substring(0, earliest.start)));
      }

      final matched = earliest.group(0)!;
      spans.add(
        TextSpan(
          text: matched,
          style: TextStyle(
            fontWeight: FontWeight.w800,
            color: switch (kind) {
              _SpanKind.loss => AppColors.live,
              _SpanKind.win => AppColors.win,
              _SpanKind.bold => AppColors.onSurface,
            },
          ),
        ),
      );
      remaining = remaining.substring(earliest.end);
    }

    return spans;
  }
}

enum _SpanKind { loss, win, bold }
