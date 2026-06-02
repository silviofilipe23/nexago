import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:nexago_app/core/theme/app_typography.dart';

import '../../../../core/theme/app_colors.dart';
import '../../domain/tournament_match_card_view_model.dart';
import '../../domain/tournament_match_display.dart';

class TournamentMatchCard extends StatelessWidget {
  const TournamentMatchCard({
    super.key,
    required this.viewModel,
    this.isAthleteMatch = false,
    this.onTap,
  });

  final TournamentMatchCardViewModel viewModel;
  final bool isAthleteMatch;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final match = viewModel.match;
    final isLive = match.isInProgress;
    final counts = setsWonCountForMatch(match);
    final hasScore = matchHasScoreData(match);
    final teamAWon = isMatchTeamWinner(match, isTeamA: true);
    final teamBWon = isMatchTeamWinner(match, isTeamA: false);
    final timeLabel = matchTimeLabelForCard(match);
    final metaLabel = matchMetaLabelForCard(match);
    final borderColor = isLive
        ? AppColors.brand.withValues(alpha: 0.55)
        : isAthleteMatch
            ? AppColors.brand.withValues(alpha: 0.85)
            : AppColors.onSurfaceMuted.withValues(alpha: 0.12);
    final borderWidth = isAthleteMatch && !isLive ? 2.0 : 1.0;
    final backgroundColor = isAthleteMatch && !isLive
        ? AppColors.brand.withValues(alpha: 0.06)
        : AppColors.surfaceRaised;

    final content = Padding(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      child: Column(
        children: [
          if (metaLabel.isNotEmpty || timeLabel.isNotEmpty) ...[
            Row(
              children: [
                if (metaLabel.isNotEmpty)
                  Expanded(
                    child: Text(
                      metaLabel,
                      style: AppTypography.mono(
                        fontSize: 11,
                        fontWeight: FontWeight.w600,
                        color: AppColors.onSurfaceMuted,
                        letterSpacing: 0.3,
                      ),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                  )
                else
                  const Spacer(),
                if (timeLabel.isNotEmpty)
                  Text(
                    timeLabel,
                    style: AppTypography.mono(
                      fontSize: 11,
                      fontWeight: FontWeight.w600,
                      color: isLive
                          ? AppColors.brand
                          : AppColors.onSurfaceMuted,
                      letterSpacing: 0.3,
                    ),
                  ),
              ],
            ),
            const SizedBox(height: 6),
          ],
          _TeamRow(
            team: viewModel.teamA,
            setsWon: counts.$1,
            hasScore: hasScore,
            isWinner: teamAWon,
            partialsLabel: setPartialsLabelForTeam(match: match, isTeamA: true),
          ),
          Divider(
            height: 17,
            thickness: 1,
            color: AppColors.onSurfaceMuted.withValues(alpha: 0.12),
          ),
          _TeamRow(
            team: viewModel.teamB,
            setsWon: counts.$2,
            hasScore: hasScore,
            isWinner: teamBWon,
            partialsLabel: setPartialsLabelForTeam(match: match, isTeamA: false),
          ),
        ],
      ),
    );

    final card = Container(
      margin: const EdgeInsets.fromLTRB(20, 0, 20, 8),
      decoration: BoxDecoration(
        color: backgroundColor,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: borderColor, width: borderWidth),
      ),
      clipBehavior: Clip.antiAlias,
      child: onTap == null
          ? content
          : Material(
              color: Colors.transparent,
              child: InkWell(
                onTap: onTap,
                child: content,
              ),
            ),
    );

    return card;
  }
}

class _TeamRow extends StatelessWidget {
  const _TeamRow({
    required this.team,
    required this.setsWon,
    required this.hasScore,
    required this.isWinner,
    required this.partialsLabel,
  });

  final TournamentMatchCardTeamViewModel team;
  final int setsWon;
  final bool hasScore;
  final bool isWinner;
  final String partialsLabel;

  @override
  Widget build(BuildContext context) {
    final textColor =
        isWinner ? AppColors.onSurface : AppColors.onSurfaceMuted;
    final fontWeight = isWinner ? FontWeight.w700 : FontWeight.w400;
    final scoreLabel = hasScore ? '$setsWon' : '—';
    final partialsColor = isWinner
        ? AppColors.onSurface.withValues(alpha: 0.72)
        : AppColors.onSurfaceMuted.withValues(alpha: 0.85);

    return Row(
      crossAxisAlignment: CrossAxisAlignment.center,
      children: [
        _AvatarStack(players: team.players),
        const SizedBox(width: 10),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                team.displayName,
                style: AppTypography.soraRegular(
                  fontSize: 14,
                  fontWeight: fontWeight,
                  color: textColor,
                ),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
              if (partialsLabel.isNotEmpty) ...[
                const SizedBox(height: 2),
                Text(
                  partialsLabel,
                  style: AppTypography.mono(
                    fontSize: 11,
                    fontWeight: FontWeight.w600,
                    color: partialsColor,
                    letterSpacing: 0.2,
                  ),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
              ],
            ],
          ),
        ),
        const SizedBox(width: 8),
        Text(
          scoreLabel,
          style: AppTypography.soraRegular(
            fontSize: 15,
            fontWeight: fontWeight,
            color: textColor,
          ),
        ),
      ],
    );
  }
}

class _AvatarStack extends StatelessWidget {
  const _AvatarStack({required this.players});

  final List<TournamentMatchCardPlayerViewModel> players;

  static const _size = 28.0;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: _size,
      width: 44,
      child: Stack(
        clipBehavior: Clip.none,
        children: [
          if (players.isNotEmpty)
            Positioned(
              left: 0,
              child: _AvatarCircle(player: players.first),
            ),
          if (players.length > 1)
            Positioned(
              left: 16,
              child: _AvatarCircle(player: players[1]),
            ),
          if (players.isEmpty)
            const Positioned(
              left: 0,
              child: _AvatarCircle(
                player: TournamentMatchCardPlayerViewModel(
                  initials: '?',
                  avatarColor: Color(0xFF5B8DEF),
                ),
              ),
            ),
        ],
      ),
    );
  }
}

class _AvatarCircle extends StatelessWidget {
  const _AvatarCircle({required this.player});

  final TournamentMatchCardPlayerViewModel player;

  static const _size = 28.0;

  @override
  Widget build(BuildContext context) {
    final url = player.avatarUrl?.trim();
    final hasPhoto = url != null && url.isNotEmpty;

    return Container(
      width: _size,
      height: _size,
      decoration: BoxDecoration(
        color: hasPhoto ? null : player.avatarColor,
        shape: BoxShape.circle,
        border: Border.all(color: AppColors.canvas, width: 2),
      ),
      child: ClipOval(
        child: hasPhoto
            ? CachedNetworkImage(
                imageUrl: url,
                width: _size,
                height: _size,
                fit: BoxFit.cover,
                placeholder: (_, __) => _initialsFallback(),
                errorWidget: (_, __, ___) => _initialsFallback(),
              )
            : _initialsFallback(),
      ),
    );
  }

  Widget _initialsFallback() {
    return Container(
      width: _size,
      height: _size,
      alignment: Alignment.center,
      color: player.avatarColor,
      child: Text(
        player.initials,
        style: AppTypography.soraRegular(
          fontSize: 10,
          fontWeight: FontWeight.w700,
          color: AppColors.white,
        ),
      ),
    );
  }
}
