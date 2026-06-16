import 'package:flutter/material.dart';
import 'package:nexago_app/core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import 'package:nexago_app/core/theme/app_typography.dart';

import '../../../../tournaments/domain/tournament_match.dart';
import '../../../../tournaments/domain/tournament_match_point_event.dart';
import '../../../../tournaments/domain/tournament_match_set.dart';
import '../../../domain/match_ops/match_scoring_logic.dart';

class LiveTableHeader extends StatelessWidget {
  const LiveTableHeader({
    super.key,
    required this.courtLabel,
    required this.metaLabel,
    required this.elapsedLabel,
    required this.onBack,
    this.onMore,
  });

  final String courtLabel;
  final String metaLabel;
  final String elapsedLabel;
  final VoidCallback onBack;
  final VoidCallback? onMore;

  @override
  Widget build(BuildContext context) {
    final court = courtLabel.trim().isNotEmpty ? courtLabel.trim() : '—';
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 4, 16, 8),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _LiveTableIconButton(
            icon: Icons.arrow_back_ios_new_rounded,
            onPressed: onBack,
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Mesa ao vivo · $court',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: AppTypography.mono(
                    fontSize: 10,
                    fontWeight: FontWeight.w700,
                    color: AppColors.brand,
                    letterSpacing: 0.5,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  metaLabel,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: AppTypography.soraRegular(
                    fontSize: 13,
                    fontWeight: FontWeight.w600,
                    color: context.themeColors.onSurfaceMuted,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(width: 8),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
            decoration: BoxDecoration(
              color: context.themeColors.surfaceRaised,
              borderRadius: BorderRadius.circular(10),
              border: Border.all(
                color: context.themeColors.onSurfaceMuted.withValues(
                  alpha: 0.14,
                ),
              ),
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
                const SizedBox(width: 6),
                Text(
                  elapsedLabel,
                  style: AppTypography.mono(
                    fontSize: 13,
                    fontWeight: FontWeight.w800,
                    color: context.themeColors.onSurface,
                  ),
                ),
              ],
            ),
          ),
          if (onMore != null) ...[
            const SizedBox(width: 8),
            _LiveTableIconButton(
              icon: Icons.more_horiz_rounded,
              onPressed: onMore!,
            ),
          ],
        ],
      ),
    );
  }
}

class _LiveTableIconButton extends StatelessWidget {
  const _LiveTableIconButton({required this.icon, required this.onPressed});

  final IconData icon;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: context.themeColors.surfaceRaised,
      borderRadius: BorderRadius.circular(12),
      child: InkWell(
        onTap: onPressed,
        borderRadius: BorderRadius.circular(12),
        child: SizedBox(
          width: 40,
          height: 40,
          child: Icon(icon, size: 18, color: context.themeColors.onSurface),
        ),
      ),
    );
  }
}

class LiveTableSetStrip extends StatelessWidget {
  const LiveTableSetStrip({
    super.key,
    required this.sets,
    required this.currentSetIndex,
    this.bestOf = MatchScoringLogic.defaultBestOf,
  });

  final List<TournamentMatchSet> sets;
  final int currentSetIndex;
  final int bestOf;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 56,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 16),
        itemCount: bestOf,
        separatorBuilder: (_, __) => const SizedBox(width: 8),
        itemBuilder: (context, index) {
          final isActive = index == currentSetIndex;
          final set = index < sets.length ? sets[index] : null;
          final hasStarted = set != null && (set.a > 0 || set.b > 0);
          final scoreA = hasStarted ? '${set.a}' : '–';
          final scoreB = hasStarted ? '${set.b}' : '–';

          return Container(
            width: 88,
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
            decoration: BoxDecoration(
              color: isActive
                  ? AppColors.brand.withValues(alpha: 0.12)
                  : context.themeColors.surfaceRaised,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(
                color: isActive
                    ? AppColors.brand.withValues(alpha: 0.45)
                    : context.themeColors.onSurfaceMuted.withValues(alpha: 0.12),
              ),
            ),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Text(
                  'SET ${index + 1}',
                  style: AppTypography.mono(
                    fontSize: 9,
                    fontWeight: FontWeight.w700,
                    color: isActive
                        ? AppColors.brand
                        : context.themeColors.onSurfaceMuted,
                    letterSpacing: 0.4,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  '$scoreA · $scoreB',
                  style: AppTypography.mono(
                    fontSize: 13,
                    fontWeight: FontWeight.w800,
                    color: context.themeColors.onSurface,
                  ),
                ),
              ],
            ),
          );
        },
      ),
    );
  }
}

