import 'package:flutter/material.dart';

import '../../../../../core/theme/app_colors.dart';
import '../../../../../core/ui/app_snackbar.dart';
import '../../../domain/athlete_quest/athlete_quest_models.dart';
import '../athlete_home/athlete_home_section_header.dart';

class AthleteQuestLeagueSection extends StatelessWidget {
  const AthleteQuestLeagueSection({
    super.key,
    required this.entries,
  });

  final List<AthleteLeagueEntry> entries;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        AthleteHomeSectionHeader(
          title: 'Sua liga',
          trailingAccent: 'ESTA SEMANA',
          trailingLabel: 'VER RANKING',
          onTrailingTap: () => showAppSnackBar(context, 'Em breve.'),
        ),
        const SizedBox(height: 10),
        Container(
          padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 12),
          decoration: BoxDecoration(
            color: AppColors.surfaceCard,
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: AppColors.surfaceRaised),
          ),
          child: Column(
            children: entries.map((entry) {
              return _LeagueRow(entry: entry);
            }).toList(),
          ),
        ),
      ],
    );
  }
}

class _LeagueRow extends StatelessWidget {
  const _LeagueRow({required this.entry});

  final AthleteLeagueEntry entry;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isUser = entry.isCurrentUser;

    return Container(
      margin: const EdgeInsets.symmetric(vertical: 4),
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 8),
      decoration: isUser
          ? BoxDecoration(
              color: AppColors.brand.withValues(alpha: 0.08),
              borderRadius: BorderRadius.circular(10),
              border: Border.all(
                color: AppColors.brand.withValues(alpha: 0.25),
              ),
            )
          : null,
      child: Row(
        children: [
          SizedBox(
            width: 20,
            child: Text(
              '${entry.rank}',
              style: theme.textTheme.labelSmall?.copyWith(
                fontWeight: FontWeight.w800,
                color: AppColors.onSurfaceMuted,
              ),
            ),
          ),
          Container(
            width: 32,
            height: 32,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              color: entry.avatarColor,
              shape: BoxShape.circle,
            ),
            child: Text(
              entry.initials,
              style: theme.textTheme.labelSmall?.copyWith(
                fontWeight: FontWeight.w900,
                color: AppColors.white,
              ),
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Row(
              children: [
                Text(
                  entry.name,
                  style: theme.textTheme.bodyMedium?.copyWith(
                    fontWeight: FontWeight.w800,
                    color: isUser ? AppColors.brand : AppColors.onSurface,
                  ),
                ),
                if (entry.rank == 1) ...[
                  const SizedBox(width: 6),
                  const Icon(
                    Icons.emoji_events_rounded,
                    size: 14,
                    color: AppColors.pending,
                  ),
                ],
              ],
            ),
          ),
          Text(
            '${entry.xp} XP',
            style: theme.textTheme.labelSmall?.copyWith(
              fontWeight: FontWeight.w800,
              color: isUser ? AppColors.brand : AppColors.onSurfaceMuted,
            ),
          ),
        ],
      ),
    );
  }
}
