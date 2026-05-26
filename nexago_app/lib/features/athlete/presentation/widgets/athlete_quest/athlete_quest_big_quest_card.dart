import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../../../../../core/theme/app_colors.dart';
import '../../../../../core/ui/app_snackbar.dart';
import '../../../domain/athlete_quest/athlete_quest_models.dart';
import '../athlete_home/athlete_home_section_header.dart';

class AthleteQuestBigQuestCard extends StatelessWidget {
  const AthleteQuestBigQuestCard({super.key, required this.quest});

  final AthleteBigQuest quest;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final endsLabel = DateFormat('EEEE', 'pt_BR').format(quest.endsAt);
    final endsCapitalized = endsLabel.isEmpty
        ? endsLabel
        : '${endsLabel[0].toUpperCase()}${endsLabel.substring(1)}';

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        AthleteHomeSectionHeader(
          title: '',
          trailingAccent: 'DESAFIO DA SEMANA',
          trailingLabel: 'VER REGRAS',
          onTrailingTap: () => showAppSnackBar(context, 'Em breve.'),
        ),
        const SizedBox(height: 10),
        Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: AppColors.surfaceCard,
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: AppColors.brand.withValues(alpha: 0.4)),
            boxShadow: [
              BoxShadow(
                color: AppColors.brand.withValues(alpha: 0.12),
                blurRadius: 24,
                offset: const Offset(0, 8),
              ),
            ],
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Container(
                    width: 44,
                    height: 44,
                    alignment: Alignment.center,
                    decoration: BoxDecoration(
                      color: AppColors.brand.withValues(alpha: 0.15),
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(
                        color: AppColors.brand.withValues(alpha: 0.5),
                      ),
                    ),
                    child: Icon(
                      quest.rewardBadgeIcon,
                      color: AppColors.brand,
                      size: 24,
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          quest.title,
                          style: theme.textTheme.titleSmall?.copyWith(
                            fontWeight: FontWeight.w900,
                            color: AppColors.onSurface,
                          ),
                        ),
                        const SizedBox(height: 6),
                        RichText(
                          text: TextSpan(
                            style: theme.textTheme.bodySmall?.copyWith(
                              color: AppColors.onSurfaceMuted,
                            ),
                            children: [
                              TextSpan(
                                text:
                                    'Termina $endsCapitalized 23:59. Você está em ',
                              ),
                              TextSpan(
                                text:
                                    '${quest.completedCount}/${quest.goalCount}',
                                style: const TextStyle(
                                  color: AppColors.brand,
                                  fontWeight: FontWeight.w800,
                                ),
                              ),
                              const TextSpan(text: '.'),
                            ],
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 14),
              _SegmentedBar(
                goalCount: quest.goalCount,
                completedCount: quest.completedCount,
              ),
              const SizedBox(height: 8),
              Row(
                children: List.generate(quest.goalCount, (index) {
                  final label = index < quest.segmentLabels.length
                      ? quest.segmentLabels[index]
                      : '-';
                  final done = index < quest.completedCount;
                  final display = done && label != '-' ? '$label ✓' : label;

                  return Expanded(
                    child: Text(
                      display,
                      textAlign: TextAlign.center,
                      style: theme.textTheme.labelSmall?.copyWith(
                        fontWeight: FontWeight.w700,
                        color: done
                            ? AppColors.brand
                            : AppColors.onSurfaceMuted,
                        fontSize: 9,
                      ),
                    ),
                  );
                }),
              ),
              const SizedBox(height: 10),
              Row(
                children: [
                  Icon(
                    Icons.military_tech_outlined,
                    size: 14,
                    color: AppColors.brand.withValues(alpha: 0.8),
                  ),
                  const SizedBox(width: 6),
                  Text(
                    quest.rewardBadgeTitle,
                    style: theme.textTheme.labelSmall?.copyWith(
                      fontWeight: FontWeight.w700,
                      color: AppColors.onSurfaceMuted,
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class _SegmentedBar extends StatelessWidget {
  const _SegmentedBar({required this.goalCount, required this.completedCount});

  final int goalCount;
  final int completedCount;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: List.generate(goalCount, (index) {
        final done = index < completedCount;
        return Expanded(
          child: Padding(
            padding: EdgeInsets.only(left: index == 0 ? 0 : 4),
            child: Container(
              height: 8,
              decoration: BoxDecoration(
                color: done ? AppColors.brand : Colors.transparent,
                borderRadius: BorderRadius.circular(4),
                border: done
                    ? null
                    : Border.all(color: AppColors.surfaceRaised, width: 2),
              ),
            ),
          ),
        );
      }),
    );
  }
}
