import 'package:flutter/material.dart';
import 'package:nexago_app/core/theme/app_typography.dart';

import '../../../../../core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../domain/match_history/athlete_match_detail_models.dart';
import '../../../domain/match_history/match_detail_play_by_play_timeline_logic.dart';
import 'match_detail_team_avatar_stack.dart';

class PlayByPlayPageHeader extends StatelessWidget {
  const PlayByPlayPageHeader({
    super.key,
    required this.subtitle,
    required this.onBack,
    this.onShare,
  });

  final String subtitle;
  final VoidCallback onBack;
  final VoidCallback? onShare;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Padding(
      padding: const EdgeInsets.fromLTRB(8, 4, 8, 0),
      child: Row(
        children: [
          IconButton(
            icon: Icon(Icons.chevron_left_rounded, color: AppColors.onSurface),
            onPressed: onBack,
          ),
          Expanded(
            child: Column(
              children: [
                Text(
                  'Ponto a ponto',
                  style: theme.textTheme.titleMedium?.copyWith(
                    fontWeight: FontWeight.w800,
                    color: AppColors.onSurface,
                  ),
                ),
                if (subtitle.isNotEmpty) ...[
                  const SizedBox(height: 2),
                  Text(
                    subtitle,
                    textAlign: TextAlign.center,
                    style: theme.textTheme.labelSmall?.copyWith(
                      color: AppColors.onSurfaceMuted,
                      fontWeight: FontWeight.w700,
                      letterSpacing: 0.3,
                    ),
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                  ),
                ],
              ],
            ),
          ),
          IconButton(
            icon: Icon(
              Icons.ios_share_rounded,
              color: onShare != null
                  ? AppColors.onSurface
                  : AppColors.onSurfaceMuted.withValues(alpha: 0.4),
              size: 20,
            ),
            onPressed: onShare,
          ),
        ],
      ),
    );
  }
}

class PlayByPlayScoreboard extends StatelessWidget {
  const PlayByPlayScoreboard({super.key, required this.detail});

