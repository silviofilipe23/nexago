import 'dart:ui';

import 'package:flutter/material.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import 'package:nexago_app/core/theme/app_typography.dart';

import '../../../../../core/theme/app_colors.dart';
import '../../../domain/match_history/athlete_match_detail_models.dart';

/// Histórico de confrontos **dupla × dupla** (mesmo `teamId`).
class MatchDetailHeadToHeadSection extends StatelessWidget {
  const MatchDetailHeadToHeadSection({super.key, required this.info});

  final MatchDetailHeadToHeadInfo info;

  static const _radius = 14.0;

  @override
  Widget build(BuildContext context) {
    final total = info.totalMatches;

    return Semantics(
      label: '${info.title}. $total confrontos',
      child: ClipRRect(
        borderRadius: BorderRadius.circular(_radius),
        child: BackdropFilter(
          filter: ImageFilter.blur(sigmaX: 16, sigmaY: 16),
          child: Container(
            width: double.infinity,
            padding: const EdgeInsets.fromLTRB(14, 14, 14, 12),
            decoration: BoxDecoration(
              color: Colors.white.withValues(alpha: 0.06),
              borderRadius: BorderRadius.circular(_radius),
              border: Border.all(color: Colors.white.withValues(alpha: 0.12)),
            ),
            child: Column(
              children: [
                Text(
                  info.title.toUpperCase(),
                  textAlign: TextAlign.center,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: AppTypography.soraRegular(
                    fontSize: 13,
                    fontWeight: FontWeight.w800,
                    color: Colors.white,
                    letterSpacing: 0.5,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  '$total ${total == 1 ? 'CONFRONTO' : 'CONFRONTOS'}',
                  textAlign: TextAlign.center,
                  style: AppTypography.eyebrow.copyWith(
                    color: Colors.white.withValues(alpha: 0.55),
                    fontSize: 10,
                    letterSpacing: 0.8,
                  ),
                ),
                const SizedBox(height: 14),
                Row(
                  children: [
                    Expanded(
                      child: _StatColumn(
                        value: '${info.ourWins}',
                        label: info.ourWins == 1 ? 'VITÓRIA' : 'VITÓRIAS',
                        color: AppColors.win,
                      ),
                    ),
                    Container(
                      width: 1,
                      height: 36,
                      color: Colors.white.withValues(alpha: 0.14),
                    ),
                    Expanded(
                      child: _StatColumn(
                        value: '${info.ourLosses}',
                        label: info.ourLosses == 1 ? 'DERROTA' : 'DERROTAS',
                        color: AppColors.live,
                      ),
                    ),
                  ],
                ),
                if (info.pastMatches.isNotEmpty) ...[
                  Padding(
                    padding: const EdgeInsets.symmetric(vertical: 12),
                    child: Divider(
                      height: 1,
                      thickness: 1,
                      color: Colors.white.withValues(alpha: 0.12),
                    ),
                  ),
                  for (var i = 0; i < info.pastMatches.length; i++) ...[
                    if (i > 0) const SizedBox(height: 10),
                    _PastMatchRow(match: info.pastMatches[i]),
                  ],
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _StatColumn extends StatelessWidget {
  const _StatColumn({
    required this.value,
    required this.label,
    required this.color,
  });

  final String value;
  final String label;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Text(
          value,
          style: AppTypography.monoStat.copyWith(
            color: color,
            fontSize: 28,
            fontWeight: FontWeight.w800,
            height: 1,
          ),
        ),
        const SizedBox(height: 4),
        Text(
          label,
          style: AppTypography.eyebrow.copyWith(
            color: Colors.white.withValues(alpha: 0.85),
            fontSize: 10,
            letterSpacing: 0.8,
          ),
        ),
      ],
    );
  }
}

class _PastMatchRow extends StatelessWidget {
  const _PastMatchRow({required this.match});

  final MatchDetailHeadToHeadPastMatch match;

  @override
  Widget build(BuildContext context) {
    final accent = match.isWin ? AppColors.win : AppColors.live;
    final letter = match.isWin ? 'V' : 'D';

    return Row(
      children: [
        Container(
          width: 24,
          height: 24,
          alignment: Alignment.center,
          decoration: BoxDecoration(
            color: accent,
            borderRadius: BorderRadius.circular(5),
          ),
          child: Text(
            letter,
            style: AppTypography.soraRegular(
              fontSize: 12,
              fontWeight: FontWeight.w900,
              color: AppColors.black,
            ),
          ),
        ),
        const SizedBox(width: 10),
        Expanded(
          child: Text(
            match.label,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: AppTypography.soraRegular(
              fontSize: 13,
              fontWeight: FontWeight.w600,
              color: context.themeColors.onSurface,
            ),
          ),
        ),
        const SizedBox(width: 8),
        Text(
          match.score.replaceAll('-', ' — '),
          style: AppTypography.mono(
            fontSize: 14,
            fontWeight: FontWeight.w800,
            color: context.themeColors.onSurface,
          ),
        ),
      ],
    );
  }
}