class LiveTableServingBanner extends StatelessWidget {
  const LiveTableServingBanner({super.key, required this.teamLabel});

  final String teamLabel;

  @override
  Widget build(BuildContext context) {
    final players = _splitPlayers(teamLabel);
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 4),
      child: Row(
        children: [
          Text(
            'SAQUE',
            style: AppTypography.mono(
              fontSize: 10,
              fontWeight: FontWeight.w700,
              color: context.themeColors.onSurfaceMuted,
              letterSpacing: 0.6,
            ),
          ),
          const SizedBox(width: 10),
          _DualInitialsAvatars(players: players, size: 24),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              teamLabel,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: AppTypography.soraRegular(
                fontSize: 13,
                fontWeight: FontWeight.w700,
                color: context.themeColors.onSurface,
              ),
            ),
          ),
        ],
      ),
    );
  }

  List<String> _splitPlayers(String label) {
    return label
        .split('/')
        .map((p) => p.trim())
        .where((p) => p.isNotEmpty)
        .toList();
  }
}

class LiveTableTeamScoreRow extends StatelessWidget {
  const LiveTableTeamScoreRow({
    super.key,
    required this.teamLabel,
    required this.currentScore,
    required this.isServing,
    required this.onTap,
    this.enabled = true,
    this.completedSets = const [],
  });

  final String teamLabel;
  final int currentScore;
  final bool isServing;
  final VoidCallback? onTap;
  final bool enabled;
  final List<int> completedSets;