  final AthleteMatchDetail detail;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isLive = detail.phase == MatchDetailPhase.live;
    final isCompleted = detail.phase == MatchDetailPhase.completed;

    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 8, 20, 0),
      child: Column(
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: _TeamColumn(
                  side: detail.ourTeam,
                  outcomeLabel: _ourOutcomeLabel(detail),
                  outcomeColor: _ourOutcomeColor(detail),
                  showTrophy:
                      isCompleted && detail.isParticipantView && detail.isWin,
                ),
              ),
              Padding(
                padding: const EdgeInsets.only(top: 28),
                child: Column(
                  children: [
                    Text(
                      detail.matchScoreLabel,
                      style: theme.textTheme.headlineMedium?.copyWith(
                        fontWeight: FontWeight.w900,
                        color: AppColors.onSurface,
                        letterSpacing: -0.5,
                        fontFeatures: const [FontFeature.tabularFigures()],
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      isLive ? 'SETS · AO VIVO' : 'SETS · ENCERRADA',
                      style: theme.textTheme.labelSmall?.copyWith(
                        fontWeight: FontWeight.w800,
                        color: isLive
                            ? AppColors.live
                            : AppColors.onSurfaceMuted,
                        letterSpacing: 0.4,
                        fontSize: 10,
                      ),
                    ),
                  ],
                ),
              ),
              Expanded(
                child: _TeamColumn(
                  side: detail.opponentTeam,
                  outcomeLabel: _opponentOutcomeLabel(detail),
                  outcomeColor: _opponentOutcomeColor(detail),
                  alignEnd: true,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  String? _ourOutcomeLabel(AthleteMatchDetail detail) {
    if (!detail.isParticipantView ||
        detail.phase != MatchDetailPhase.completed) {
      return null;
    }
    return detail.isWin ? 'VENCEU' : 'DERROTA';
  }

  String? _opponentOutcomeLabel(AthleteMatchDetail detail) {
    if (!detail.isParticipantView ||
        detail.phase != MatchDetailPhase.completed) {
      return null;
    }
    return detail.isWin ? 'DERROTA' : 'VENCEU';
  }

  Color? _ourOutcomeColor(AthleteMatchDetail detail) {
    if (!detail.isParticipantView ||
        detail.phase != MatchDetailPhase.completed) {
      return null;
    }
    return detail.isWin ? AppColors.win : AppColors.onSurfaceMuted;
  }

  Color? _opponentOutcomeColor(AthleteMatchDetail detail) {
    if (!detail.isParticipantView ||
        detail.phase != MatchDetailPhase.completed) {
      return null;
    }
    return detail.isWin ? AppColors.onSurfaceMuted : AppColors.win;
  }
}

class _TeamColumn extends StatelessWidget {
  const _TeamColumn({
    required this.side,
    this.outcomeLabel,
    this.outcomeColor,
    this.showTrophy = false,
    this.alignEnd = false,
  });

  final MatchTeamSide side;
  final String? outcomeLabel;
  final Color? outcomeColor;
  final bool showTrophy;
  final bool alignEnd;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Column(
      crossAxisAlignment: alignEnd
          ? CrossAxisAlignment.end
          : CrossAxisAlignment.start,
      children: [
        MatchDetailTeamAvatarStack(players: side.players),
        const SizedBox(height: 8),
        Text(
          side.label,
          textAlign: alignEnd ? TextAlign.right : TextAlign.left,
          style: theme.textTheme.labelMedium?.copyWith(
            fontWeight: FontWeight.w800,
            color: AppColors.onSurface,
          ),
          maxLines: 2,
          overflow: TextOverflow.ellipsis,
        ),
        if (outcomeLabel != null) ...[
          const SizedBox(height: 4),
          Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              if (showTrophy) ...[
                Icon(Icons.emoji_events_rounded, size: 12, color: outcomeColor),
                const SizedBox(width: 4),
              ],
              Text(
                outcomeLabel!,
                style: theme.textTheme.labelSmall?.copyWith(
                  fontWeight: FontWeight.w800,
                  color: outcomeColor,
                  letterSpacing: 0.3,
                  fontSize: 10,
                ),
              ),
            ],
          ),
        ],
      ],
    );
  }
}

class PlayByPlaySetTabs extends StatelessWidget {
  const PlayByPlaySetTabs({
    super.key,
    required this.sets,
    required this.selectedSetIndex,
    required this.onSelected,
  });

  final List<MatchSetScore> sets;
  final int selectedSetIndex;
  final ValueChanged<int> onSelected;

