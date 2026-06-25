import 'package:flutter/material.dart';
import 'package:nexago_app/core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import 'package:nexago_app/core/theme/app_typography.dart';

import '../../../domain/tournament_group_standings_logic.dart';

class TournamentGroupStandingsHeader extends StatelessWidget {
  const TournamentGroupStandingsHeader({
    super.key,
    required this.isComplete,
    required this.qualifiersPerGroup,
  });

  final bool isComplete;
  final int qualifiersPerGroup;

  @override
  Widget build(BuildContext context) {
    final phaseLabel =
        isComplete ? 'FASE DE GRUPOS · ENCERRADA' : 'FASE DE GRUPOS · EM ANDAMENTO';

    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 16, 20, 4),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            phaseLabel,
            style: AppTypography.mono(
              fontSize: 10,
              fontWeight: FontWeight.w700,
              color: AppColors.brand,
              letterSpacing: 0.8,
            ),
          ),
          const SizedBox(height: 6),
          Text(
            'Classificam $qualifiersPerGroup por grupo',
            style: AppTypography.soraRegular(
              fontSize: 22,
              fontWeight: FontWeight.w800,
              color: context.themeColors.onSurface,
            ),
          ),
        ],
      ),
    );
  }
}

class TournamentPoolStandingsCard extends StatelessWidget {
  const TournamentPoolStandingsCard({
    super.key,
    required this.group,
    required this.qualifiersPerGroup,
  });

  final TournamentPoolStandingsGroup group;
  final int qualifiersPerGroup;

  String get _groupLetter {
    final label = group.poolLabel.trim();
    final lower = label.toLowerCase();
    if (lower.startsWith('grupo ')) {
      final parts = label.split(' ');
      if (parts.length >= 2) return parts.last;
    }
    return group.poolId.isNotEmpty ? group.poolId : label;
  }

  @override
  Widget build(BuildContext context) {
    final teamLabel = group.teamCount == 1 ? 'DUPLA' : 'DUPLAS';
    final matchLabel = group.matchCount == 1 ? 'JOGO' : 'JOGOS';
    final statusLabel = group.isComplete ? 'FINALIZADO' : 'EM ANDAMENTO';
    final statusColor =
        group.isComplete ? AppColors.win : context.themeColors.onSurfaceMuted;

    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 8, 20, 0),
      child: Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: context.themeColors.surfaceRaised,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(
            color: context.themeColors.onSurfaceMuted.withValues(alpha: 0.12),
          ),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Container(
                  width: 36,
                  height: 36,
                  alignment: Alignment.center,
                  decoration: BoxDecoration(
                    color: AppColors.brand,
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: Text(
                    _groupLetter.toUpperCase(),
                    style: AppTypography.soraRegular(
                      fontSize: 16,
                      fontWeight: FontWeight.w900,
                      color: AppColors.black,
                    ),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        group.poolLabel,
                        style: AppTypography.soraRegular(
                          fontSize: 16,
                          fontWeight: FontWeight.w800,
                          color: context.themeColors.onSurface,
                        ),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        '${group.teamCount} $teamLabel · ${group.matchCount} $matchLabel',
                        style: AppTypography.mono(
                          fontSize: 10,
                          color: context.themeColors.onSurfaceMuted,
                          letterSpacing: 0.4,
                        ),
                      ),
                    ],
                  ),
                ),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                  decoration: BoxDecoration(
                    color: statusColor.withValues(alpha: 0.12),
                    borderRadius: BorderRadius.circular(6),
                  ),
                  child: Text(
                    statusLabel,
                    style: AppTypography.mono(
                      fontSize: 9,
                      fontWeight: FontWeight.w700,
                      color: statusColor,
                      letterSpacing: 0.4,
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),
            _StandingsTableHeader(),
            const SizedBox(height: 4),
            for (final row in group.rows)
              _StandingsTableRow(
                row: row,
                highlightQualifiers: true,
              ),
          ],
        ),
      ),
    );
  }
}

class _StandingsTableHeader extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    final muted = context.themeColors.onSurfaceMuted;
    final style = AppTypography.mono(
      fontSize: 9,
      fontWeight: FontWeight.w600,
      color: muted,
      letterSpacing: 0.5,
    );

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 4),
      child: Row(
        children: [
          SizedBox(width: 28, child: Text('#', style: style)),
          Expanded(child: Text('DUPLA', style: style)),
          SizedBox(width: 22, child: Text('V', style: style, textAlign: TextAlign.center)),
          SizedBox(width: 22, child: Text('D', style: style, textAlign: TextAlign.center)),
          SizedBox(width: 36, child: Text('SF', style: style, textAlign: TextAlign.center)),
          SizedBox(width: 30, child: Text('PTS', style: style, textAlign: TextAlign.end)),
        ],
      ),
    );
  }
}

