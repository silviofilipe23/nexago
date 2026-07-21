import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../../../../../core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../data/match_history/head_to_head_repository.dart';
import 'match_detail_section_header.dart';

const kMatchDetailIndividualHeadToHeadPastMatchLimit = 3;

/// "Vocês já se enfrentaram" — H2H por ATLETA (mesmo em jogos de dupla conta
/// pelo par de pessoas, não pelo par de duplas — ver `MatchDetailHeadToHeadSection`
/// para o H2H por dupla exata, que é uma métrica diferente/complementar).
class MatchDetailIndividualHeadToHeadSection extends StatelessWidget {
  const MatchDetailIndividualHeadToHeadSection({
    super.key,
    required this.record,
    required this.opponentName,
  });

  final HeadToHeadRecord record;
  final String opponentName;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final total = record.totalMatches;
    final winRatio = total > 0 ? record.wins / total : 0.0;
    final title = opponentName.trim().isEmpty
        ? 'Vocês já se enfrentaram'
        : 'Você vs $opponentName';

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        MatchDetailSectionHeader(
          eyebrow: 'CONFRONTO DIRETO',
          title: title,
        ),
        SizedBox(height: 14),
        Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: context.themeColors.surfaceCard,
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: context.themeColors.surfaceRaised),
          ),
          child: Column(
            children: [
              Row(
                children: [
                  Expanded(
                    child: _StatColumn(
                      value: '${record.wins}',
                      label: 'VITÓRIAS',
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
                                    child: ColoredBox(color: AppColors.win),
                                  ),
                                if (winRatio < 1)
                                  Expanded(
                                    flex: ((1 - winRatio) * 100).round().clamp(1, 100),
                                    child: ColoredBox(color: AppColors.live),
                                  ),
                              ],
                            ),
                          ),
                        ),
                        SizedBox(height: 6),
                        Text(
                          '$total CONFRONTOS',
                          style: theme.textTheme.labelSmall?.copyWith(
                            fontWeight: FontWeight.w800,
                            color: context.themeColors.onSurfaceMuted,
                            letterSpacing: 0.4,
                            fontSize: 9,
                          ),
                        ),
                      ],
                    ),
                  ),
                  Expanded(
                    child: _StatColumn(
                      value: '${record.losses}',
                      label: 'DERROTAS',
                      color: AppColors.live,
                      theme: theme,
                      alignEnd: true,
                    ),
                  ),
                ],
              ),
              if (record.recentMatches.isNotEmpty) ...[
                SizedBox(height: 16),
                ...record.recentMatches
                    .take(kMatchDetailIndividualHeadToHeadPastMatchLimit)
                    .map(
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
        SizedBox(height: 4),
        Text(
          label,
          style: theme.textTheme.labelSmall?.copyWith(
            fontWeight: FontWeight.w800,
            color: context.themeColors.onSurfaceMuted,
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

  final HeadToHeadRecentMatch match;
  final ThemeData theme;

  @override
  Widget build(BuildContext context) {
    final accent = match.athleteAWon ? AppColors.win : AppColors.live;
    final letter = match.athleteAWon ? 'V' : 'D';

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: context.themeColors.surfaceRaised.withValues(alpha: 0.5),
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
          SizedBox(width: 12),
          Expanded(
            child: Text(
              _label(),
              style: theme.textTheme.bodySmall?.copyWith(
                fontWeight: FontWeight.w700,
                color: context.themeColors.onSurface,
              ),
            ),
          ),
          Text(
            match.scoreLabel,
            style: theme.textTheme.labelLarge?.copyWith(
              fontWeight: FontWeight.w800,
              color: context.themeColors.onSurface,
            ),
          ),
        ],
      ),
    );
  }

  String _label() {
    final tournament = match.tournamentName?.trim().isNotEmpty == true
        ? match.tournamentName!.trim()
        : 'Torneio';
    final playedAt = match.playedAt;
    if (playedAt == null) return tournament;
    return '$tournament · ${DateFormat('MMM yy', 'pt_BR').format(playedAt)}';
  }
}
