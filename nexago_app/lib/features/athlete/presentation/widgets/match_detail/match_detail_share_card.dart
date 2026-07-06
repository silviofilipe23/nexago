import 'package:flutter/material.dart';
import 'package:nexago_app/core/theme/app_typography.dart';

import '../../../../../core/theme/app_colors.dart';
import '../../../domain/match_history/athlete_match_detail_models.dart';
import '../athlete_profile_avatar.dart';

/// Card de partida em tamanho fixo para preview e exportação PNG (Stories / WhatsApp).
class MatchDetailShareCard extends StatelessWidget {
  const MatchDetailShareCard({
    super.key,
    required this.share,
    this.cornerRadius = 0,
  });

  final MatchDetailShareInfo share;
  final double cornerRadius;

  static const designWidth = 360.0;
  static const designHeight = 680.0;

  @override
  Widget build(BuildContext context) {
    final radius = BorderRadius.circular(cornerRadius);

    return SizedBox(
      width: designWidth,
      height: designHeight,
      child: ClipRRect(
        borderRadius: radius,
        child: _ShareCardShell(
          showStripes: share.showDiagonalStripes,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              _ShareCardHeader(
                categoryBadge: share.categoryBadge,
                showLiveBadge: share.showLiveBadge,
              ),
              Expanded(
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(22, 8, 22, 0),
                  child: _ShareCardHero(share: share),
                ),
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
                child: _ShareCardTeamsPanel(share: share),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _ShareCardShell extends StatelessWidget {
  const _ShareCardShell({required this.child, required this.showStripes});

  final Widget child;
  final bool showStripes;

  @override
  Widget build(BuildContext context) {
    return ColoredBox(
      color: AppColors.brand,
      child: Stack(
        fit: StackFit.expand,
        children: [
          if (showStripes)
            const CustomPaint(painter: _DiagonalStripesPainter()),
          Positioned.fill(
            child: DecoratedBox(
              decoration: BoxDecoration(
                gradient: RadialGradient(
                  center: const Alignment(0.85, -0.5),
                  radius: 1.2,
                  colors: [
                    Colors.white.withValues(alpha: 0.12),
                    Colors.transparent,
                  ],
                ),
              ),
            ),
          ),
          child,
        ],
      ),
    );
  }
}

class _DiagonalStripesPainter extends CustomPainter {
  const _DiagonalStripesPainter();

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = Colors.black.withValues(alpha: 0.06)
      ..strokeWidth = 1.2;

    const spacing = 14.0;
    for (var x = -size.height; x < size.width + size.height; x += spacing) {
      canvas.drawLine(
        Offset(x, size.height),
        Offset(x + size.height, 0),
        paint,
      );
    }
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}

class _ShareCardHeader extends StatelessWidget {
  const _ShareCardHeader({
    required this.categoryBadge,
    required this.showLiveBadge,
  });

  final String categoryBadge;
  final bool showLiveBadge;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 20, 20, 0),
      child: Row(
        children: [
          _HeaderLogo(),
          const SizedBox(width: 8),
          Expanded(
            child: Row(
              mainAxisAlignment: MainAxisAlignment.end,
              children: [
                if (showLiveBadge) ...[
                  _LivePill(),
                  if (categoryBadge.isNotEmpty) const SizedBox(width: 8),
                ],
                if (categoryBadge.isNotEmpty)
                  Flexible(
                    child: Align(
                      alignment: Alignment.centerRight,
                      child: _CategoryPill(label: categoryBadge),
                    ),
                  ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _HeaderLogo extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          width: 32,
          height: 32,
          decoration: BoxDecoration(
            color: Colors.black,
            borderRadius: BorderRadius.circular(8),
          ),
          alignment: Alignment.center,
          child: Text(
            'N',
            style: AppTypography.soraRegular(
              fontSize: 16,
              fontWeight: FontWeight.w900,
              color: AppColors.brand,
            ),
          ),
        ),
        const SizedBox(width: 8),
        Text(
          'nexaGO',
          style: AppTypography.soraRegular(
            fontSize: 18,
            fontWeight: FontWeight.w900,
            color: Colors.black,
            letterSpacing: -0.5,
          ),
        ),
      ],
    );
  }
}

class _CategoryPill extends StatelessWidget {
  const _CategoryPill({required this.label});

  final String label;

  @override
  Widget build(BuildContext context) {
    return Container(
      constraints: const BoxConstraints(minWidth: 0),
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(
        color: Colors.black,
        borderRadius: BorderRadius.circular(20),
      ),
      child: Text(
        label,
        style: AppTypography.mono(
          fontSize: 10,
          fontWeight: FontWeight.w800,
          color: Colors.white,
          letterSpacing: 0.5,
        ),
        maxLines: 1,
        overflow: TextOverflow.ellipsis,
        textAlign: TextAlign.right,
      ),
    );
  }
}

class _LivePill extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 5),
      decoration: BoxDecoration(
        color: Colors.black,
        borderRadius: BorderRadius.circular(20),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 6,
            height: 6,
            decoration: const BoxDecoration(
              color: AppColors.live,
              shape: BoxShape.circle,
            ),
          ),
          const SizedBox(width: 5),
          Text(
            'LIVE',
            style: AppTypography.mono(
              fontSize: 9,
              fontWeight: FontWeight.w800,
              color: Colors.white,
              letterSpacing: 0.4,
            ),
          ),
        ],
      ),
    );
  }
}

