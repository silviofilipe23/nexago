import 'package:flutter/material.dart';

import '../../../../../core/theme/app_colors.dart';
import '../../../domain/match_history/athlete_match_detail_models.dart';
import '../athlete_profile_avatar.dart';

class MatchDetailHeroCard extends StatelessWidget {
  const MatchDetailHeroCard({super.key, required this.detail});

  final AthleteMatchDetail detail;

  @override
  Widget build(BuildContext context) {
    return switch (detail.phase) {
      MatchDetailPhase.scheduled => _ScheduledHero(detail: detail),
      MatchDetailPhase.live => _LiveHero(detail: detail),
      MatchDetailPhase.completed => _CompletedHero(detail: detail),
      MatchDetailPhase.canceled => _ScheduledHero(detail: detail),
    };
  }
}

class _CompletedHero extends StatelessWidget {
  const _CompletedHero({required this.detail});

  final AthleteMatchDetail detail;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final accent = detail.isParticipantView
        ? (detail.isWin ? AppColors.win : AppColors.live)
        : AppColors.onSurfaceMuted;

    return _HeroShell(
      gradientColors: const [Color(0xFF0D1F14), Color(0xFF0A1510)],
      borderColor: accent.withValues(alpha: 0.3),
      child: Column(
        children: [
          _StageLabel(label: detail.stageLabel),
          const SizedBox(height: 12),
          _StatusRow(
            icon: detail.isParticipantView && detail.isWin
                ? Icons.emoji_events_rounded
                : null,
            label: detail.resultBadgeLabel,
            accent: accent,
          ),
          const SizedBox(height: 20),
          _VerticalTeamBlock(
            side: detail.ourTeam,
            highlight: detail.isParticipantView,
          ),
          const SizedBox(height: 16),
          Text(
            detail.matchScoreLabel,
            style: theme.textTheme.displaySmall?.copyWith(
              fontWeight: FontWeight.w900,
              color: AppColors.onSurface,
              letterSpacing: -1,
              height: 1,
            ),
          ),
          const SizedBox(height: 16),
          _VerticalTeamBlock(side: detail.opponentTeam),
          if (detail.sets.isNotEmpty) ...[
            const SizedBox(height: 20),
            _SetChipsRow(sets: detail.sets, highlightWins: detail.isParticipantView),
          ],
        ],
      ),
    );
  }
}

class _LiveHero extends StatelessWidget {
  const _LiveHero({required this.detail});

  final AthleteMatchDetail detail;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return _HeroShell(
      gradientColors: const [Color(0xFF1A0A0A), Color(0xFF0D0808)],
      borderColor: AppColors.live.withValues(alpha: 0.35),
      child: Column(
        children: [
          _StageLabel(label: detail.stageLabel),
          const SizedBox(height: 12),
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              _StatusRow(
                label: detail.resultBadgeLabel,
                accent: AppColors.live,
                showDot: true,
              ),
              if (detail.statusSubtitle != null) ...[
                const SizedBox(width: 10),
                Text(
                  detail.statusSubtitle!,
                  style: theme.textTheme.labelSmall?.copyWith(
                    color: AppColors.onSurfaceMuted,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ],
            ],
          ),
          const SizedBox(height: 20),
          _VerticalTeamBlock(
            side: detail.ourTeam,
            highlight: detail.ourTeam.isCurrentUser,
          ),
          const SizedBox(height: 12),
          Text(
            detail.matchScoreLabel,
            style: theme.textTheme.displayMedium?.copyWith(
              fontWeight: FontWeight.w900,
              color: AppColors.brand,
              letterSpacing: -1,
            ),
          ),
          Text(
            'SETS GANHOS',
            style: theme.textTheme.labelSmall?.copyWith(
              color: AppColors.onSurfaceMuted,
              fontWeight: FontWeight.w800,
              letterSpacing: 0.8,
              fontSize: 9,
            ),
          ),
          const SizedBox(height: 12),
          _VerticalTeamBlock(side: detail.opponentTeam),
          if (detail.sets.isNotEmpty) ...[
            const SizedBox(height: 20),
            _SetChipsRow(
              sets: detail.sets,
              highlightWins: true,
              liveMode: true,
            ),
          ],
          if (detail.currentSetOurPoints != null &&
              detail.currentSetOpponentPoints != null) ...[
            const SizedBox(height: 12),
            Container(
              width: double.infinity,
              padding: const EdgeInsets.symmetric(vertical: 10),
              decoration: BoxDecoration(
                color: AppColors.surfaceCard.withValues(alpha: 0.5),
                borderRadius: BorderRadius.circular(10),
                border: Border.all(
                  color: AppColors.live.withValues(alpha: 0.4),
                ),
              ),
              child: Text(
                _liveSetBanner(detail),
                textAlign: TextAlign.center,
                style: theme.textTheme.labelMedium?.copyWith(
                  fontWeight: FontWeight.w800,
                  color: AppColors.live,
                  letterSpacing: 0.3,
                ),
              ),
            ),
          ],
        ],
      ),
    );
  }

  String _liveSetBanner(AthleteMatchDetail detail) {
    final idx = detail.currentSetIndex ?? (detail.sets.length - 1);
    final setNum = idx + 1;
    final our = detail.currentSetOurPoints!;
    final opp = detail.currentSetOpponentPoints!;
    return 'SET $setNum • $our-$opp • ATÉ 21';
  }
}

