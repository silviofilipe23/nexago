import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:nexago_app/core/theme/app_typography.dart';

import '../../../../../core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../domain/athlete_quest/athlete_quest_logic.dart';
import '../../../domain/gamification_models.dart';
import '../athlete_profile_avatar.dart';
import '../../widgets/athlete_settings/athlete_settings_helpers.dart';

class AthleteHomeHeader extends StatelessWidget {
  const AthleteHomeHeader({
    super.key,
    required this.displayName,
    required this.summary,
    this.avatarUrl,
    this.onAvatarTap,
    this.onXpTap,
    this.onNotificationsTap,
    this.unreadNotificationCount = 0,
  });

  final String displayName;
  final GamificationSummary summary;
  final String? avatarUrl;
  final VoidCallback? onAvatarTap;
  final VoidCallback? onXpTap;
  final VoidCallback? onNotificationsTap;
  final int unreadNotificationCount;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final now = DateTime.now();
    final dateLine = DateFormat(
      'EEE · d MMM · HH:mm',
      'pt_BR',
    ).format(now).toUpperCase().replaceAll('.', '');
    final firstName = _firstName(displayName);
    final initials = athleteInitialsFromName(displayName);
    final xpCurrent = summary.xpInCurrentLevel;
    final xpGoal = 100;
    final displayLevel = gamificationDisplayLevel(summary);

    const avatarSize = 48.0;
    const avatarSlotSize = 56.0;

    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        GestureDetector(
          onTap: onAvatarTap,
          child: SizedBox(
            width: avatarSlotSize,
            height: avatarSlotSize,
            child: Stack(
              clipBehavior: Clip.none,
              children: [
                Positioned(
                  left: 0,
                  top: 0,
                  child: AthleteProfileAvatar(
                    size: avatarSize,
                    initials: initials,
                    imageUrl: avatarUrl,
                  ),
                ),
                Positioned(
                  right: 0,
                  bottom: 0,
                  child: Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 6,
                      vertical: 3,
                    ),
                    decoration: BoxDecoration(
                      color: AppColors.brand,
                      borderRadius: BorderRadius.circular(8),
                      border: Border.all(color: AppColors.black, width: 2),
                    ),
                    child: Text(
                      '$displayLevel',
                      style: theme.textTheme.labelSmall?.copyWith(
                        fontWeight: FontWeight.w900,
                        color: AppColors.black,
                        fontSize: 10,
                        letterSpacing: 0.3,
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
        SizedBox(width: 12),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                dateLine,
                style: AppTypography.mono(
                  fontSize: 12,
                  color: context.themeColors.onSurfaceMuted,
                  fontWeight: FontWeight.w500,
                  letterSpacing: 0.2,
                ),
              ),
              SizedBox(height: 2),
              Text(
                'Olá, $firstName',
                style: theme.textTheme.titleLarge?.copyWith(
                  fontWeight: FontWeight.w900,
                  color: context.themeColors.onSurface,
                  letterSpacing: -0.3,
                ),
              ),
            ],
          ),
        ),
        Tooltip(
          message: 'Ver seus Desafios',
          child: Material(
            color: context.themeColors.surfaceRaised,
            borderRadius: BorderRadius.circular(20),
            child: InkWell(
              onTap: onXpTap,
              borderRadius: BorderRadius.circular(20),
              child: Container(
                padding: const EdgeInsets.symmetric(
                  horizontal: 10,
                  vertical: 6,
                ),
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(20),
                  border: Border.all(
                    color: AppColors.brand.withValues(alpha: 0.5),
                  ),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(Icons.bolt_rounded, size: 14, color: AppColors.brand),
                    SizedBox(width: 4),
                    Text(
                      '$xpCurrent/$xpGoal',
                      style: theme.textTheme.labelSmall?.copyWith(
                        fontWeight: FontWeight.w800,
                        color: AppColors.brand,
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
        SizedBox(width: 8),
        Material(
          color: context.themeColors.surfaceRaised,
          borderRadius: BorderRadius.circular(12),
          child: InkWell(
            onTap: onNotificationsTap,
            borderRadius: BorderRadius.circular(12),
            child: SizedBox(
              width: 40,
              height: 40,
              child: Stack(
                alignment: Alignment.center,
                children: [
                  Icon(
                    Icons.notifications_outlined,
                    color: context.themeColors.onSurface,
                    size: 22,
                  ),
                  if (unreadNotificationCount > 0)
                    Positioned(
                      right: 4,
                      top: 4,
                      child: _NotificationCountBadge(
                        count: unreadNotificationCount,
                      ),
                    ),
                ],
              ),
            ),
          ),
        ),
      ],
    );
  }

  String _firstName(String name) {
    final parts = name.trim().split(RegExp(r'\s+'));
    if (parts.isEmpty || parts.first.isEmpty) return 'Atleta';
    return parts.first;
  }
}

class _NotificationCountBadge extends StatelessWidget {
  const _NotificationCountBadge({required this.count});

  final int count;

  String get _label {
    if (count > 99) return '99+';
    return '$count';
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      constraints: const BoxConstraints(minWidth: 16, minHeight: 16),
      padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 2),
      decoration: BoxDecoration(
        color: AppColors.brand,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: AppColors.black, width: 1.5),
      ),
      alignment: Alignment.center,
      child: Text(
        _label,
        style: TextStyle(
          color: AppColors.black,
          fontSize: 10,
          fontWeight: FontWeight.w900,
          height: 1,
        ),
      ),
    );
  }
}
