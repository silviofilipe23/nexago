import 'dart:ui';

import 'package:flutter/material.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';

import '../../../../../core/theme/app_colors.dart';
import '../../../domain/match_history/athlete_match_detail_models.dart';
import 'match_detail_team_avatar_stack.dart';

class MatchDetailHeroCard extends StatelessWidget {
  const MatchDetailHeroCard({super.key, required this.detail});

  final AthleteMatchDetail detail;

  @override
  Widget build(BuildContext context) {
    // Fundo full-bleed mora no scaffold — aqui só o placar horizontal.
    return switch (detail.phase) {
      MatchDetailPhase.live => _LiveHero(detail: detail),
      MatchDetailPhase.completed => _CompletedHero(detail: detail),
      MatchDetailPhase.scheduled ||
      MatchDetailPhase.canceled =>
        _ScheduledHero(detail: detail),
    };
  }
}

class _CompletedHero extends StatelessWidget {
  const _CompletedHero({required this.detail});

  final AthleteMatchDetail detail;

  @override
  Widget build(BuildContext context) {
    final accent = detail.isParticipantView
        ? (detail.isWin ? AppColors.win : AppColors.live)
        : Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.55);

    // Um set só: o placar grande é a pontuação do jogo (ex.: 21–18), não 1–0.
    final singleSet = detail.sets.length == 1;
    final ourPoints =
        singleSet ? detail.sets.first.ourScore : detail.ourSetsWon;
    final oppPoints =
        singleSet ? detail.sets.first.opponentScore : detail.opponentSetsWon;

    return _HorizontalMatchHero(
      detail: detail,
      statusAccent: accent,
      statusIcon: detail.isParticipantView && detail.isWin
          ? Icons.emoji_events_rounded
          : null,
      scoreCard: _GlassScoreCard(
        setLabel: 'Placar final',
        ourPoints: ourPoints,
        oppPoints: oppPoints,
        ourSetsWon: detail.ourSetsWon,
        opponentSetsWon: detail.opponentSetsWon,
        bestOf: _bestOfSlots(detail),
        showSetDots: !singleSet && detail.sets.isNotEmpty,
      ),
    );
  }
}

class _LiveHero extends StatelessWidget {
  const _LiveHero({required this.detail});

  final AthleteMatchDetail detail;

  @override
  Widget build(BuildContext context) {
    final setNum =
        (detail.currentSetIndex ??
            (detail.sets.isEmpty ? 0 : detail.sets.length - 1)) +
        1;
    final ourPoints = detail.currentSetOurPoints ?? 0;
    final oppPoints = detail.currentSetOpponentPoints ?? 0;
    final statusLine = [
      detail.resultBadgeLabel,
      if ((detail.statusSubtitle ?? '').trim().isNotEmpty)
        detail.statusSubtitle!.trim(),
    ].join(' | ');

    return _HorizontalMatchHero(
      detail: detail,
      statusLabel: statusLine,
      statusAccent: AppColors.live,
      showLiveDot: true,
      scoreCard: _GlassScoreCard(
        setLabel: 'Set $setNum',
        ourPoints: ourPoints,
        oppPoints: oppPoints,
        ourSetsWon: detail.ourSetsWon,
        opponentSetsWon: detail.opponentSetsWon,
        bestOf: _bestOfSlots(detail),
      ),
    );
  }
}

class _ScheduledHero extends StatelessWidget {
  const _ScheduledHero({required this.detail});

  final AthleteMatchDetail detail;

  @override
  Widget build(BuildContext context) {
    final isCanceled = detail.phase == MatchDetailPhase.canceled;
    final accent = isCanceled ? AppColors.live : AppColors.pending;

    return _HorizontalMatchHero(
      detail: detail,
      statusAccent: accent,
      showLiveDot: !isCanceled,
      scoreCard: _GlassVsCard(
        subtitle: isCanceled
            ? 'Partida cancelada'
            : (detail.scheduleSubtitle?.trim().isNotEmpty == true
                  ? detail.scheduleSubtitle!.trim()
                  : detail.dateTimeLabel),
      ),
    );
  }
}

class _HorizontalMatchHero extends StatelessWidget {
  const _HorizontalMatchHero({
    required this.detail,
    required this.statusAccent,
    required this.scoreCard,
    this.statusLabel,
    this.statusIcon,
    this.showLiveDot = false,
  });