class _ShareCardHero extends StatelessWidget {
  const _ShareCardHero({required this.share});

  final MatchDetailShareInfo share;

  @override
  Widget build(BuildContext context) {
    final isScheduled = share.variant == MatchDetailShareVariant.scheduled;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if (share.stageLabel.isNotEmpty)
          Text(
            share.stageLabel,
            style: AppTypography.mono(
              fontSize: 11,
              fontWeight: FontWeight.w700,
              color: Colors.black.withValues(alpha: 0.55),
              letterSpacing: 1.2,
            ),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
          ),
        const SizedBox(height: 10),
        Text(
          share.heroTitle,
          style: AppTypography.soraRegular(
            fontSize: isScheduled ? 52 : 48,
            fontWeight: FontWeight.w900,
            color: Colors.black,
            height: 0.95,
            letterSpacing: -1.5,
          ),
        ),
        if (isScheduled && share.heroScheduleLabel.isNotEmpty) ...[
          const SizedBox(height: 12),
          Text(
            share.heroScheduleLabel,
            style: AppTypography.soraRegular(
              fontSize: 28,
              fontWeight: FontWeight.w800,
              color: Colors.black,
              letterSpacing: -0.5,
            ),
          ),
        ] else if (share.heroScoreLabel.isNotEmpty) ...[
          const SizedBox(height: 8),
          Row(
            crossAxisAlignment: CrossAxisAlignment.baseline,
            textBaseline: TextBaseline.alphabetic,
            children: [
              Text(
                share.heroScoreLabel,
                style: AppTypography.soraRegular(
                  fontSize: 44,
                  fontWeight: FontWeight.w900,
                  color: Colors.black,
                  height: 1,
                  letterSpacing: -2,
                ),
              ),
              const SizedBox(width: 8),
              Text(
                'sets',
                style: AppTypography.soraRegular(
                  fontSize: 18,
                  fontWeight: FontWeight.w600,
                  color: Colors.black.withValues(alpha: 0.65),
                ),
              ),
            ],
          ),
        ],
      ],
    );
  }
}

class _ShareCardTeamsPanel extends StatelessWidget {
  const _ShareCardTeamsPanel({required this.share});

  final MatchDetailShareInfo share;

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: BoxDecoration(
        color: const Color(0xFF0B0B0C),
        borderRadius: BorderRadius.circular(20),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.35),
            blurRadius: 20,
            offset: const Offset(0, 8),
          ),
        ],
      ),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            _TeamScoreRow(
              players: share.winnersPlayers,
              label: share.winnersLabel,
              setsWon: share.topRowSetsWon,
              emphasized: share.emphasizeTopRow,
              variant: share.variant,
              showSetsCount: share.variant != MatchDetailShareVariant.scheduled,
            ),
            const SizedBox(height: 12),
            _TeamScoreRow(
              players: share.opponentsPlayers,
              label: share.opponentsLabel,
              setsWon: share.bottomRowSetsWon,
              emphasized: share.emphasizeBottomRow,
              variant: share.variant,
              showSetsCount: share.variant != MatchDetailShareVariant.scheduled,
            ),
            if (share.showSetGrid && share.setPoints.isNotEmpty) ...[
              const SizedBox(height: 14),
              _ShareCardSetGrid(sets: share.setPoints),
            ],
            const SizedBox(height: 14),
            _ShareCardFooter(dateLabel: share.dateLabel),
          ],
        ),
      ),
    );
  }
}

class _TeamScoreRow extends StatelessWidget {
  const _TeamScoreRow({
    required this.players,
    required this.label,
    required this.setsWon,
    required this.emphasized,
    required this.variant,
    required this.showSetsCount,
  });

  final List<MatchTeamPlayer> players;
  final String label;
  final int setsWon;
  final bool emphasized;
  final MatchDetailShareVariant variant;
  final bool showSetsCount;

