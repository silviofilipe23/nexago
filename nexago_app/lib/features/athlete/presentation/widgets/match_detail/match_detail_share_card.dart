import 'package:flutter/material.dart';
import 'package:nexago_app/core/theme/app_typography.dart';

import '../../../../auth/widgets/auth_form_widgets.dart';
import '../../../../../core/theme/app_colors.dart';
import '../../../domain/match_history/athlete_match_detail_models.dart';
import '../athlete_profile_avatar.dart';

/// Card de vitória em tamanho fixo para preview e exportação PNG (Stories / WhatsApp).
class MatchDetailShareCard extends StatelessWidget {
  const MatchDetailShareCard({
    super.key,
    required this.share,
    this.cornerRadius = 0,
  });

  final MatchDetailShareInfo share;

  /// Cantos do artboard exportado; o preview na UI usa wrapper com raio 24.
  final double cornerRadius;

  /// Largura lógica do artboard; com [pixelRatio] 3 → 1080px de largura na imagem.
  static const designWidth = 360.0;
  static const designHeight = 680.0;
  static const _borderWidth = 2.0;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final radius = cornerRadius;
    final innerRadius = radius > _borderWidth ? radius - _borderWidth : 0.0;
    final outerRadius = radius > 0
        ? BorderRadius.circular(radius)
        : BorderRadius.zero;
    final clipRadius = innerRadius > 0
        ? BorderRadius.circular(innerRadius)
        : BorderRadius.zero;

