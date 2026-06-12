import 'package:flutter/material.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import 'package:nexago_app/core/theme/app_typography.dart';

import '../../../../../core/theme/app_colors.dart';
import '../../../domain/match_history/athlete_match_detail_models.dart';
import 'match_detail_section_header.dart';

class MatchDetailPlayByPlaySection extends StatelessWidget {
  const MatchDetailPlayByPlaySection({
    super.key,
    required this.items,
    required this.totalPoints,
    required this.ourTeamHeader,
    required this.opponentTeamHeader,
    this.playByPlayGroups = const [],
    this.onViewFullAnalysis,
  });

  final List<MatchDetailPlayByPlayItem> items;
  final int totalPoints;
  final String ourTeamHeader;
  final String opponentTeamHeader;
  final List<MatchDetailPlayByPlayGroup> playByPlayGroups;
  final VoidCallback? onViewFullAnalysis;

  @override
  Widget build(BuildContext context) {
    if (items.isEmpty) return const SizedBox.shrink();

    final theme = Theme.of(context);
    final showCta = onViewFullAnalysis != null && totalPoints > 0;
    final setMetaLabel = _setMetaLabel(items);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Expanded(
              child: MatchDetailSectionHeader(
                eyebrow: 'PONTO A PONTO',
                title: 'Últimos lances',
              ),
            ),
            if (setMetaLabel != null) ...[
              const SizedBox(width: 12),
              Padding(
                padding: const EdgeInsets.only(top: 2),
                child: Text(
                  setMetaLabel,
                  style: AppTypography.mono(
                    color: context.themeColors.onSurfaceMuted,
                    fontWeight: FontWeight.w500,
                    fontSize: 10,
                    letterSpacing: 0.2,
                  ),
                ),
              ),
            ],
          ],
        ),
        const SizedBox(height: 14),
        Container(
          padding: const EdgeInsets.fromLTRB(14, 12, 14, 14),
          decoration: BoxDecoration(
            color: context.themeColors.surfaceCard,
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: context.themeColors.surfaceRaised),
          ),
          child: Stack(
            children: [
              Positioned(
                left: 0,
                right: 0,
                top: 34,
                bottom: 0,
                child: Center(
                  child: Container(
                    width: 1,
                    color: context.themeColors.surfaceRaised.withValues(
                      alpha: 0.9,
                    ),
                  ),
                ),
              ),
              Column(
                children: [
                  _TeamHeadersRow(
                    ourTeamHeader: ourTeamHeader,
                    opponentTeamHeader: opponentTeamHeader,
                  ),
                  const SizedBox(height: 10),
                  for (var i = 0; i < items.length; i++) ...[
                    if (i > 0) const SizedBox(height: 8),
                    _MirroredPlayByPlayRow(
                      item: items[i],
                      isSetClosing: _isSetClosingPoint(items[i]),
                    ),
                  ],
                ],
              ),
            ],
          ),
        ),
        if (showCta) ...[
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

  bool _isSetClosingPoint(MatchDetailPlayByPlayItem item) {
    for (final group in playByPlayGroups) {
      if (group.setNumber != item.setNumber) continue;
      final recorded = group.items.where((i) => !i.isEstimated).toList();
      if (recorded.isEmpty) continue;
      final closing = recorded.last;
      if (closing.scoreLabel != group.finalScoreLabel) continue;
      if (closing.scoreLabel == item.scoreLabel && closing.time == item.time) {
        return true;
      }
    }
    return false;
  }

  String? _setMetaLabel(List<MatchDetailPlayByPlayItem> previewItems) {
    if (previewItems.isEmpty) return null;

    final setNumber = previewItems.first.setNumber;
    final setItems = previewItems
        .where((item) => item.setNumber == setNumber)
        .toList();
    final times = setItems
        .map((item) => item.time)
        .where((time) => time.isNotEmpty && time != '—')
        .toList();
    if (times.isEmpty) return 'SET $setNumber';

    times.sort();
    return 'SET $setNumber · ${times.first}–${times.last}';
  }
}

class _TeamHeadersRow extends StatelessWidget {
  const _TeamHeadersRow({
    required this.ourTeamHeader,
    required this.opponentTeamHeader,
  });

  final String ourTeamHeader;
  final String opponentTeamHeader;

  @override
  Widget build(BuildContext context) {
    return Row(
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
    );
  }
}

class _MirroredPlayByPlayRow extends StatelessWidget {
  const _MirroredPlayByPlayRow({
    required this.item,
    required this.isSetClosing,
  });

  final MatchDetailPlayByPlayItem item;
  final bool isSetClosing;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scorePill = _ScorePill(
      scoreLabel: item.scoreLabel,
      isOurTeam: item.isOurTeam,
      isSetClosing: isSetClosing,
    );
    final time = Text(
      item.time,
      style: theme.textTheme.labelSmall?.copyWith(
        color: context.themeColors.onSurfaceMuted,
        fontWeight: FontWeight.w600,
        fontSize: 10,
        fontFeatures: const [FontFeature.tabularFigures()],
      ),
    );
    final closingLabel = isSetClosing
        ? Text(
            'FECHOU O SET',
            style: theme.textTheme.labelSmall?.copyWith(
              color: AppColors.win,
              fontWeight: FontWeight.w800,
              fontSize: 8,
              letterSpacing: 0.3,
            ),
          )
        : null;

    return IntrinsicHeight(
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          Expanded(
            child: item.isOurTeam
                ? _PlayByPlaySideRow(
                    alignment: Alignment.centerRight,
                    children: [
                      if (closingLabel != null) ...[
                        closingLabel,
                        const SizedBox(width: 6),
                      ],
                      time,
                      const SizedBox(width: 6),
                      scorePill,
                    ],
                  )
                : const SizedBox.shrink(),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: !item.isOurTeam
                ? _PlayByPlaySideRow(
                    alignment: Alignment.centerLeft,
                    children: [
                      scorePill,
                      const SizedBox(width: 6),
                      time,
                      if (closingLabel != null) ...[
                        const SizedBox(width: 6),
                        closingLabel,
                      ],
                    ],
                  )
                : const SizedBox.shrink(),
          ),
        ],
      ),
    );
  }
}

class _PlayByPlaySideRow extends StatelessWidget {
  const _PlayByPlaySideRow({
    required this.alignment,
    required this.children,
  });

  final Alignment alignment;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    return Align(
      alignment: alignment,
      child: FittedBox(
        fit: BoxFit.scaleDown,
        alignment: alignment,
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: children,
        ),
      ),
    );
  }
}

class _ScorePill extends StatelessWidget {
  const _ScorePill({
    required this.scoreLabel,
    required this.isOurTeam,
    required this.isSetClosing,
  });

  final String scoreLabel;
  final bool isOurTeam;
  final bool isSetClosing;

  @override
  Widget build(BuildContext context) {
    final background = isOurTeam
        ? AppColors.brand.withValues(alpha: 0.16)
        : context.themeColors.surfaceRaised;
    final borderColor = isSetClosing
        ? AppColors.brand
        : (isOurTeam
              ? AppColors.brand.withValues(alpha: 0.28)
              : context.themeColors.surfaceSheet);

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(
        color: background,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: borderColor, width: isSetClosing ? 1.5 : 1),
      ),
      child: Text(
        scoreLabel,
        style: AppTypography.mono(
          fontSize: 12,
          fontWeight: FontWeight.w800,
          color: AppColors.onSurface,
        ),
      ),
    );
  }
}