  final AthleteMatchDetail detail;
  final Color statusAccent;
  final Widget scoreCard;
  final String? statusLabel;
  final IconData? statusIcon;
  final bool showLiveDot;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final label = (statusLabel ?? detail.resultBadgeLabel).trim();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.center,
      children: [
        if (detail.stageLabel.trim().isNotEmpty)
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(20),
              border: Border.all(
                color: AppColors.brand.withValues(alpha: 0.85),
              ),
            ),
            child: Text(
              detail.stageLabel.trim().toUpperCase(),
              style: theme.textTheme.labelSmall?.copyWith(
                fontWeight: FontWeight.w800,
                color: AppColors.brand,
                letterSpacing: 0.8,
                fontSize: 10,
              ),
            ),
          ),
        if (detail.stageLabel.trim().isNotEmpty) const SizedBox(height: 6),
        Row(
          mainAxisAlignment: MainAxisAlignment.center,
          mainAxisSize: MainAxisSize.min,
          children: [
            if (showLiveDot) ...[
              Container(
                width: 7,
                height: 7,
                decoration: BoxDecoration(
                  color: statusAccent,
                  shape: BoxShape.circle,
                ),
              ),
              const SizedBox(width: 8),
            ],
            if (statusIcon != null) ...[
              Icon(statusIcon, size: 16, color: statusAccent),
              const SizedBox(width: 6),
            ],
            Flexible(
              child: Text(
                label,
                textAlign: TextAlign.center,
                style: theme.textTheme.labelMedium?.copyWith(
                  fontWeight: FontWeight.w800,
                  color: statusAccent,
                  letterSpacing: 0.2,
                ),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
            ),
          ],
        ),
        const SizedBox(height: 16),
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(
              child: _HorizontalTeamBlock(
                side: detail.ourTeam,
                highlight: detail.isParticipantView ||
                    detail.ourTeam.isCurrentUser,
              ),
            ),
            Padding(
              padding: const EdgeInsets.only(top: 38),
              child: Text(
                'vs',
                style: theme.textTheme.titleMedium?.copyWith(
                  fontWeight: FontWeight.w700,
                  color: context.themeColors.onSurfaceMuted,
                ),
              ),
            ),
            Expanded(child: _HorizontalTeamBlock(side: detail.opponentTeam)),
          ],
        ),
        const SizedBox(height: 18),
        scoreCard,
      ],
    );
  }
}

class _HorizontalTeamBlock extends StatelessWidget {
  const _HorizontalTeamBlock({required this.side, this.highlight = false});

  final MatchTeamSide side;
  final bool highlight;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.center,
      children: [
        MatchDetailTeamAvatarStack(
          players: side.players,
          size: 100,
          stackWidth: 160,
          stackHeight: 100,
        ),
        const SizedBox(height: 8),
        for (final player in side.players.take(2))
          Text(
            player.name?.trim().isNotEmpty == true
                ? player.name!.trim()
                : player.initials,
            textAlign: TextAlign.center,
            style: theme.textTheme.labelSmall?.copyWith(
              fontWeight: FontWeight.w600,
              color: highlight
                  ? AppColors.brand
                  : context.themeColors.onSurface,
              fontSize: 11,
            ),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
          ),
      ],
    );
  }
}


int _bestOfSlots(AthleteMatchDetail detail) {
  final needed = detail.ourSetsWon + detail.opponentSetsWon + 1;
  if (needed <= 1) return 3;
  if (needed <= 3) return 3;
  if (needed <= 5) return 5;
  return needed.clamp(3, 5);
}

class _GlassScoreCard extends StatelessWidget {
  const _GlassScoreCard({
    required this.setLabel,
    required this.ourPoints,
    required this.oppPoints,
    required this.ourSetsWon,
    required this.opponentSetsWon,
    required this.bestOf,
    this.showSetDots = true,
  });

  final String setLabel;
  final int ourPoints;
  final int oppPoints;
  final int ourSetsWon;
  final int opponentSetsWon;
  final int bestOf;
  final bool showSetDots;

