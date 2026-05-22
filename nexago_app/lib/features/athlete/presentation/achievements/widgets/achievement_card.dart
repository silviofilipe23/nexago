import 'package:flutter/material.dart';

import '../../../../../core/theme/app_colors.dart';
import '../../../../../core/theme/app_typography.dart';
import '../../../domain/achievements/achievement_definition.dart';
import '../../../domain/achievements/achievement_status.dart';

class AchievementCard extends StatelessWidget {
  const AchievementCard({super.key, required this.viewModel, this.width = 148});

  final AchievementViewModel viewModel;
  final double width;

  static const _cardRadius = 24.0;
  static const double cardHeight = 188;
  static const _cardHeight = cardHeight;

  static const _unlockedGlow = [
    BoxShadow(color: Color(0x66FF6A1A), blurRadius: 28, spreadRadius: 0),
    BoxShadow(color: Color(0x33FF6A1A), blurRadius: 48, spreadRadius: 4),
  ];

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final def = viewModel.definition;
    final status = viewModel.status;

    final unlocked = status is AchievementUnlocked;
    final inProgress = status is AchievementInProgress;

    return SizedBox(
      width: width,
      height: _cardHeight,
      child: DecoratedBox(
        decoration: BoxDecoration(
          color: unlocked
              ? AppColors.surfaceCard
              : AppColors.surfaceRaised.withValues(alpha: 0.75),
          borderRadius: BorderRadius.circular(_cardRadius),
          border: Border.all(
            color: unlocked
                ? AppColors.brand.withValues(alpha: 0.85)
                : AppColors.onSurfaceMuted.withValues(alpha: 0.14),
            width: unlocked ? 1.2 : 1,
          ),
          boxShadow: unlocked ? _unlockedGlow : null,
        ),
        child: Padding(
          padding: const EdgeInsets.fromLTRB(14, 16, 14, 14),
          child: unlocked
              ? _UnlockedContent(theme: theme, def: def)
              : _LockedOrProgressContent(
                  theme: theme,
                  def: def,
                  inProgress: inProgress,
                  status: status,
                ),
        ),
      ),
    );
  }
}

class _UnlockedContent extends StatelessWidget {
  const _UnlockedContent({required this.theme, required this.def});

  final ThemeData theme;
  final AchievementDefinition def;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.center,
      children: [
        _GradientIconBadge(icon: def.icon),
        const SizedBox(height: 12),
        Text(
          def.title,
          textAlign: TextAlign.center,
          maxLines: 2,
          overflow: TextOverflow.ellipsis,
          style: theme.textTheme.titleMedium?.copyWith(
            fontWeight: FontWeight.w800,
            color: AppColors.onSurface,
            height: 1.1,
            letterSpacing: -0.2,
          ),
        ),
        const SizedBox(height: 6),
        Text(
          def.description,
          textAlign: TextAlign.center,
          maxLines: 2,
          overflow: TextOverflow.ellipsis,
          style: theme.textTheme.bodySmall?.copyWith(
            color: AppColors.onSurfaceMuted.withValues(alpha: 0.95),
            height: 1.3,
          ),
        ),
        const Spacer(),
        Row(
          mainAxisAlignment: MainAxisAlignment.center,
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(
              Icons.check_circle_rounded,
              size: 16,
              color: AppColors.win,
            ),
            const SizedBox(width: 5),
            Text(
              '+${def.xpReward} XP',
              style: AppTypography.xpReward(
                fontSize: theme.textTheme.labelLarge?.fontSize ?? 14,
              ),
            ),
          ],
        ),
      ],
    );
  }
}

class _LockedOrProgressContent extends StatelessWidget {
  const _LockedOrProgressContent({
    required this.theme,
    required this.def,
    required this.inProgress,
    required this.status,
  });

  final ThemeData theme;
  final AchievementDefinition def;
  final bool inProgress;
  final AchievementStatus status;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _IconBox(icon: def.icon, locked: !inProgress),
        const SizedBox(height: 10),
        Text(
          def.title,
          maxLines: 2,
          overflow: TextOverflow.ellipsis,
          style: theme.textTheme.titleSmall?.copyWith(
            fontWeight: FontWeight.w800,
            color: AppColors.onSurfaceMuted.withValues(
              alpha: inProgress ? 0.85 : 0.55,
            ),
            height: 1.15,
          ),
        ),
        const SizedBox(height: 4),
        Text(
          def.description,
          maxLines: 2,
          overflow: TextOverflow.ellipsis,
          style: theme.textTheme.labelSmall?.copyWith(
            color: AppColors.onSurfaceMuted.withValues(alpha: 0.5),
            height: 1.25,
          ),
        ),
        const Spacer(),
        if (inProgress)
          ClipRRect(
            borderRadius: BorderRadius.circular(4),
            child: LinearProgressIndicator(
              value: (status as AchievementInProgress).progress,
              minHeight: 5,
              backgroundColor: AppColors.onSurfaceMuted.withValues(alpha: 0.15),
              color: AppColors.brand,
            ),
          ),
      ],
    );
  }
}

/// Ícone com gradiente laranja (protótipo — conquista desbloqueada).
class _GradientIconBadge extends StatelessWidget {
  const _GradientIconBadge({required this.icon});

  final IconData icon;

  /// Paridade com CSS: linear-gradient(135deg, rgb(255,106,26), rgb(204,0,0)).
  static const _gradient = LinearGradient(
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
    colors: [
      Color(0xFFFF6A1A), // rgb(255, 106, 26)
      Color(0xFFCC0000), // rgb(204, 0, 0)
    ],
  );

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 52,
      height: 52,
      decoration: BoxDecoration(
        gradient: _gradient,
        borderRadius: BorderRadius.circular(14),
        boxShadow: [
          BoxShadow(
            color: AppColors.brand.withValues(alpha: 0.35),
            blurRadius: 12,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: Icon(icon, color: AppColors.black, size: 26),
    );
  }
}

class _IconBox extends StatelessWidget {
  const _IconBox({required this.icon, required this.locked});

  final IconData icon;
  final bool locked;

  @override
  Widget build(BuildContext context) {
    return Stack(
      clipBehavior: Clip.none,
      children: [
        Container(
          width: 44,
          height: 44,
          decoration: BoxDecoration(
            color: AppColors.surfaceCard.withValues(alpha: 0.9),
            borderRadius: BorderRadius.circular(12),
          ),
          child: Icon(
            icon,
            color: AppColors.onSurfaceMuted.withValues(alpha: 0.45),
            size: 24,
          ),
        ),
        if (locked)
          Positioned(
            right: -2,
            bottom: -2,
            child: Container(
              padding: const EdgeInsets.all(2),
              decoration: BoxDecoration(
                color: AppColors.surfaceRaised,
                shape: BoxShape.circle,
                border: Border.all(
                  color: AppColors.onSurfaceMuted.withValues(alpha: 0.2),
                ),
              ),
              child: Icon(
                Icons.lock_rounded,
                size: 12,
                color: AppColors.onSurfaceMuted.withValues(alpha: 0.7),
              ),
            ),
          ),
      ],
    );
  }
}