class _StandingsTableRow extends StatelessWidget {
  const _StandingsTableRow({
    required this.row,
    required this.highlightQualifiers,
  });

  final TournamentPoolStandingsRow row;
  final bool highlightQualifiers;

  @override
  Widget build(BuildContext context) {
    final qualifies = highlightQualifiers && row.qualifies;
    final rankColor = qualifies ? AppColors.win : context.themeColors.onSurfaceMuted;
    final statColor = context.themeColors.onSurfaceMuted;
    final ptsColor = context.themeColors.onSurface;

    Color? background;
    if (row.isAthleteTeam) {
      background = AppColors.brand.withValues(alpha: 0.08);
    }

    return Container(
      margin: const EdgeInsets.only(bottom: 2),
      decoration: BoxDecoration(
        color: background,
        borderRadius: BorderRadius.circular(6),
      ),
      child: IntrinsicHeight(
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            if (qualifies)
              Container(
                width: 3,
                decoration: BoxDecoration(
                  color: AppColors.win,
                  borderRadius: const BorderRadius.horizontal(
                    left: Radius.circular(6),
                  ),
                ),
              ),
            Expanded(
              child: Padding(
                padding: EdgeInsets.fromLTRB(qualifies ? 8 : 11, 8, 4, 8),
                child: Row(
                  children: [
                    SizedBox(
                      width: 24,
                      child: Text(
                        '${row.rank}',
                        style: AppTypography.mono(
                          fontSize: 12,
                          fontWeight: FontWeight.w700,
                          color: rankColor,
                        ),
                      ),
                    ),
                    Expanded(
                      child: Text(
                        row.displayName,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: AppTypography.soraRegular(
                          fontSize: 13,
                          fontWeight: FontWeight.w600,
                          color: context.themeColors.onSurface,
                        ),
                      ),
                    ),
                    SizedBox(
                      width: 22,
                      child: Text(
                        '${row.wins}',
                        textAlign: TextAlign.center,
                        style: AppTypography.mono(
                          fontSize: 11,
                          color: statColor,
                        ),
                      ),
                    ),
                    SizedBox(
                      width: 22,
                      child: Text(
                        '${row.losses}',
                        textAlign: TextAlign.center,
                        style: AppTypography.mono(
                          fontSize: 11,
                          color: statColor,
                        ),
                      ),
                    ),
                    SizedBox(
                      width: 36,
                      child: Text(
                        row.setsForDisplay,
                        textAlign: TextAlign.center,
                        style: AppTypography.mono(
                          fontSize: 11,
                          color: statColor,
                        ),
                      ),
                    ),
                    SizedBox(
                      width: 30,
                      child: Text(
                        '${row.points}',
                        textAlign: TextAlign.end,
                        style: AppTypography.mono(
                          fontSize: 11,
                          fontWeight: FontWeight.w700,
                          color: ptsColor,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class TournamentGroupStandingsFooter extends StatelessWidget {
  const TournamentGroupStandingsFooter({
    super.key,
    required this.qualifiersPerGroup,
  });

  final int qualifiersPerGroup;

  @override
  Widget build(BuildContext context) {
    final plural = qualifiersPerGroup == 1 ? 'primeira dupla' : 'primeiras duplas';

    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 16, 20, 0),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
        decoration: BoxDecoration(
          color: context.themeColors.surfaceCard,
          borderRadius: BorderRadius.circular(10),
          border: Border.all(
            color: context.themeColors.onSurfaceMuted.withValues(alpha: 0.1),
          ),
        ),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Container(
              width: 6,
              height: 6,
              margin: const EdgeInsets.only(top: 5),
              decoration: const BoxDecoration(
                color: AppColors.win,
                shape: BoxShape.circle,
              ),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: Text(
                'As $qualifiersPerGroup $plural de cada grupo avançam para a próxima fase.',
                style: AppTypography.soraRegular(
                  fontSize: 12,
                  color: context.themeColors.onSurfaceMuted,
                  height: 1.4,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
