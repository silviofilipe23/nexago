import 'package:flutter/material.dart';

import '../../../../../core/theme/app_colors.dart';
import '../../../domain/match_history/athlete_match_detail_models.dart';
import 'match_detail_section_header.dart';
import 'match_detail_sparkline.dart';

class MatchDetailMomentumSection extends StatelessWidget {
  const MatchDetailMomentumSection({
    super.key,
    required this.momentum,
    this.isLive = false,
  });

  final MatchDetailMomentumInfo momentum;
  final bool isLive;

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
        const SizedBox(height: 14),
        Container(
          padding: const EdgeInsets.fromLTRB(12, 16, 12, 12),
          decoration: BoxDecoration(
            color: AppColors.surfaceCard,
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: AppColors.surfaceRaised),
          ),
          child: Column(
            children: [
              MatchDetailSparkline(
                points: momentum.points,
                lineColor: lineColor,
              ),
              if (momentum.narrative.isNotEmpty) ...[
                const SizedBox(height: 12),
                _MomentumNarrative(text: momentum.narrative, theme: theme),
              ],
            ],
          ),
        ),
      ],
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
        style: theme.textTheme.bodySmall?.copyWith(
          color: AppColors.onSurfaceMuted,
          height: 1.45,
          fontWeight: FontWeight.w600,
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
      final fivePts = RegExp(r'5 pontos seguidos').firstMatch(remaining);
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
