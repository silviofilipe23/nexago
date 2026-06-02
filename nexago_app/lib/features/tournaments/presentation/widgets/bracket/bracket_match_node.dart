import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:nexago_app/core/theme/app_typography.dart';

import '../../../../../core/theme/app_colors.dart';
import '../../../domain/double_elimination_bracket_layout.dart';
import '../../../domain/tournament_match.dart';
import '../../../domain/tournament_match_card_view_model.dart';
import '../../../domain/tournament_match_display.dart';

class BracketMatchNode extends StatelessWidget {
  const BracketMatchNode({
    super.key,
    required this.viewModel,
    required this.isAthleteMatch,
    required this.isFinal,
    required this.athleteTeamIds,
    this.onTap,
  });

  final TournamentMatchCardViewModel viewModel;
  final bool isAthleteMatch;
  final bool isFinal;
  final Set<String> athleteTeamIds;
  final VoidCallback? onTap;

  static const _finalBackground = Color(0xFF1C1206);

  @override
  Widget build(BuildContext context) {
    final match = viewModel.match;
    final isLive = match.isInProgress;
    final counts = setsWonCountForMatch(match);
    final hasScore = matchHasScoreData(match);
    final teamAWon = isMatchTeamWinner(match, isTeamA: true);
    final teamBWon = isMatchTeamWinner(match, isTeamA: false);
    final statusLabel = matchStatusPillLabelPt(match.status);
    final headerLabel = _bracketMatchHeaderLabel(match);

    final borderColor = isLive
        ? AppColors.brand.withValues(alpha: 0.55)
        : isAthleteMatch
            ? AppColors.brand.withValues(alpha: 0.85)
            : AppColors.brand.withValues(alpha: 0.35);
    final borderWidth = isAthleteMatch || isFinal ? 2.0 : 1.5;
    final backgroundColor = isFinal
        ? _finalBackground
        : isAthleteMatch && !isLive
            ? AppColors.brand.withValues(alpha: 0.06)
            : AppColors.surfaceRaised;

    final winnerSetPills = teamAWon
        ? _setPillsForTeam(match: match, isTeamA: true)
        : teamBWon
            ? _setPillsForTeam(match: match, isTeamA: false)
            : const <String>[];

    const radius = BorderRadius.all(Radius.circular(18));
    final content = Container(
        padding: const EdgeInsets.fromLTRB(12, 8, 12, 8),
        decoration: BoxDecoration(
          color: backgroundColor,
          borderRadius: radius,
          border: Border.all(color: borderColor, width: borderWidth),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    headerLabel,
                    style: AppTypography.mono(
                      fontSize: 10,
                      fontWeight: FontWeight.w600,
                      color: AppColors.onSurfaceMuted,
                      letterSpacing: 0.3,
                    ),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
                _StatusPill(label: statusLabel, isLive: isLive),
              ],
            ),
            const SizedBox(height: 6),
            Expanded(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  _TeamRow(
                    team: viewModel.teamA,
                    setsWon: counts.$1,
                    hasScore: hasScore,
                    isWinner: teamAWon,
                    isYou: athleteTeamIds.contains(match.teamAId.trim()),
                  ),
                  const SizedBox(height: 6),
                  _TeamRow(
                    team: viewModel.teamB,
                    setsWon: counts.$2,
                    hasScore: hasScore,
                    isWinner: teamBWon,
                    isYou: athleteTeamIds.contains(match.teamBId.trim()),
                  ),
                ],
              ),
            ),
            if (winnerSetPills.isNotEmpty) ...[
              const SizedBox(height: 4),
              Row(
                children: [
                  for (var i = 0; i < winnerSetPills.length; i++) ...[
                    if (i > 0) const SizedBox(width: 6),
                    _SetPill(label: winnerSetPills[i]),
                  ],
                ],
              ),
            ],
          ],
        ),
      );

    return SizedBox(
      width: BracketLayoutMetrics.cardWidth,
      height: BracketLayoutMetrics.cardHeight,
      child: onTap == null
          ? content
          : Material(
              color: Colors.transparent,
              child: InkWell(
                onTap: onTap,
                borderRadius: radius,
                child: content,
              ),
            ),
    );
  }
}

String _bracketMatchHeaderLabel(TournamentMatch match) {
  if (match.matchNumber <= 0) return '';
  final qualifier = match.poolId.trim();
  if (qualifier.isNotEmpty) {
    return '#${match.matchNumber} · $qualifier';
  }
  return '#${match.matchNumber}';
}

List<String> _setPillsForTeam({
  required TournamentMatch match,
  required bool isTeamA,
}) {
  final sets = setsForMatch(match);
  if (sets.isEmpty) return const [];

  return sets.map((s) {
    final own = isTeamA ? s.a : s.b;
    final opp = isTeamA ? s.b : s.a;
    return '$own · $opp';
  }).toList();
}

class _StatusPill extends StatelessWidget {
  const _StatusPill({required this.label, required this.isLive});

  final String label;
  final bool isLive;