  @override
  Widget build(BuildContext context) {
    final players = _splitPlayers(teamLabel);
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
      child: Material(
        color: context.themeColors.surfaceRaised,
        borderRadius: BorderRadius.circular(14),
        child: InkWell(
          onTap: enabled ? onTap : null,
          borderRadius: BorderRadius.circular(14),
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(14),
              border: Border.all(
                color: isServing
                    ? AppColors.brand.withValues(alpha: 0.35)
                    : context.themeColors.onSurfaceMuted.withValues(
                        alpha: 0.1,
                      ),
              ),
            ),
            child: Row(
              children: [
                _DualInitialsAvatars(
                  players: players,
                  overlapRingColor: context.themeColors.surfaceRaised,
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Row(
                    children: [
                      Flexible(
                        child: Text(
                          teamLabel,
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          style: AppTypography.soraRegular(
                            fontSize: 14,
                            fontWeight: FontWeight.w800,
                            color: context.themeColors.onSurface,
                          ),
                        ),
                      ),
                      if (isServing) ...[
                        const SizedBox(width: 6),
                        Container(
                          width: 6,
                          height: 6,
                          decoration: const BoxDecoration(
                            color: AppColors.brand,
                            shape: BoxShape.circle,
                          ),
                        ),
                      ],
                    ],
                  ),
                ),
                if (completedSets.isNotEmpty) ...[
                  for (final score in completedSets) ...[
                    Text(
                      '$score',
                      style: AppTypography.mono(
                        fontSize: 11,
                        fontWeight: FontWeight.w700,
                        color: AppColors.win,
                      ),
                    ),
                    const SizedBox(width: 4),
                  ],
                ],
                Text(
                  '$currentScore',
                  style: AppTypography.mono(
                    fontSize: 32,
                    fontWeight: FontWeight.w800,
                    color: context.themeColors.onSurface,
                    height: 1,
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  List<String> _splitPlayers(String label) {
    return label
        .split('/')
        .map((p) => p.trim())
        .where((p) => p.isNotEmpty)
        .toList();
  }
}

class LiveTableSetRules extends StatelessWidget {
  const LiveTableSetRules({
    super.key,
    required this.rulesLabel,
    this.setPointHint,
  });

  final String rulesLabel;
  final String? setPointHint;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
      child: Row(
        children: [
          Text(
            rulesLabel,
            style: AppTypography.mono(
              fontSize: 11,
              fontWeight: FontWeight.w600,
              color: context.themeColors.onSurfaceMuted,
            ),
          ),
          if (setPointHint != null) ...[
            const SizedBox(width: 12),
            Text(
              setPointHint!,
              style: AppTypography.mono(
                fontSize: 11,
                fontWeight: FontWeight.w700,
                color: AppColors.brand,
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class LiveTableActionBar extends StatelessWidget {
  const LiveTableActionBar({
    super.key,
    required this.onUndo,
    required this.onSwapServe,
    this.enabled = true,
  });

  final VoidCallback? onUndo;
  final VoidCallback? onSwapServe;
  final bool enabled;

  @override
  Widget build(BuildContext context) {
    final mutedBorder = context.themeColors.onSurfaceMuted.withValues(
      alpha: 0.14,
    );
    final style = OutlinedButton.styleFrom(
      foregroundColor: context.themeColors.onSurface,
      backgroundColor: context.themeColors.surfaceRaised,
      side: BorderSide(color: mutedBorder),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      textStyle: AppTypography.soraRegular(
        fontSize: 13,
        fontWeight: FontWeight.w700,
      ),
    );

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      child: Row(
        children: [
          Expanded(
            child: OutlinedButton(
              onPressed: enabled ? onUndo : null,
              style: style,
              child: const Text('Desfazer'),
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: OutlinedButton(
              onPressed: enabled ? onSwapServe : null,
              style: style,
              child: const Text('Trocar saque'),
            ),
          ),
        ],
      ),
    );
  }
}

class LiveTablePointFeed extends StatelessWidget {
  const LiveTablePointFeed({
    super.key,
    required this.setIndex,
    required this.events,
    required this.match,
  });

  final int setIndex;
  final List<TournamentMatchPointEvent> events;
  final TournamentMatch match;

  @override
  Widget build(BuildContext context) {
    final filtered = events
        .where((e) => e.setIndex == setIndex)
        .where((e) => e.isPoint || e.isUndoPoint)
        .toList()
        .reversed
        .take(5)
        .toList();

    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            'ÚLTIMOS PONTOS · SET ${setIndex + 1}',
            style: AppTypography.mono(
              fontSize: 10,
              fontWeight: FontWeight.w700,
              color: context.themeColors.onSurfaceMuted,
              letterSpacing: 0.6,
            ),
          ),
          const SizedBox(height: 10),
          if (filtered.isEmpty)
            Text(
              'Nenhum ponto registrado neste set.',
              style: AppTypography.soraRegular(
                fontSize: 12,
                fontWeight: FontWeight.w500,
                color: context.themeColors.onSurfaceMuted,
              ),
            )
          else
            for (final event in filtered)
              _PointFeedRow(event: event, match: match),
        ],
      ),
    );
  }
}

class _PointFeedRow extends StatelessWidget {
  const _PointFeedRow({required this.event, required this.match});

  final TournamentMatchPointEvent event;
  final TournamentMatch match;

  @override
  Widget build(BuildContext context) {
    final side = event.side ?? 'A';
    final teamLabel = MatchScoringLogic.teamLabelForSide(
      side: side,
      teamADescription: match.teamADescription,
      teamBDescription: match.teamBDescription,
      teamAId: match.teamAId,
      teamBId: match.teamBId,
    );
    final firstName = teamLabel.split('/').first.trim();
    final actionLabel = event.isUndoPoint ? 'Desfeito' : 'Ponto';

    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Row(
        children: [
          Text(
            '${event.scoreA}–${event.scoreB}',
            style: AppTypography.mono(
              fontSize: 12,
              fontWeight: FontWeight.w800,
              color: context.themeColors.onSurface,
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              '$actionLabel · $firstName',
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: AppTypography.soraRegular(
                fontSize: 12,
                fontWeight: FontWeight.w600,
                color: context.themeColors.onSurfaceMuted,
              ),
            ),
          ),
          Text(
            MatchScoringLogic.formatPointEventTime(event.ts),
            style: AppTypography.mono(
              fontSize: 11,
              fontWeight: FontWeight.w600,
              color: context.themeColors.onSurfaceMuted,
            ),
          ),
        ],
      ),
    );
  }
}

class _DualInitialsAvatars extends StatelessWidget {
  const _DualInitialsAvatars({
    required this.players,
    this.size = 28,
    this.overlapRingColor,
  });

  final List<String> players;
  final double size;
  final Color? overlapRingColor;

  @override
  Widget build(BuildContext context) {
    final p1 = players.isNotEmpty ? players.first : '?';
    final p2 = players.length > 1 ? players[1] : '';
    return SizedBox(
      width: size + (p2.isNotEmpty ? size * 0.55 : 0),
      height: size,
      child: Stack(
        clipBehavior: Clip.none,
        children: [
          _InitialAvatar(label: p1, size: size),
          if (p2.isNotEmpty)
            Positioned(
              left: size * 0.55,
              child: _InitialAvatar(
                label: p2,
                size: size,
                ringColor: overlapRingColor,
              ),
            ),
        ],
      ),
    );
  }
}

class _InitialAvatar extends StatelessWidget {
  const _InitialAvatar({
    required this.label,
    required this.size,
    this.ringColor,
  });

  final String label;
  final double size;
  final Color? ringColor;

  @override
  Widget build(BuildContext context) {
    final initials = _initials(label);
    final avatar = CircleAvatar(
      radius: size / 2,
      backgroundColor: context.themeColors.onSurfaceMuted.withValues(
        alpha: 0.18,
      ),
      child: Text(
        initials,
        style: AppTypography.mono(
          fontSize: size * 0.32,
          fontWeight: FontWeight.w800,
          color: context.themeColors.onSurface,
        ),
      ),
    );
    final ring = ringColor;
    if (ring == null) return avatar;
    return Container(
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        border: Border.all(color: ring, width: 2),
      ),
      child: avatar,
    );
  }

  String _initials(String name) {
    final parts = name.trim().split(' ').where((p) => p.isNotEmpty).toList();
    if (parts.isEmpty) return '?';
    if (parts.length == 1) {
      final w = parts.first;
      return w.length >= 2 ? w.substring(0, 2).toUpperCase() : w.toUpperCase();
    }
    return '${parts.first[0]}${parts.last[0]}'.toUpperCase();
  }
}

/// Helpers para montar labels da mesa ao vivo.
String liveTableTeamLabel(String? description, String teamId) {
  final desc = description?.trim();
  if (desc != null && desc.isNotEmpty) return desc;
  final id = teamId.trim();
  return id.isNotEmpty ? id : 'A definir';
}

String liveTableServingTeamLabel(TournamentMatch match) {
  final servingId = match.servingTeamId.trim();
  if (servingId.isEmpty) {
    return liveTableTeamLabel(match.teamADescription, match.teamAId);
  }
  if (servingId == match.teamAId) {
    return liveTableTeamLabel(match.teamADescription, match.teamAId);
  }
  if (servingId == match.teamBId) {
    return liveTableTeamLabel(match.teamBDescription, match.teamBId);
  }
  return liveTableTeamLabel(match.teamADescription, match.teamAId);
}

bool liveTableIsServing(TournamentMatch match, {required bool sideA}) {
  final servingId = match.servingTeamId.trim();
  if (servingId.isEmpty) return sideA;
  return sideA ? servingId == match.teamAId : servingId == match.teamBId;
}

List<int> liveTableCompletedSetScores(
  TournamentMatch match, {
  required bool sideA,
}) {
  final idx = match.currentSetIndex ?? match.sets.length;
  if (match.sets.isEmpty) return const [];
  final end = idx.clamp(0, match.sets.length);
  return [
    for (var i = 0; i < end; i++)
      if (_isCompletedSet(match.sets[i]))
        sideA ? match.sets[i].a : match.sets[i].b,
  ];
}

bool _isCompletedSet(TournamentMatchSet set) {
  return set.endedAt != null ||
      MatchScoringLogic.isSetWon(set.a, set.b) ||
      MatchScoringLogic.isSetWon(set.b, set.a);
}

int liveTableCurrentSetScore(TournamentMatch match, {required bool sideA}) {
  final idx = match.currentSetIndex ??
      (match.sets.isEmpty ? 0 : match.sets.length - 1);
  if (match.sets.isEmpty || idx < 0 || idx >= match.sets.length) return 0;
  final set = match.sets[idx];
  return sideA ? set.a : set.b;
}
