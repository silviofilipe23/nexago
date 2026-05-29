import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';

import '../../../../../core/theme/app_colors.dart';
import '../../../domain/match_history/athlete_match_detail_models.dart';

class MatchDetailSummaryCard extends StatelessWidget {
  const MatchDetailSummaryCard({super.key, required this.detail});

  final AthleteMatchDetail detail;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isWin = detail.isWin;
    final accent = isWin ? AppColors.win : AppColors.live;

    return Container(
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(16),
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [
            const Color(0xFF0D1F14),
            const Color(0xFF0A1510).withValues(alpha: 0.95),
          ],
        ),
        border: Border.all(color: accent.withValues(alpha: 0.25)),
      ),
      padding: const EdgeInsets.fromLTRB(16, 18, 16, 16),
      child: Column(
        children: [
          _ResultBadge(label: detail.resultBadgeLabel, accent: accent),
          const SizedBox(height: 20),
          Row(
            children: [
              Expanded(child: _TeamColumn(side: detail.ourTeam, accent: accent)),
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 8),
                child: Text(
                  'vs',
                  style: theme.textTheme.labelMedium?.copyWith(
                    color: AppColors.onSurfaceMuted,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
              Expanded(
                child: _TeamColumn(side: detail.opponentTeam, accent: accent),
              ),
            ],
          ),
          const SizedBox(height: 20),
          Row(
            children: [
              for (var i = 0; i < detail.sets.length; i++) ...[
                if (i > 0) const SizedBox(width: 8),
                Expanded(
                  child: _SetBox(
                    set: detail.sets[i],
                    highlight: detail.sets[i].isWin,
                  ),
                ),
              ],
            ],
          ),
        ],
      ),
    );
  }
}

class _ResultBadge extends StatelessWidget {
  const _ResultBadge({required this.label, required this.accent});

  final String label;
  final Color accent;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
      decoration: BoxDecoration(
        color: accent.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: accent.withValues(alpha: 0.35)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 6,
            height: 6,
            decoration: BoxDecoration(
              color: accent,
              shape: BoxShape.circle,
            ),
          ),
          const SizedBox(width: 8),
          Text(
            label,
            style: theme.textTheme.labelMedium?.copyWith(
              fontWeight: FontWeight.w800,
              color: accent,
              letterSpacing: 0.4,
            ),
          ),
        ],
      ),
    );
  }
}

class _TeamColumn extends StatelessWidget {
  const _TeamColumn({required this.side, required this.accent});

  final MatchTeamSide side;
  final Color accent;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final roleColor =
        side.isCurrentUser ? AppColors.brand : AppColors.onSurfaceMuted;

    return Column(
      children: [
        _AvatarStack(players: side.players),
        const SizedBox(height: 10),
        Text(
          side.label,
          textAlign: TextAlign.center,
          style: theme.textTheme.titleSmall?.copyWith(
            fontWeight: FontWeight.w800,
            color: AppColors.onSurface,
          ),
          maxLines: 2,
          overflow: TextOverflow.ellipsis,
        ),
        const SizedBox(height: 4),
        Text(
          side.roleLabel,
          style: theme.textTheme.labelSmall?.copyWith(
            fontWeight: FontWeight.w800,
            color: roleColor,
            letterSpacing: 0.5,
          ),
        ),
      ],
    );
  }
}

class _AvatarStack extends StatelessWidget {
  const _AvatarStack({required this.players});

  final List<MatchTeamPlayer> players;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 52,
      width: 72,
      child: Stack(
        alignment: Alignment.center,
        children: [
          if (players.isNotEmpty)
            Positioned(
              left: 0,
              child: _AvatarCircle(player: players.first),
            ),
          if (players.length > 1)
            Positioned(
              right: 0,
              child: _AvatarCircle(player: players[1]),
            ),
        ],
      ),
    );
  }
}

class _AvatarCircle extends StatelessWidget {
  const _AvatarCircle({required this.player});

  final MatchTeamPlayer player;

  static const _size = 44.0;

  @override
  Widget build(BuildContext context) {
    final url = player.avatarUrl?.trim();
    final hasPhoto = url != null && url.isNotEmpty;
    final backgroundColor = Color(player.avatarColor);

    return Container(
      width: _size,
      height: _size,
      decoration: BoxDecoration(
        color: hasPhoto ? null : backgroundColor,
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
                placeholder: (_, __) => _initialsFallback(backgroundColor),
                errorWidget: (_, __, ___) => _initialsFallback(backgroundColor),
              )
            : _initialsFallback(backgroundColor),
      ),
    );
  }

  Widget _initialsFallback(Color backgroundColor) {
    return Container(
      width: _size,
      height: _size,
      alignment: Alignment.center,
      color: backgroundColor,
      child: Text(
        player.initials,
        style: const TextStyle(
          fontWeight: FontWeight.w900,
          fontSize: 13,
          color: AppColors.white,
        ),
      ),
    );
  }
}

class _SetBox extends StatelessWidget {
  const _SetBox({required this.set, required this.highlight});

  final MatchSetScore set;
  final bool highlight;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scoreColor = highlight ? AppColors.win : AppColors.onSurface;

    return Container(
      padding: const EdgeInsets.symmetric(vertical: 10, horizontal: 6),
      decoration: BoxDecoration(
        color: AppColors.surfaceCard.withValues(alpha: 0.6),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(
          color: highlight
              ? AppColors.win.withValues(alpha: 0.5)
              : AppColors.surfaceRaised,
        ),
      ),
      child: Column(
        children: [
          Text(
            set.label,
            style: theme.textTheme.labelSmall?.copyWith(
              fontWeight: FontWeight.w800,
              color: AppColors.onSurfaceMuted,
              fontSize: 9,
              letterSpacing: 0.3,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            '${set.ourScore} - ${set.opponentScore}',
            style: theme.textTheme.titleSmall?.copyWith(
              fontWeight: FontWeight.w900,
              color: scoreColor,
            ),
          ),
        ],
      ),
    );
  }
}