    final content = Stack(
            fit: StackFit.expand,
            children: [
              const ColoredBox(color: AppColors.canvas),
              Positioned.fill(
                child: DecoratedBox(
                  decoration: BoxDecoration(
                    gradient: RadialGradient(
                      center: const Alignment(0.92, -0.72),
                      radius: 1.1,
                      colors: [
                        AppColors.brand.withValues(alpha: 0.34),
                        AppColors.brand.withValues(alpha: 0.1),
                        Colors.transparent,
                      ],
                      stops: const [0.0, 0.4, 1.0],
                    ),
                  ),
                ),
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(22, 22, 22, 22),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Image.asset(
                      kNexagoLogoAsset,
                      height: 36,
                      fit: BoxFit.contain,
                      alignment: Alignment.centerLeft,
                      errorBuilder: (_, __, ___) =>
                          _LogoTextFallback(theme: theme),
                    ),
                    if (share.dateLabel.isNotEmpty) ...[
                      const SizedBox(height: 10),
                      Text(
                        share.dateLabel,
                        style: theme.textTheme.bodySmall?.copyWith(
                          color: AppColors.onSurfaceMuted,
                          fontWeight: FontWeight.w600,
                          fontSize: 12,
                          height: 1.25,
                        ),
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ],
                    const SizedBox(height: 20),
                    _VictoryStatusRow(label: share.statusLabel),
                    const SizedBox(height: 16),
                    _ShareTeamRow(
                      players: share.winnersPlayers,
                      label: share.winnersLabel,
                      emphasized: true,
                    ),
                    const SizedBox(height: 8),
                    Text(
                      'vs',
                      style: theme.textTheme.labelMedium?.copyWith(
                        color: AppColors.onSurfaceMuted,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    const SizedBox(height: 8),
                    _ShareTeamRow(
                      players: share.opponentsPlayers,
                      label: share.opponentsLabel,
                      emphasized: false,
                    ),
                    const SizedBox(height: 16),
                    Text(
                      share.scoreLabel,
                      style: theme.textTheme.displaySmall?.copyWith(
                        fontWeight: FontWeight.w900,
                        color: AppColors.onSurface,
                        height: 1,
                        letterSpacing: -2,
                        fontSize: 46,
                      ),
                    ),
                    if (share.setPoints.isNotEmpty) ...[
                      const SizedBox(height: 12),
                      _SetPointsRow(sets: share.setPoints),
                    ],
                    const Spacer(),
                    Text(
                      share.stageLabel,
                      style: AppTypography.mono(
                        fontWeight: FontWeight.w800,
                        color: AppColors.brand,
                        letterSpacing: 1.1,
                        fontSize: 11,
                      ),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                    const SizedBox(height: 6),
                    Text(
                      share.tournamentName,
                      style: theme.textTheme.bodyMedium?.copyWith(
                        color: AppColors.onSurfaceMuted.withValues(alpha: 0.92),
                        fontWeight: FontWeight.w500,
                        height: 1.25,
                        fontSize: 13,
                      ),
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ],
                ),
              ),
            ],
    );

    return SizedBox(
      width: designWidth,
      height: designHeight,
      child: DecoratedBox(
        decoration: BoxDecoration(
          color: AppColors.canvas,
          borderRadius: outerRadius,
          border: Border.all(
            color: AppColors.brand,
            width: _borderWidth,
          ),
        ),
        child: innerRadius > 0
            ? ClipRRect(borderRadius: clipRadius, child: content)
            : content,
      ),
    );
  }
}

class _SetPointsRow extends StatelessWidget {
  const _SetPointsRow({required this.sets});

  final List<MatchDetailShareSetPoint> sets;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Row(
      children: [
        for (var i = 0; i < sets.length; i++) ...[
          if (i > 0) const SizedBox(width: 6),
          Expanded(
            child: Container(
              padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 4),
              decoration: BoxDecoration(
                color: AppColors.surfaceCard.withValues(alpha: 0.65),
                borderRadius: BorderRadius.circular(8),
                border: Border.all(
                  color: sets[i].winnersScore > sets[i].opponentsScore
                      ? AppColors.win.withValues(alpha: 0.45)
                      : AppColors.surfaceRaised,
                ),
              ),
              child: Column(
                children: [
                  Text(
                    sets[i].label,
                    style: theme.textTheme.labelSmall?.copyWith(
                      fontWeight: FontWeight.w800,
                      color: AppColors.onSurfaceMuted,
                      fontSize: 8,
                      letterSpacing: 0.2,
                    ),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                  const SizedBox(height: 3),
                  Text(
                    sets[i].scoreLabel,
                    style: theme.textTheme.labelLarge?.copyWith(
                      fontWeight: FontWeight.w900,
                      color: sets[i].winnersScore > sets[i].opponentsScore
                          ? AppColors.win
                          : AppColors.onSurface,
                      fontSize: 13,
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ],
    );
  }
}

class _ShareTeamRow extends StatelessWidget {
  const _ShareTeamRow({
    required this.players,
    required this.label,
    required this.emphasized,
  });

  final List<MatchTeamPlayer> players;
  final String label;
  final bool emphasized;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Row(
      crossAxisAlignment: CrossAxisAlignment.center,
      children: [
        _AvatarPair(players: players),
        const SizedBox(width: 12),
        Expanded(
          child: Text(
            label,
            style: (emphasized
                    ? theme.textTheme.titleMedium
                    : theme.textTheme.bodyLarge)
                ?.copyWith(
              fontWeight: emphasized ? FontWeight.w800 : FontWeight.w600,
              color: emphasized
                  ? AppColors.onSurface
                  : AppColors.onSurfaceMuted,
              height: 1.15,
              fontSize: emphasized ? 17 : 15,
            ),
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
          ),
        ),
      ],
    );
  }
}

class _AvatarPair extends StatelessWidget {
  const _AvatarPair({required this.players});

  final List<MatchTeamPlayer> players;

  static const _size = 36.0;

  @override
  Widget build(BuildContext context) {
    if (players.isEmpty) {
      return const SizedBox(width: _size, height: _size);
    }

    return SizedBox(
      width: players.length > 1 ? 58 : _size,
      height: _size,
      child: Stack(
        children: [
          if (players.isNotEmpty)
            Positioned(
              left: 0,
              child: AthleteProfileAvatar(
                size: _size,
                initials: players.first.initials,
                imageUrl: players.first.avatarUrl,
              ),
            ),
          if (players.length > 1)
            Positioned(
              right: 0,
              child: AthleteProfileAvatar(
                size: _size,
                initials: players[1].initials,
                imageUrl: players[1].avatarUrl,
              ),
            ),
        ],
      ),
    );
  }
}

class _VictoryStatusRow extends StatelessWidget {
  const _VictoryStatusRow({required this.label});

  final String label;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          width: 8,
          height: 8,
          decoration: const BoxDecoration(
            color: AppColors.win,
            shape: BoxShape.circle,
          ),
        ),
        const SizedBox(width: 9),
        Text(
          label.toUpperCase(),
          style: AppTypography.mono(
            fontWeight: FontWeight.w800,
            color: AppColors.win,
            letterSpacing: 0.7,
            fontSize: 12,
          ),
        ),
      ],
    );
  }
}

class _LogoTextFallback extends StatelessWidget {
  const _LogoTextFallback({required this.theme});

  final ThemeData theme;

  @override
  Widget build(BuildContext context) {
    return Text.rich(
      TextSpan(
        children: [
          TextSpan(
            text: 'nexa',
            style: theme.textTheme.titleMedium?.copyWith(
              fontWeight: FontWeight.w900,
              color: AppColors.onSurface,
            ),
          ),
          TextSpan(
            text: 'GO',
            style: theme.textTheme.titleMedium?.copyWith(
              fontWeight: FontWeight.w900,
              color: AppColors.brand,
            ),
          ),
        ],
      ),
    );
  }
}