  @override
  Widget build(BuildContext context) {
    if (sets.isEmpty) return const SizedBox.shrink();

    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 16, 20, 0),
      child: Row(
        children: [
          for (var i = 0; i < sets.length; i++) ...[
            if (i > 0) const SizedBox(width: 8),
            Expanded(
              child: _SetTabChip(
                set: sets[i],
                setIndex: i,
                isSelected: selectedSetIndex == i,
                onTap: () => onSelected(i),
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _SetTabChip extends StatelessWidget {
  const _SetTabChip({
    required this.set,
    required this.setIndex,
    required this.isSelected,
    required this.onTap,
  });

  final MatchSetScore set;
  final int setIndex;
  final bool isSelected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final borderColor = isSelected
        ? AppColors.brand
        : context.themeColors.surfaceRaised;
    final labelColor = isSelected
        ? AppColors.brand
        : context.themeColors.onSurfaceMuted;

    return Material(
      color: context.themeColors.surfaceCard,
      borderRadius: BorderRadius.circular(12),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: Container(
          padding: const EdgeInsets.symmetric(vertical: 10, horizontal: 6),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: borderColor, width: isSelected ? 1.5 : 1),
          ),
          child: Column(
            children: [
              Text(
                'SET ${setIndex + 1}',
                style: AppTypography.mono(
                  fontWeight: FontWeight.w600,
                  color: labelColor,
                  fontSize: 11,
                  letterSpacing: 0.4,
                ),
              ),
              const SizedBox(height: 4),
              Text(
                '${set.ourScore} – ${set.opponentScore}',
                style: AppTypography.mono(
                  fontWeight: FontWeight.w900,
                  color: AppColors.onSurface,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class PlayByPlayTeamHeaders extends StatelessWidget {
  const PlayByPlayTeamHeaders({
    super.key,
    required this.ourTeamLabel,
    required this.opponentTeamLabel,
  });

  final String ourTeamLabel;
  final String opponentTeamLabel;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 16, 20, 8),
      child: Row(
        children: [
          Expanded(
            child: Text(
              ourTeamLabel.toUpperCase(),
              style: AppTypography.soraRegular(
                fontWeight: FontWeight.w500,
                color: AppColors.brand,
                fontSize: 11,
                letterSpacing: 0.3,
              ),
            ),
          ),
          Expanded(
            child: Text(
              opponentTeamLabel.toUpperCase(),
              textAlign: TextAlign.right,
              style: AppTypography.soraRegular(
                fontWeight: FontWeight.w500,
                color: AppColors.onSurfaceMuted,
                fontSize: 11,
                letterSpacing: 0.3,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class PlayByPlayStreakTimeline extends StatelessWidget {
  const PlayByPlayStreakTimeline({super.key, required this.timeline});

  final PlayByPlaySetTimeline timeline;

  @override
  Widget build(BuildContext context) {
    if (timeline.blocks.isEmpty) {
      return const Padding(
        padding: EdgeInsets.all(24),
        child: Center(
          child: Text(
            'Sem pontos registrados neste set.',
            style: TextStyle(color: AppColors.onSurfaceMuted),
          ),
        ),
      );
    }

    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 0, 20, 16),
      child: Column(
        children: [
          _StartPill(time: timeline.startTime),
          const SizedBox(height: 12),
          for (var i = 0; i < timeline.blocks.length; i++) ...[
            _StreakTimelineRow(block: timeline.blocks[i]),
            if (i < timeline.blocks.length - 1) const SizedBox(height: 14),
          ],
          if (timeline.unrecordedPointsCount > 0) ...[
            const SizedBox(height: 14),
            _UnrecordedPointsGap(
              count: timeline.unrecordedPointsCount,
              fromScore: timeline.lastRecordedScoreLabel,
              toScore: timeline.summary.finalScore,
            ),
          ],
          const SizedBox(height: 8),
          PlayByPlaySetSummaryFooter(summary: timeline.summary),
        ],
      ),
    );
  }
}

class _StartPill extends StatelessWidget {
  const _StartPill({required this.time});

  final String time;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Center(
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
        decoration: BoxDecoration(
          color: AppColors.surfaceRaised,
          borderRadius: BorderRadius.circular(999),
          border: Border.all(color: AppColors.surfaceSheet),
        ),
        child: Text(
          'INÍCIO · $time',
          style: theme.textTheme.labelSmall?.copyWith(
            fontWeight: FontWeight.w600,
            color: AppColors.onSurfaceMuted,
            fontSize: 10,
            letterSpacing: 0.3,
          ),
        ),
      ),
    );
  }
}

class _StreakTimelineRow extends StatelessWidget {
  const _StreakTimelineRow({required this.block});

  final PlayByPlayStreakBlock block;

  @override
  Widget build(BuildContext context) {
    final isLeft = block.isOurTeam;

    return IntrinsicHeight(
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Expanded(
            child: isLeft
                ? Align(
                    alignment: Alignment.centerRight,
                    child: _StreakCard(block: block, alignEnd: true),
                  )
                : const SizedBox.shrink(),
          ),
          _TimelineConnector(isOurTeam: block.isOurTeam),
          Expanded(
            child: !isLeft
                ? Align(
                    alignment: Alignment.centerLeft,
                    child: _StreakCard(block: block, alignEnd: false),
                  )
                : const SizedBox.shrink(),
          ),
        ],
      ),
    );
  }
}

class _TimelineConnector extends StatelessWidget {
  const _TimelineConnector({required this.isOurTeam});

  final bool isOurTeam;

  @override
  Widget build(BuildContext context) {
    final color = isOurTeam ? AppColors.brand : AppColors.onSurfaceMuted;

    return SizedBox(
      width: 28,
      child: Column(
        children: [
          Container(width: 2, height: 12, color: AppColors.surfaceRaised),
          Container(
            width: 10,
            height: 10,
            decoration: BoxDecoration(
              color: color,
              shape: BoxShape.circle,
              border: Border.all(color: AppColors.canvas, width: 2),
            ),
          ),
          Expanded(child: Container(width: 2, color: AppColors.surfaceRaised)),
        ],
      ),
    );
  }
}

class _StreakCard extends StatelessWidget {
  const _StreakCard({required this.block, required this.alignEnd});

  final PlayByPlayStreakBlock block;
  final bool alignEnd;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final accent = block.isOurTeam ? AppColors.brand : AppColors.onSurfaceMuted;

    return Container(
      width: double.infinity,
      margin: EdgeInsets.only(right: alignEnd ? 6 : 0, left: alignEnd ? 0 : 6),
      padding: const EdgeInsets.fromLTRB(12, 10, 12, 10),
      decoration: BoxDecoration(
        color: AppColors.surfaceCard,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppColors.surfaceRaised),
      ),
      child: Column(
        crossAxisAlignment: alignEnd
            ? CrossAxisAlignment.end
            : CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                block.label,
                style: theme.textTheme.labelSmall?.copyWith(
                  fontWeight: FontWeight.w600,
                  color: accent,
                  fontSize: 11,
                  letterSpacing: 0.3,
                ),
              ),
              const SizedBox(width: 8),
              Text(
                block.time,
                style: theme.textTheme.labelSmall?.copyWith(
                  fontWeight: FontWeight.w500,
                  color: AppColors.onSurfaceMuted,
                  fontFeatures: const [FontFeature.tabularFigures()],
                ),
              ),
            ],
          ),
          if (block.isLongestStreak) ...[
            const SizedBox(height: 6),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
              decoration: BoxDecoration(
                color: AppColors.brand.withValues(alpha: 0.12),
                borderRadius: BorderRadius.circular(999),
                border: Border.all(
                  color: AppColors.brand.withValues(alpha: 0.3),
                ),
              ),
              child: Text(
                '★ MAIOR SEQUÊNCIA DO SET',
                style: theme.textTheme.labelSmall?.copyWith(
                  fontWeight: FontWeight.w800,
                  color: AppColors.brand,
                  fontSize: 8,
                  letterSpacing: 0.2,
                ),
              ),
            ),
          ],
          const SizedBox(height: 8),
          for (final point in block.points) ...[
            _PointScoreRow(point: point, alignEnd: alignEnd),
            const SizedBox(height: 4),
          ],
        ],
      ),
    );
  }
}

class _PointScoreRow extends StatelessWidget {
  const _PointScoreRow({required this.point, required this.alignEnd});

  final PlayByPlayPointRow point;
  final bool alignEnd;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final annotation = switch (point.annotation) {
      PlayByPlayPointAnnotation.empate => 'EMPATE',
      PlayByPlayPointAnnotation.virada => 'VIRADA',
      null => null,
    };
    final annotationColor = point.annotation == PlayByPlayPointAnnotation.virada
        ? AppColors.brand
        : AppColors.onSurfaceMuted;

    return Row(
      mainAxisSize: MainAxisSize.min,
      mainAxisAlignment: alignEnd
          ? MainAxisAlignment.end
          : MainAxisAlignment.start,
      children: [
        Text(
          point.scoreLabel,
          style: theme.textTheme.bodyMedium?.copyWith(
            fontWeight: FontWeight.w500,
            color: AppColors.onSurface,
            fontFeatures: const [FontFeature.tabularFigures()],
          ),
        ),
        if (annotation != null) ...[
          const SizedBox(width: 8),
          Text(
            annotation,
            style: theme.textTheme.labelSmall?.copyWith(
              fontWeight: FontWeight.w800,
              color: annotationColor,
              fontSize: 9,
              letterSpacing: 0.2,
            ),
          ),
        ],
      ],
    );
  }
}

class _UnrecordedPointsGap extends StatelessWidget {
  const _UnrecordedPointsGap({
    required this.count,
    required this.fromScore,
    required this.toScore,
  });

  final int count;
  final String? fromScore;
  final String toScore;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final pointsLabel = count == 1 ? '1 ponto' : '$count pontos';
    final from = fromScore?.trim();
    final trail = from != null && from.isNotEmpty
        ? ' de $from até $toScore'
        : ' até $toScore';

    return Column(
      children: [
        SizedBox(
          width: 28,
          child: Column(
            children: [
              Container(width: 2, height: 12, color: AppColors.surfaceRaised),
              Container(
                width: 8,
                height: 8,
                decoration: BoxDecoration(
                  color: AppColors.surfaceRaised,
                  shape: BoxShape.circle,
                  border: Border.all(color: AppColors.canvas, width: 2),
                ),
              ),
              Container(width: 2, height: 12, color: AppColors.surfaceRaised),
            ],
          ),
        ),
        const SizedBox(height: 8),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
          decoration: BoxDecoration(
            color: AppColors.surfaceRaised.withValues(alpha: 0.45),
            borderRadius: BorderRadius.circular(999),
            border: Border.all(color: AppColors.surfaceSheet),
          ),
          child: Text(
            '··· $pointsLabel sem registro individual$trail',
            textAlign: TextAlign.center,
            style: theme.textTheme.labelSmall?.copyWith(
              fontWeight: FontWeight.w600,
              color: AppColors.onSurfaceMuted,
              fontSize: 10,
              letterSpacing: 0.2,
            ),
          ),
        ),
      ],
    );
  }
}

