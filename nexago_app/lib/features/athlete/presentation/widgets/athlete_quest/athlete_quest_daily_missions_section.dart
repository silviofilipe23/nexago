import 'package:flutter/material.dart';

import '../../../../../core/theme/app_colors.dart';
import '../../../domain/athlete_quest/athlete_quest_logic.dart';
import '../../../domain/daily_mission_catalog.dart';
import '../../../domain/gamification_models.dart';
import '../athlete_home/athlete_home_section_header.dart';

class AthleteQuestDailyMissionsSection extends StatelessWidget {
  const AthleteQuestDailyMissionsSection({
    super.key,
    required this.missions,
    this.showHeader = true,
    this.onViewAll,
    this.onMissionTap,
  });

  final DailyMissionBundle? missions;
  final bool showHeader;
  final VoidCallback? onViewAll;
  final void Function(GamificationMission mission)? onMissionTap;

  @override
  Widget build(BuildContext context) {
    final list = missions?.missions ?? const <DailyMissionStatus>[];
    final done = list.where((m) => m.completed).length;
    final total =
        list.isEmpty ? DailyMissionCatalog.all.length : list.length;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (showHeader) ...[
          AthleteHomeSectionHeader(
            title: 'Missões diárias',
            trailingAccent: '$done/$total HOJE · RESETA 24:00',
            trailingLabel: onViewAll != null ? 'VER TUDO' : null,
            onTrailingTap: onViewAll,
          ),
          const SizedBox(height: 10),
        ],
        if (list.isEmpty)
          ...DailyMissionCatalog.all.map(
            (def) {
              final mission = GamificationMission.fromId(def.id);
              if (mission == null) return const SizedBox.shrink();
              return Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: _MissionCard(
                  icon: def.icon,
                  title: def.title,
                  subtitle: def.subtitle,
                  xpLabel: '+${def.xpReward} XP',
                  completed: false,
                  onTap: onMissionTap != null
                      ? () => onMissionTap!(mission)
                      : null,
                ),
              );
            },
          )
        else
          ...list.map(
            (status) => Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: _MissionCard(
                icon: DailyMissionCatalog.iconForId(status.mission.id),
                title: missionTitle(status.mission),
                subtitle: missionSubtitle(status.mission),
                xpLabel: '+${missionXpReward(status.mission.id)} XP',
                completed: status.completed,
                onTap: !status.completed && onMissionTap != null
                    ? () => onMissionTap!(status.mission)
                    : null,
              ),
            ),
          ),
      ],
    );
  }
}

class _MissionCard extends StatelessWidget {
  const _MissionCard({
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.xpLabel,
    required this.completed,
    this.onTap,
  });

  final IconData icon;
  final String title;
  final String subtitle;
  final String xpLabel;
  final bool completed;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    final child = Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AppColors.surfaceCard,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppColors.surfaceRaised),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 40,
            height: 40,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              color: completed
                  ? AppColors.win.withValues(alpha: 0.15)
                  : AppColors.brand.withValues(alpha: 0.15),
              shape: BoxShape.circle,
            ),
            child: Icon(
              completed ? Icons.check_rounded : icon,
              color: completed ? AppColors.win : AppColors.brand,
              size: 22,
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: theme.textTheme.bodyMedium?.copyWith(
                    fontWeight: FontWeight.w800,
                    color: completed ? AppColors.win : AppColors.onSurface,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  subtitle,
                  style: theme.textTheme.bodySmall?.copyWith(
                    color: AppColors.onSurfaceMuted,
                  ),
                ),
              ],
            ),
          ),
          Text(
            xpLabel,
            style: theme.textTheme.labelSmall?.copyWith(
              fontWeight: FontWeight.w800,
              color: AppColors.brand,
            ),
          ),
        ],
      ),
    );

    if (onTap == null) return child;

    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(14),
        child: child,
      ),
    );
  }
}