  @override
  Widget build(BuildContext context) {
    final color = isLive
        ? AppColors.brand
        : label == 'FINALIZADO'
            ? AppColors.win
            : AppColors.onSurfaceMuted;

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: color.withValues(alpha: 0.65)),
      ),
      child: Text(
        label,
        style: AppTypography.mono(
          fontSize: 8,
          fontWeight: FontWeight.w700,
          color: color,
          letterSpacing: 0.4,
        ),
      ),
    );
  }
}

class _SetPill extends StatelessWidget {
  const _SetPill({required this.label});

  final String label;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: AppColors.canvas.withValues(alpha: 0.65),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Text(
        label,
        style: AppTypography.mono(
          fontSize: 9,
          fontWeight: FontWeight.w600,
          color: AppColors.onSurfaceMuted,
          letterSpacing: 0.2,
        ),
      ),
    );
  }
}

class _TeamRow extends StatelessWidget {
  const _TeamRow({
    required this.team,
    required this.setsWon,
    required this.hasScore,
    required this.isWinner,
    required this.isYou,
  });

  final TournamentMatchCardTeamViewModel team;
  final int setsWon;
  final bool hasScore;
  final bool isWinner;
  final bool isYou;

  @override
  Widget build(BuildContext context) {
    final textColor =
        isWinner ? AppColors.onSurface : AppColors.onSurfaceMuted;
    final fontWeight = isWinner ? FontWeight.w700 : FontWeight.w500;
    final scoreColor = isWinner ? AppColors.brand : textColor;
    final scoreLabel = hasScore ? '$setsWon' : '—';

    return Row(
      children: [
        _AvatarStack(players: team.players, isWinner: isWinner),
        const SizedBox(width: 8),
        Expanded(
          child: Row(
            children: [
              Flexible(
                child: Text(
                  team.displayName,
                  style: AppTypography.soraRegular(
                    fontSize: 12,
                    fontWeight: fontWeight,
                    color: textColor,
                  ),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
              ),
              if (isYou) ...[
                const SizedBox(width: 6),
                Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                  decoration: BoxDecoration(
                    color: AppColors.brand.withValues(alpha: 0.15),
                    borderRadius: BorderRadius.circular(6),
                    border: Border.all(
                      color: AppColors.brand.withValues(alpha: 0.5),
                    ),
                  ),
                  child: Text(
                    'VOCÊ',
                    style: AppTypography.mono(
                      fontSize: 7,
                      fontWeight: FontWeight.w700,
                      color: AppColors.brand,
                      letterSpacing: 0.4,
                    ),
                  ),
                ),
              ],
            ],
          ),
        ),
        Text(
          scoreLabel,
          style: AppTypography.soraRegular(
            fontSize: 16,
            fontWeight: fontWeight,
            color: scoreColor,
          ),
        ),
        if (isWinner) ...[
          const SizedBox(width: 4),
          Container(
            width: 3,
            height: 22,
            decoration: BoxDecoration(
              color: AppColors.brand,
              borderRadius: BorderRadius.circular(2),
            ),
          ),
        ],
      ],
    );
  }
}

class _AvatarStack extends StatelessWidget {
  const _AvatarStack({
    required this.players,
    required this.isWinner,
  });

  final List<TournamentMatchCardPlayerViewModel> players;
  final bool isWinner;

  static const _size = 22.0;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: 34,
      height: _size,
      child: Stack(
        clipBehavior: Clip.none,
        children: [
          if (players.isNotEmpty)
            Positioned(
              left: 0,
              child: _AvatarCircle(player: players.first, isWinner: isWinner),
            ),
          if (players.length > 1)
            Positioned(
              left: 12,
              child: _AvatarCircle(player: players[1], isWinner: isWinner),
            ),
        ],
      ),
    );
  }
}

class _AvatarCircle extends StatelessWidget {
  const _AvatarCircle({
    required this.player,
    required this.isWinner,
  });

  final TournamentMatchCardPlayerViewModel player;
  final bool isWinner;

  static const _size = 22.0;

  @override
  Widget build(BuildContext context) {
    final url = player.avatarUrl?.trim();
    final hasPhoto = url != null && url.isNotEmpty;

    return Container(
      width: _size,
      height: _size,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        border: Border.all(
          color: isWinner ? AppColors.win : AppColors.canvas,
          width: isWinner ? 2 : 1.5,
        ),
      ),
      child: ClipOval(
        child: hasPhoto
            ? CachedNetworkImage(
                imageUrl: url,
                width: _size,
                height: _size,
                fit: BoxFit.cover,
                errorWidget: (_, __, ___) => _initials(),
              )
            : _initials(),
      ),
    );
  }

  Widget _initials() {
    return Container(
      color: player.avatarColor,
      alignment: Alignment.center,
      child: Text(
        player.initials,
        style: AppTypography.soraRegular(
          fontSize: 8,
          fontWeight: FontWeight.w700,
          color: AppColors.white,
        ),
      ),
    );
  }
}
