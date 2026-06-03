import 'package:flutter/material.dart';

import '../../../../../core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../domain/athlete_quest/athlete_quest_logic.dart';
import '../../../domain/gamification_models.dart';
import 'athlete_home_section_header.dart';

class AthleteHomeDailyMissionsSection extends StatelessWidget {
  const AthleteHomeDailyMissionsSection({
    super.key,
    required this.missions,
    this.onViewAll,
    this.onMissionTap,
  });

  final DailyMissionBundle? missions;
  final VoidCallback? onViewAll;
  final void Function(GamificationMission mission)? onMissionTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final list = missions?.missions ?? const <DailyMissionStatus>[];
    final done = list.where((m) => m.completed).length;
    final total = list.length;
    final totalXp = dailyMissionsTotalXp();
    final progress = total == 0 ? 0.0 : done / total;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        AthleteHomeSectionHeader(
          title: 'Missões diárias',
          trailingAccent: '$done/$total HOJE',
          trailingLabel: 'VER TUDO',
          onTrailingTap: onViewAll,
        ),
        SizedBox(height: 10),
        Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            color: context.themeColors.surfaceCard,
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: context.themeColors.surfaceRaised),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Row(
                children: [
                  Expanded(
                    child: ClipRRect(
                      borderRadius: BorderRadius.circular(999),
                      child: LinearProgressIndicator(
                        minHeight: 6,
                        value: progress,
                        backgroundColor: context.themeColors.surfaceRaised,
                        color: AppColors.brand,
                      ),
                    ),
                  ),
                  SizedBox(width: 10),
                  Text(
                    '+$totalXp XP',
                    style: theme.textTheme.labelSmall?.copyWith(
                      fontWeight: FontWeight.w800,
                      color: AppColors.brand,
                    ),
                  ),
                ],
              ),
              if (list.isEmpty) ...[
                SizedBox(height: 12),
                Text(
                  'Carregando missões de hoje…',
                  style: theme.textTheme.bodySmall?.copyWith(
                    color: context.themeColors.onSurfaceMuted,
                  ),
                ),
              ] else ...[
                SizedBox(height: 14),
                ...list.map(
                  (m) => _MissionRow(
                    status: m,
                    onTap: !m.completed && onMissionTap != null
                        ? () => onMissionTap!(m.mission)
                        : null,
                  ),
                ),
              ],
            ],
          ),
        ),
      ],
    );
  }
}

class _MissionRow extends StatelessWidget {
  const _MissionRow({required this.status, this.onTap});

  final DailyMissionStatus status;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final xp = missionXpReward(status.mission.id);

    final row = Row(
      children: [
        Icon(
          status.completed
              ? Icons.check_circle_rounded
              : Icons.radio_button_unchecked_rounded,
          size: 20,
          color: status.completed ? AppColors.win : context.themeColors.onSurfaceMuted,
        ),
        SizedBox(width: 10),
        Expanded(
          child: Text(
            missionTitle(status.mission),
            style: theme.textTheme.bodyMedium?.copyWith(
              fontWeight: FontWeight.w700,
              color:
                  status.completed ? AppColors.win : context.themeColors.onSurface,
            ),
          ),
        ),
        Text(
          '+$xp XP',
          style: theme.textTheme.labelSmall?.copyWith(
            fontWeight: FontWeight.w800,
            color: context.themeColors.onSurfaceMuted,
          ),
        ),
      ],
    );

    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: onTap == null
          ? row
          : InkWell(
              onTap: onTap,
              borderRadius: BorderRadius.circular(8),
              child: Padding(
                padding: const EdgeInsets.symmetric(vertical: 2),
                child: row,
              ),
            ),
    );
  }
}