class _ScheduledHero extends StatelessWidget {
  const _ScheduledHero({required this.detail});

  final AthleteMatchDetail detail;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return _HeroShell(
      gradientColors: const [Color(0xFF12100A), Color(0xFF0B0B0C)],
      borderColor: AppColors.brand.withValues(alpha: 0.35),
      child: Column(
        children: [
          _StageLabel(label: detail.stageLabel),
          const SizedBox(height: 12),
          _StatusRow(
            label: detail.resultBadgeLabel,
            accent: AppColors.pending,
            showDot: true,
          ),
          const SizedBox(height: 20),
          _VerticalTeamBlock(
            side: detail.ourTeam,
            highlight: detail.ourTeam.isCurrentUser,
          ),
          const SizedBox(height: 16),
          Text(
            'VS',
            style: theme.textTheme.headlineSmall?.copyWith(
              fontWeight: FontWeight.w900,
              color: AppColors.onSurfaceMuted,
            ),
          ),
          const SizedBox(height: 16),
          _VerticalTeamBlock(side: detail.opponentTeam),
        ],
      ),
    );
  }
}

class _HeroShell extends StatelessWidget {
  const _HeroShell({
    required this.gradientColors,
    required this.borderColor,
    required this.child,
  });

  final List<Color> gradientColors;
  final Color borderColor;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(16),
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: gradientColors,
        ),
        border: Border.all(color: borderColor),
      ),
      padding: const EdgeInsets.fromLTRB(16, 18, 16, 16),
      child: child,
    );
  }
}

class _StageLabel extends StatelessWidget {
  const _StageLabel({required this.label});

  final String label;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    if (label.isEmpty) return const SizedBox.shrink();

    return Text(
      label,
      textAlign: TextAlign.center,
      style: theme.textTheme.labelSmall?.copyWith(
        fontWeight: FontWeight.w800,
        color: AppColors.brand,
        letterSpacing: 1.1,
        fontSize: 10,
      ),
    );
  }
}

class _StatusRow extends StatelessWidget {
  const _StatusRow({
    required this.label,
    required this.accent,
    this.icon,
    this.showDot = false,
  });

  final String label;
  final Color accent;
  final IconData? icon;
  final bool showDot;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        if (showDot) ...[
          Container(
            width: 6,
            height: 6,
            decoration: BoxDecoration(color: accent, shape: BoxShape.circle),
          ),
          const SizedBox(width: 8),
        ],
        if (icon != null) ...[
          Icon(icon, size: 16, color: accent),
          const SizedBox(width: 6),
        ],
        Flexible(
          child: Text(
            label,
            textAlign: TextAlign.center,
            style: theme.textTheme.labelMedium?.copyWith(
              fontWeight: FontWeight.w800,
              color: accent,
              letterSpacing: 0.3,
            ),
          ),
        ),
      ],
    );
  }
}