  static const _radius = 16.0;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return ClipRRect(
      borderRadius: BorderRadius.circular(_radius),
      child: BackdropFilter(
        filter: ImageFilter.blur(sigmaX: 16, sigmaY: 16),
        child: Container(
          width: double.infinity,
          padding: const EdgeInsets.fromLTRB(16, 14, 16, 14),
          decoration: BoxDecoration(
            color: Colors.white.withValues(alpha: 0.06),
            borderRadius: BorderRadius.circular(_radius),
            border: Border.all(color: Colors.white.withValues(alpha: 0.12)),
          ),
          child: Column(
            children: [
              Text(
                setLabel,
                style: theme.textTheme.labelLarge?.copyWith(
                  fontWeight: FontWeight.w700,
                  color: context.themeColors.onSurface,
                ),
              ),
              const SizedBox(height: 8),
              Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Text(
                    '$ourPoints',
                    style: theme.textTheme.displayMedium?.copyWith(
                      fontWeight: FontWeight.w900,
                      color: AppColors.brand,
                      height: 1,
                    ),
                  ),
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 14),
                    child: Text(
                      ':',
                      style: theme.textTheme.headlineMedium?.copyWith(
                        color: AppColors.brand.withValues(alpha: 0.7),
                        fontWeight: FontWeight.w300,
                      ),
                    ),
                  ),
                  Text(
                    '$oppPoints',
                    style: theme.textTheme.displayMedium?.copyWith(
                      fontWeight: FontWeight.w900,
                      color: context.themeColors.onSurface,
                      height: 1,
                    ),
                  ),
                ],
              ),
              if (showSetDots) ...[
                const SizedBox(height: 12),
                Row(
                  children: [
                    Expanded(
                      child: _SetsWonDots(
                        label: 'Sets ganhos',
                        won: ourSetsWon,
                        slots: bestOf,
                        accent: AppColors.brand,
                        alignEnd: false,
                      ),
                    ),
                    const SizedBox(width: 16),
                    Expanded(
                      child: _SetsWonDots(
                        label: 'Sets ganhos',
                        won: opponentSetsWon,
                        slots: bestOf,
                        accent: context.themeColors.onSurfaceMuted,
                        alignEnd: true,
                      ),
                    ),
                  ],
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

class _GlassVsCard extends StatelessWidget {
  const _GlassVsCard({required this.subtitle});

  final String subtitle;

  static const _radius = 16.0;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return ClipRRect(
      borderRadius: BorderRadius.circular(_radius),
      child: BackdropFilter(
        filter: ImageFilter.blur(sigmaX: 16, sigmaY: 16),
        child: Container(
          width: double.infinity,
          padding: const EdgeInsets.fromLTRB(16, 18, 16, 18),
          decoration: BoxDecoration(
            color: Colors.white.withValues(alpha: 0.06),
            borderRadius: BorderRadius.circular(_radius),
            border: Border.all(color: Colors.white.withValues(alpha: 0.12)),
          ),
          child: Column(
            children: [
              Text(
                'VS',
                style: theme.textTheme.headlineSmall?.copyWith(
                  fontWeight: FontWeight.w900,
                  color: context.themeColors.onSurfaceMuted,
                  letterSpacing: 2,
                ),
              ),
              if (subtitle.trim().isNotEmpty) ...[
                const SizedBox(height: 8),
                Text(
                  subtitle.trim(),
                  textAlign: TextAlign.center,
                  style: theme.textTheme.labelMedium?.copyWith(
                    fontWeight: FontWeight.w600,
                    color: context.themeColors.onSurfaceMuted,
                  ),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

class _SetsWonDots extends StatelessWidget {
  const _SetsWonDots({
    required this.label,
    required this.won,
    required this.slots,
    required this.accent,
    required this.alignEnd,
  });

  final String label;
  final int won;
  final int slots;
  final Color accent;
  final bool alignEnd;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final cross = alignEnd ? CrossAxisAlignment.end : CrossAxisAlignment.start;

    return Column(
      crossAxisAlignment: cross,
      children: [
        Text(
          label,
          style: theme.textTheme.labelSmall?.copyWith(
            color: context.themeColors.onSurfaceMuted,
            fontWeight: FontWeight.w600,
            fontSize: 10,
          ),
        ),
        const SizedBox(height: 6),
        Row(
          mainAxisAlignment: alignEnd
              ? MainAxisAlignment.end
              : MainAxisAlignment.start,
          children: [
            for (var i = 0; i < slots; i++) ...[
              if (i > 0) const SizedBox(width: 6),
              Container(
                width: 10,
                height: 10,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: i < won ? accent : Colors.transparent,
                  border: Border.all(
                    color: i < won
                        ? accent
                        : context.themeColors.onSurfaceMuted.withValues(
                            alpha: 0.45,
                          ),
                    width: 1.5,
                  ),
                ),
              ),
            ],
          ],
        ),
      ],
    );
  }
}


