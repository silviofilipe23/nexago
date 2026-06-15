import 'package:flutter/material.dart';
import 'package:nexago_app/core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';

import '../../../domain/category_ops/category_ops_models.dart';

class OrganizerTeamListTile extends StatelessWidget {
  const OrganizerTeamListTile({
    super.key,
    required this.team,
    required this.onTap,
  });

  final OrganizerCategoryTeamRow team;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final statusIcon = switch (team.status) {
      OrganizerTeamRegistrationStatus.confirmed => Icons.check_circle_rounded,
      OrganizerTeamRegistrationStatus.pending => Icons.schedule_rounded,
      OrganizerTeamRegistrationStatus.waitlist => Icons.hourglass_bottom_rounded,
    };
    final statusColor = switch (team.status) {
      OrganizerTeamRegistrationStatus.confirmed => const Color(0xFF22C55E),
      OrganizerTeamRegistrationStatus.pending => AppColors.brand,
      OrganizerTeamRegistrationStatus.waitlist =>
        context.themeColors.onSurfaceMuted,
    };

    return Material(
      color: context.themeColors.surfaceCard,
      borderRadius: BorderRadius.circular(14),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Row(
            children: [
              if (team.seedRank != null)
                Container(
                  width: 28,
                  alignment: Alignment.center,
                  child: Text(
                    'C${team.seedRank}',
                    style: const TextStyle(
                      fontWeight: FontWeight.w800,
                      color: AppColors.brand,
                      fontSize: 12,
                    ),
                  ),
                ),
              _Avatar(initials: team.player1.initials),
              const SizedBox(width: 4),
              _Avatar(initials: team.player2.initials),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      team.displayName,
                      style: Theme.of(context).textTheme.titleSmall?.copyWith(
                            fontWeight: FontWeight.w700,
                          ),
                    ),
                    Text(
                      team.subtitle,
                      style: Theme.of(context).textTheme.bodySmall?.copyWith(
                            color: context.themeColors.onSurfaceMuted,
                          ),
                    ),
                  ],
                ),
              ),
              Icon(statusIcon, color: statusColor, size: 22),
            ],
          ),
        ),
      ),
    );
  }
}

class _Avatar extends StatelessWidget {
  const _Avatar({required this.initials});

  final String initials;

  @override
  Widget build(BuildContext context) {
    return CircleAvatar(
      radius: 16,
      backgroundColor: context.themeColors.onSurfaceMuted.withValues(alpha: 0.2),
      child: Text(
        initials,
        style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w700),
      ),
    );
  }
}
