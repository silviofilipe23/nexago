import 'package:flutter/material.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import 'package:nexago_app/core/theme/app_typography.dart';

import '../../../../../core/theme/app_colors.dart';
import '../../../domain/match_history/athlete_match_detail_models.dart';
import 'match_detail_section_header.dart';

/// Resumo set a set do placar ponto a ponto (abaixo dos últimos lances).
class MatchDetailPointByPointSection extends StatelessWidget {
  const MatchDetailPointByPointSection({
    super.key,
    required this.groups,
    required this.ourTeamHeader,
    required this.opponentTeamHeader,
    this.onViewFullAnalysis,
  });

  final List<MatchDetailPlayByPlayGroup> groups;
  final String ourTeamHeader;
  final String opponentTeamHeader;
  final VoidCallback? onViewFullAnalysis;

  @override
  Widget build(BuildContext context) {
    if (groups.isEmpty) return const SizedBox.shrink();

    final theme = Theme.of(context);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const MatchDetailSectionHeader(
          eyebrow: 'HISTÓRICO',
          title: 'Ponto a ponto',
        ),
        const SizedBox(height: 14),
        for (var i = 0; i < groups.length; i++) ...[
          if (i > 0) const SizedBox(height: 10),
          _SetGroupCard(
            group: groups[i],
            ourTeamHeader: ourTeamHeader,
            opponentTeamHeader: opponentTeamHeader,
          ),
        ],
        if (onViewFullAnalysis != null) ...[
          const SizedBox(height: 4),
          Align(
            alignment: Alignment.centerRight,
            child: TextButton(
              onPressed: onViewFullAnalysis,
              child: Text(
                'Ver análise completa →',
                style: theme.textTheme.labelLarge?.copyWith(
                  fontWeight: FontWeight.w800,
                  color: AppColors.brand,
                ),
              ),
            ),
          ),
        ],
      ],
    );
  }
}

class _SetGroupCard extends StatelessWidget {
  const _SetGroupCard({
    required this.group,
    required this.ourTeamHeader,
    required this.opponentTeamHeader,
  });

  final MatchDetailPlayByPlayGroup group;
  final String ourTeamHeader;
  final String opponentTeamHeader;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final preview = group.items.length <= 6
        ? group.items
        : [
            ...group.items.take(3),
            ...group.items.skip(group.items.length - 3),
          ];
    final omitted = group.items.length - preview.length;

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.fromLTRB(14, 12, 14, 14),
      decoration: BoxDecoration(
        color: context.themeColors.surfaceCard,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: context.themeColors.surfaceRaised),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Text(
                'SET ${group.setNumber}',
                style: AppTypography.mono(
                  fontSize: 11,
                  fontWeight: FontWeight.w700,
                  color: AppColors.brand,
                  letterSpacing: 0.4,
                ),
              ),
              const Spacer(),
              Text(
                group.finalScoreLabel,
                style: theme.textTheme.titleSmall?.copyWith(
                  fontWeight: FontWeight.w800,
                  color: context.themeColors.onSurface,
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          Row(
            children: [
              Expanded(
                child: Text(
                  ourTeamHeader.toUpperCase(),
                  style: AppTypography.soraRegular(
                    fontWeight: FontWeight.w600,
                    color: AppColors.brand,
                    fontSize: 10,
                    letterSpacing: 0.5,
                  ),
                ),
              ),
              Expanded(
                child: Text(
                  opponentTeamHeader.toUpperCase(),
                  textAlign: TextAlign.right,
                  style: AppTypography.soraRegular(
                    fontWeight: FontWeight.w600,
                    color: AppColors.onSurfaceMuted,
                    fontSize: 10,
                    letterSpacing: 0.5,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          for (var i = 0; i < preview.length; i++) ...[
            if (omitted > 0 && i == 3) ...[
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 6),
                child: Text(
                  '· · · +$omitted pontos · · ·',
                  textAlign: TextAlign.center,
                  style: theme.textTheme.labelSmall?.copyWith(
                    color: context.themeColors.onSurfaceMuted,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
            ],
            _PointRow(item: preview[i]),
            if (i < preview.length - 1) const SizedBox(height: 6),
          ],
        ],
      ),
    );
  }
}

class _PointRow extends StatelessWidget {
  const _PointRow({required this.item});

  final MatchDetailPlayByPlayItem item;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final pill = Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(
        color: item.isOurTeam
            ? AppColors.brand.withValues(alpha: 0.16)
            : context.themeColors.surfaceRaised,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(
          color: item.isOurTeam
              ? AppColors.brand.withValues(alpha: 0.28)
              : context.themeColors.surfaceSheet,
        ),
      ),
      child: Text(
        item.scoreLabel,
        style: AppTypography.mono(
          fontSize: 12,
          fontWeight: FontWeight.w800,
          color: AppColors.onSurface,
        ),
      ),
    );
    final time = Text(
      item.time,
      style: theme.textTheme.labelSmall?.copyWith(
        color: context.themeColors.onSurfaceMuted,
        fontWeight: FontWeight.w600,
        fontSize: 10,
      ),
    );

    return Row(
      children: [
        Expanded(
          child: item.isOurTeam
              ? Row(
                  mainAxisAlignment: MainAxisAlignment.end,
                  children: [time, const SizedBox(width: 6), pill],
                )
              : const SizedBox.shrink(),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: !item.isOurTeam
              ? Row(
                  children: [pill, const SizedBox(width: 6), time],
                )
              : const SizedBox.shrink(),
        ),
      ],
    );
  }
}