  @override
  Widget build(BuildContext context) {
    final nameColor = emphasized
        ? Colors.white
        : Colors.white.withValues(alpha: 0.38);
    final useWinGreen =
        variant == MatchDetailShareVariant.victory && emphasized && setsWon > 0;
    final scoreColor = useWinGreen
        ? AppColors.win
        : emphasized
        ? Colors.white
        : Colors.white.withValues(alpha: 0.35);

    return Row(
      children: [
        _AvatarPair(
          players: players,
          dimmed: !emphasized,
          highlightBorder: emphasized && !showSetsCount,
        ),
        const SizedBox(width: 10),
        Expanded(
          child: Text(
            label,
            style: AppTypography.soraRegular(
              fontSize: 14,
              fontWeight: FontWeight.w800,
              color: nameColor,
              height: 1.2,
            ),
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
          ),
        ),
        if (showSetsCount)
          Text(
            '$setsWon',
            style: AppTypography.soraRegular(
              fontSize: 32,
              fontWeight: FontWeight.w900,
              color: scoreColor,
              height: 1,
            ),
          ),
      ],
    );
  }
}

class _AvatarPair extends StatelessWidget {
  const _AvatarPair({
    required this.players,
    this.dimmed = false,
    this.highlightBorder = false,
  });

  final List<MatchTeamPlayer> players;
  final bool dimmed;
  final bool highlightBorder;

  static const _size = 34.0;

  @override
  Widget build(BuildContext context) {
    if (players.isEmpty) {
      return SizedBox(width: _size, height: _size);
    }

    Widget buildAvatar(MatchTeamPlayer player) {
      return Opacity(
        opacity: dimmed ? 0.45 : 1,
        child: Container(
          decoration: highlightBorder
              ? BoxDecoration(
                  shape: BoxShape.circle,
                  border: Border.all(color: AppColors.brand, width: 2),
                )
              : null,
          child: AthleteProfileAvatar(
            size: _size,
            initials: player.initials,
            imageUrl: player.avatarUrl,
          ),
        ),
      );
    }

    return SizedBox(
      width: players.length > 1 ? 54 : _size,
      height: _size,
      child: Stack(
        children: [
          if (players.isNotEmpty)
            Positioned(left: 0, child: buildAvatar(players.first)),
          if (players.length > 1)
            Positioned(right: 0, child: buildAvatar(players[1])),
        ],
      ),
    );
  }
}

class _ShareCardSetGrid extends StatelessWidget {
  const _ShareCardSetGrid({required this.sets});

  final List<MatchDetailShareSetPoint> sets;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        for (var i = 0; i < sets.length; i++) ...[
          if (i > 0) const SizedBox(width: 8),
          Expanded(child: _SetColumn(set: sets[i])),
        ],
      ],
    );
  }
}

class _SetColumn extends StatelessWidget {
  const _SetColumn({required this.set});

  final MatchDetailShareSetPoint set;

  @override
  Widget build(BuildContext context) {
    final isLive = set.isCurrentSet;
    final headerColor = isLive
        ? AppColors.live
        : Colors.white.withValues(alpha: 0.45);
    final scoreColor = isLive
        ? AppColors.live
        : (set.winnersScore >= set.opponentsScore
              ? Colors.white
              : Colors.white.withValues(alpha: 0.4));

    return Column(
      children: [
        Text(
          set.headerLabel.toUpperCase(),
          style: AppTypography.mono(
            fontSize: 9,
            fontWeight: FontWeight.w800,
            color: headerColor,
            letterSpacing: 0.3,
          ),
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
        ),
        const SizedBox(height: 4),
        Text(
          set.scoreLabel,
          style: AppTypography.soraRegular(
            fontSize: 13,
            fontWeight: FontWeight.w800,
            color: scoreColor,
          ),
          textAlign: TextAlign.center,
        ),
      ],
    );
  }
}

class _ShareCardFooter extends StatelessWidget {
  const _ShareCardFooter({required this.dateLabel});

  final String dateLabel;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Expanded(
          child: Text(
            dateLabel.toUpperCase(),
            style: AppTypography.mono(
              fontSize: 9,
              fontWeight: FontWeight.w600,
              color: Colors.white.withValues(alpha: 0.4),
              letterSpacing: 0.3,
            ),
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
          ),
        ),
        Column(
          crossAxisAlignment: CrossAxisAlignment.end,
          children: [
            Text(
              'BAIXE O APP',
              style: AppTypography.mono(
                fontSize: 8,
                fontWeight: FontWeight.w700,
                color: Colors.white.withValues(alpha: 0.35),
                letterSpacing: 0.5,
              ),
            ),
            Text(
              'nexago.app',
              style: AppTypography.soraRegular(
                fontSize: 12,
                fontWeight: FontWeight.w800,
                color: Colors.white,
              ),
            ),
          ],
        ),
      ],
    );
  }
}
