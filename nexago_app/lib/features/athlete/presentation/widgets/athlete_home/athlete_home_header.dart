import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:nexago_app/core/theme/app_typography.dart';

import '../../../../../core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../domain/athlete_quest/athlete_quest_logic.dart';
import '../../../domain/gamification_models.dart';
import '../../../domain/sand_rank/sand_rank_catalog.dart';
import '../../sand_rank/widgets/sand_rank_avatar_frame.dart';
import '../../sand_rank/widgets/sand_rank_emblem.dart';
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
    this.sandRankEnabled = false,
    this.sandRankFrameId,
  });

  final String displayName;
  final GamificationSummary summary;
  final String? avatarUrl;
  final VoidCallback? onAvatarTap;
  final VoidCallback? onXpTap;
  final VoidCallback? onNotificationsTap;
  final int unreadNotificationCount;

  /// Com a flag do sistema de elos ligada, o badge numérico do avatar dá
  /// lugar ao emblema do elo (derivado do XP).
  final bool sandRankEnabled;

  /// Moldura equipada (`sandRankCosmetics.frameId`) — anel ao redor do avatar.
  final String? sandRankFrameId;

  /// "Bom dia/Boa tarde/Boa noite" — mesmo corte de hora do painel web.
  static String _greetingByHour(DateTime now) {
    if (now.hour < 12) return 'Bom dia';
    if (now.hour < 18) return 'Boa tarde';
    return 'Boa noite';
  }

  /// "SÁB · 09 AGO 2026 · GMT-3" — formato da linha de data do painel web.
  static String _dateLine(DateTime now) {
    final base = DateFormat('EEE · dd MMM yyyy', 'pt_BR')
        .format(now)
        .toUpperCase()
        .replaceAll('.', '');
    final gmt = now.timeZoneOffset.inHours;
    return '$base · GMT${gmt >= 0 ? '+' : ''}$gmt';
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final now = DateTime.now();
    final dateLine = _dateLine(now);
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
        _buildAvatarSlot(
          avatarSlotSize: avatarSlotSize,
          avatarSize: avatarSize,
          initials: initials,
          avatarUrl: avatarUrl,
          displayLevel: displayLevel,
          theme: theme,
        ),
        SizedBox(width: 12),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                dateLine,
                style: AppTypography.mono(
                  fontSize: 10,
                  color: context.themeColors.onSurfaceMuted,
                  fontWeight: FontWeight.w500,
                  letterSpacing: 0.2,
                ),
              ),
              SizedBox(height: 2),
              Text(
                '${_greetingByHour(now)}, $firstName.',
                style: theme.textTheme.titleLarge?.copyWith(
                  fontWeight: FontWeight.w900,
                  color: context.themeColors.onSurface,
                  fontSize: 20,
                  letterSpacing: -0.3,
                ),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
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

  Widget _buildAvatarSlot({
    required double avatarSlotSize,
    required double avatarSize,
    required String initials,
    required String? avatarUrl,
    required int displayLevel,
    required ThemeData theme,
  }) {
    final avatar = SizedBox(
      width: avatarSlotSize,
      height: avatarSlotSize,
      child: Stack(
        clipBehavior: Clip.none,
        children: [
          Positioned(
            left: 0,
            top: 0,
            child: sandRankEnabled
                ? SandRankAvatarFrame(
                    frameId: sandRankFrameId,
                    size: avatarSize,
                    child: AthleteProfileAvatar(
                      size: avatarSize,
                      initials: initials,
                      imageUrl: avatarUrl,
                    ),
                  )
                : AthleteProfileAvatar(
                    size: avatarSize,
                    initials: initials,
                    imageUrl: avatarUrl,
                  ),
          ),
          Positioned(
            right: 0,
            bottom: 0,
            child: sandRankEnabled
                ? Tooltip(
                    message:
                        'Elo ${sandRankLabel(sandRankStepFromXp(summary.xp))}',
                    child: SandRankEmblem(
                      rankCode: sandRankStepFromXp(summary.xp).rankCode,
                      division: sandRankStepFromXp(summary.xp).division,
                      size: SandRankEmblemSize.badgeCompact,
                    ),
                  )
                : Container(
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
    );

    if (onAvatarTap == null) return avatar;

    return _ScalePressAction(onTap: onAvatarTap!, child: avatar);
  }
}

class _ScalePressAction extends StatefulWidget {
  const _ScalePressAction({required this.onTap, required this.child});

  final VoidCallback onTap;
  final Widget child;

  @override
  State<_ScalePressAction> createState() => _ScalePressActionState();
}

class _ScalePressActionState extends State<_ScalePressAction> {
  var _pressed = false;

  void _setPressed(bool value) {
    if (_pressed == value) return;
    setState(() => _pressed = value);
  }

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTapDown: (_) => _setPressed(true),
      onTapUp: (_) => _setPressed(false),
      onTapCancel: () => _setPressed(false),
      onTap: widget.onTap,
      behavior: HitTestBehavior.opaque,
      child: AnimatedScale(
        scale: _pressed ? 0.94 : 1,
        duration: const Duration(milliseconds: 150),
        curve: Curves.easeOutCubic,
        child: widget.child,
      ),
    );
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
