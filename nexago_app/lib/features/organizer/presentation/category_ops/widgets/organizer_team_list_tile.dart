import 'package:flutter/material.dart';
import 'package:nexago_app/core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import 'package:nexago_app/core/theme/app_typography.dart';

import '../../../domain/category_ops/category_ops_models.dart';

class OrganizerTeamListTile extends StatelessWidget {
  const OrganizerTeamListTile({
    super.key,
    required this.team,
    required this.rank,
    required this.onTap,
  });

  final OrganizerCategoryTeamRow team;
  final int rank;
  final VoidCallback onTap;

  static const _avatarColors = [
    AppColors.brand,
    AppColors.win,
    Color(0xFF3B82F6),
    Color(0xFF8B5CF6),
    Color(0xFFEC4899),
  ];

  @override
  Widget build(BuildContext context) {
    final isTopRank = rank <= 3;
    final rankColor = isTopRank
        ? AppColors.brand
        : context.themeColors.onSurfaceMuted.withValues(alpha: 0.45);

    return InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 12),
        child: Row(
          children: [
            Container(
              width: 30,
              height: 30,
              alignment: Alignment.center,
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(8),
                border: Border.all(color: rankColor),
              ),
              child: Text(
                '$rank',
                style: AppTypography.mono(
                  fontSize: 12,
                  fontWeight: FontWeight.w800,
                  color: rankColor,
                ),
              ),
            ),
            const SizedBox(width: 12),
            _OverlappingAvatars(
              initials1: team.player1.initials,
              initials2: team.player2.initials,
              color1: _avatarColorFor(team.player1.initials),
              color2: _avatarColorFor(team.player2.initials),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    team.displayName,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: Theme.of(context).textTheme.titleSmall?.copyWith(
                          fontWeight: FontWeight.w800,
                        ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    team.subtitle,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: Theme.of(context).textTheme.bodySmall?.copyWith(
                          color: context.themeColors.onSurfaceMuted,
                        ),
                  ),
                ],
              ),
            ),
            const SizedBox(width: 8),
            _StatusPill(status: team.status),
          ],
        ),
      ),
    );
  }

  Color _avatarColorFor(String seed) {
    if (seed.isEmpty) return _avatarColors.first;
    return _avatarColors[seed.hashCode.abs() % _avatarColors.length];
  }
}

class _OverlappingAvatars extends StatelessWidget {
  const _OverlappingAvatars({
    required this.initials1,
    required this.initials2,
    required this.color1,
    required this.color2,
  });

  final String initials1;
  final String initials2;
  final Color color1;
  final Color color2;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: 44,
      height: 32,
      child: Stack(
        clipBehavior: Clip.none,
        children: [
          Positioned(left: 0, child: _Avatar(initials: initials1, color: color1)),
          Positioned(left: 18, child: _Avatar(initials: initials2, color: color2)),
        ],
      ),
    );
  }
}

class _Avatar extends StatelessWidget {
  const _Avatar({required this.initials, required this.color});

  final String initials;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return CircleAvatar(
      radius: 16,
      backgroundColor: color,
      child: Text(
        initials,
        style: const TextStyle(
          fontSize: 11,
          fontWeight: FontWeight.w700,
          color: AppColors.black,
        ),
      ),
    );
  }
}

class _StatusPill extends StatelessWidget {
  const _StatusPill({required this.status});

  final OrganizerTeamRegistrationStatus status;

  @override
  Widget build(BuildContext context) {
    final (label, bg, fg, icon) = switch (status) {
      OrganizerTeamRegistrationStatus.confirmed => (
          'Pago',
          AppColors.win.withValues(alpha: 0.15),
          AppColors.win,
          Icons.check_rounded,
        ),
      OrganizerTeamRegistrationStatus.pending => (
          'Pendente',
          AppColors.pending.withValues(alpha: 0.15),
          AppColors.pending,
          Icons.schedule_rounded,
        ),
      OrganizerTeamRegistrationStatus.waitlist => (
          'Fila',
          context.themeColors.onSurfaceMuted.withValues(alpha: 0.12),
          context.themeColors.onSurfaceMuted,
          Icons.hourglass_bottom_rounded,
        ),
    };

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 5),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(20),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 12, color: fg),
          const SizedBox(width: 4),
          Text(
            label,
            style: AppTypography.mono(
              fontSize: 10,
              fontWeight: FontWeight.w700,
              color: fg,
            ),
          ),
        ],
      ),
    );
  }
}