class _VerticalTeamBlock extends StatelessWidget {
  const _VerticalTeamBlock({
    required this.side,
    this.highlight = false,
  });

  final MatchTeamSide side;
  final bool highlight;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final roleColor = side.isCurrentUser || highlight
        ? AppColors.brand
        : AppColors.onSurfaceMuted;

    return Column(
      children: [
        _AvatarStack(players: side.players),
        const SizedBox(height: 10),
        Text(
          side.label,
          textAlign: TextAlign.center,
          style: theme.textTheme.titleMedium?.copyWith(
            fontWeight: FontWeight.w800,
            color: AppColors.onSurface,
          ),
          maxLines: 2,
          overflow: TextOverflow.ellipsis,
        ),
        if (side.roleLabel.isNotEmpty) ...[
          const SizedBox(height: 4),
          Text(
            side.roleLabel,
            style: theme.textTheme.labelSmall?.copyWith(
              fontWeight: FontWeight.w800,
              color: roleColor,
              letterSpacing: 0.4,
            ),
          ),
        ],
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
              child: AthleteProfileAvatar(
                size: 44,
                initials: players.first.initials,
                imageUrl: players.first.avatarUrl,
              ),
            ),
          if (players.length > 1)
            Positioned(
              right: 0,
              child: AthleteProfileAvatar(
                size: 44,
                initials: players[1].initials,
                imageUrl: players[1].avatarUrl,
              ),
            ),
        ],
      ),
    );
  }
}

class _SetChipsRow extends StatelessWidget {
  const _SetChipsRow({
    required this.sets,
    required this.highlightWins,
    this.liveMode = false,
  });

  final List<MatchSetScore> sets;
  final bool highlightWins;
  final bool liveMode;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Row(
      children: [
        for (var i = 0; i < sets.length; i++) ...[
          if (i > 0) const SizedBox(width: 8),
          Expanded(
            child: _SetChip(
              set: sets[i],
              theme: theme,
              highlightWins: highlightWins,
              liveMode: liveMode,
            ),
          ),
        ],
      ],
    );
  }
}

class _SetChip extends StatelessWidget {
  const _SetChip({
    required this.set,
    required this.theme,
    required this.highlightWins,
    required this.liveMode,
  });

  final MatchSetScore set;
  final ThemeData theme;
  final bool highlightWins;
  final bool liveMode;

  @override
  Widget build(BuildContext context) {
    final isCurrent = liveMode && set.isCurrentSet;
    final borderColor = isCurrent
        ? AppColors.live.withValues(alpha: 0.6)
        : (highlightWins && set.isWin
            ? AppColors.win.withValues(alpha: 0.5)
            : AppColors.surfaceRaised);
    final labelColor = isCurrent
        ? AppColors.live
        : (highlightWins && set.isWin
            ? AppColors.win
            : AppColors.onSurfaceMuted);

    return Container(
      padding: const EdgeInsets.symmetric(vertical: 10, horizontal: 6),
      decoration: BoxDecoration(
        color: AppColors.surfaceCard.withValues(alpha: 0.6),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: borderColor),
      ),
      child: Column(
        children: [
          Text(
            set.label.toUpperCase(),
            style: theme.textTheme.labelSmall?.copyWith(
              fontWeight: FontWeight.w800,
              color: labelColor,
              fontSize: 9,
              letterSpacing: 0.3,
            ),
          ),
          const SizedBox(height: 4),
          RichText(
            textAlign: TextAlign.center,
            text: TextSpan(
              style: theme.textTheme.titleSmall?.copyWith(
                fontWeight: FontWeight.w900,
                color: AppColors.onSurface,
              ),
              children: [
                TextSpan(
                  text: '${set.ourScore}',
                  style: TextStyle(
                    color: highlightWins && set.isWin
                        ? AppColors.win
                        : AppColors.onSurface,
                  ),
                ),
                const TextSpan(text: ' - '),
                TextSpan(
                  text: '${set.opponentScore}',
                  style: TextStyle(
                    color: highlightWins && !set.isWin && set.opponentScore > set.ourScore
                        ? AppColors.win
                        : AppColors.onSurface,
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
