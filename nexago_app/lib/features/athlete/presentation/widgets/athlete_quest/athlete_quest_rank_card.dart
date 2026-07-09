import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../../../core/router/routes.dart';
import '../../../domain/gamification_models.dart';
import '../../../domain/sand_rank/sand_rank_catalog.dart';
import '../../../domain/sand_rank/sand_rank_providers.dart';
import '../../../domain/sand_rank/sand_rank_reward_catalog.dart';
import '../../sand_rank/widgets/sand_rank_emblem.dart';

/// Card do elo na tela Desafios — substitui o level card antigo quando a
/// flag `appConfig/sandRank` está ligada. Tap abre a trilha de elos.
class AthleteQuestRankCard extends ConsumerWidget {
  const AthleteQuestRankCard({super.key, required this.summary});

  final GamificationSummary summary;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final progress = ref.watch(sandRankProgressProvider);
    final current = progress.current;
    final next = progress.next;
    final color = sandRankColor(current.rankCode);
    final shields = summary.streakShieldsAvailable;

    return Material(
      color: context.themeColors.surfaceCard,
      borderRadius: BorderRadius.circular(14),
      child: InkWell(
        borderRadius: BorderRadius.circular(14),
        onTap: () => context.pushNamed(AppRouteNames.athleteRankTrack),
        child: Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: color.withValues(alpha: 0.35)),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Row(
                children: [
                  SandRankStepEmblem(
                    step: current,
                    size: SandRankEmblemSize.medium,
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'SEU ELO',
                          style: theme.textTheme.labelSmall?.copyWith(
                            fontWeight: FontWeight.w800,
                            letterSpacing: 1.1,
                            color: context.themeColors.onSurfaceMuted,
                          ),
                        ),
                        const SizedBox(height: 2),
                        Text(
                          sandRankLabel(current),
                          style: theme.textTheme.titleMedium?.copyWith(
                            fontWeight: FontWeight.w900,
                            color: color,
                          ),
                        ),
                      ],
                    ),
                  ),
                  if (shields > 0)
                    Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 8,
                        vertical: 4,
                      ),
                      decoration: BoxDecoration(
                        color: color.withValues(alpha: 0.12),
                        borderRadius: BorderRadius.circular(999),
                      ),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Icon(Icons.shield_rounded, size: 14, color: color),
                          const SizedBox(width: 4),
                          Text(
                            '$shields',
                            style: theme.textTheme.labelSmall?.copyWith(
                              fontWeight: FontWeight.w900,
                              color: color,
                            ),
                          ),
                        ],
                      ),
                    ),
                  Icon(
                    Icons.chevron_right_rounded,
                    color: context.themeColors.onSurfaceMuted,
                  ),
                ],
              ),
              const SizedBox(height: 12),
              ClipRRect(
                borderRadius: BorderRadius.circular(999),
                child: LinearProgressIndicator(
                  minHeight: 6,
                  value: progress.progress,
                  backgroundColor: context.themeColors.surfaceRaised,
                  color: color,
                ),
              ),
              const SizedBox(height: 10),
              if (next != null)
                RichText(
                  text: TextSpan(
                    style: theme.textTheme.bodySmall?.copyWith(
                      color: context.themeColors.onSurfaceMuted,
                    ),
                    children: [
                      TextSpan(text: '${progress.xpToNext} XP pra '),
                      TextSpan(
                        text: sandRankLabel(next),
                        style: TextStyle(
                          color: sandRankColor(next.rankCode),
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                    ],
                  ),
                )
              else
                Text(
                  'Você é uma Lenda — o topo da trilha. 👑',
                  style: theme.textTheme.bodySmall?.copyWith(
                    fontWeight: FontWeight.w800,
                    color: color,
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}