class PlayByPlaySetSummaryFooter extends StatelessWidget {
  const PlayByPlaySetSummaryFooter({super.key, required this.summary});

  final PlayByPlaySetSummary summary;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final pillScore = summary.finalScore.replaceAll(' – ', '-');

    return Column(
      children: [
        SizedBox(
          width: 28,
          child: Column(
            children: [
              Container(width: 2, height: 16, color: AppColors.surfaceRaised),
              Container(
                width: 10,
                height: 10,
                decoration: BoxDecoration(
                  color: AppColors.win,
                  shape: BoxShape.circle,
                  border: Border.all(color: AppColors.canvas, width: 2),
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 10),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 7),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(999),
            border: Border.all(color: AppColors.win.withValues(alpha: 0.7)),
          ),
          child: Text(
            '${summary.closerLabel.toUpperCase()} FECHA O SET · $pillScore',
            textAlign: TextAlign.center,
            style: theme.textTheme.labelSmall?.copyWith(
              fontWeight: FontWeight.w800,
              color: AppColors.win,
              letterSpacing: 0.2,
              fontSize: 10,
            ),
          ),
        ),
        const SizedBox(height: 12),
        Container(
          width: double.infinity,
          padding: const EdgeInsets.symmetric(vertical: 14, horizontal: 8),
          decoration: BoxDecoration(
            color: AppColors.surfaceCard,
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: AppColors.surfaceRaised),
          ),
          child: Row(
            children: [
              _SummaryStat(
                value: '${summary.maxStreak}',
                label: 'SEQ. MÁX',
              ),
              _SummaryStat(
                value: '${summary.comebackCount}',
                label: 'VIRADAS',
              ),
              _SummaryStat(
                value: '${summary.tieCount}',
                label: 'EMPATES',
              ),
              _SummaryStat(
                value: summary.durationLabel,
                label: 'DURAÇÃO',
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class _SummaryStat extends StatelessWidget {
  const _SummaryStat({required this.value, required this.label});

  final String value;
  final String label;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Expanded(
      child: Column(
        children: [
          Text(
            value,
            style: AppTypography.mono(
              fontWeight: FontWeight.w900,
              color: AppColors.onSurface,
              fontSize: 18,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            label,
            style: theme.textTheme.labelSmall?.copyWith(
              fontWeight: FontWeight.w700,
              color: AppColors.onSurfaceMuted,
              fontSize: 9,
              letterSpacing: 0.3,
            ),
          ),
        ],
      ),
    );
  }
}
