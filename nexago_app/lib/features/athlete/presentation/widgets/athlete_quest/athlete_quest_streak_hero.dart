import 'package:flutter/material.dart';

import '../../../../../core/theme/app_colors.dart';
import '../../../domain/athlete_quest/athlete_quest_logic.dart';
import '../../../domain/athlete_quest/athlete_quest_models.dart';
import '../../../domain/gamification_models.dart';
import 'athlete_quest_week_dots.dart';

class AthleteQuestStreakHero extends StatelessWidget {
  const AthleteQuestStreakHero({
    super.key,
    required this.summary,
    required this.weekDays,
    required this.onReserveTap,
  });

  final GamificationSummary summary;
  final List<StreakWeekDay> weekDays;
  final VoidCallback onReserveTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final streak = summary.streak;
    final copy = streakHeroCopy(streak);

    return Container(
      clipBehavior: Clip.antiAlias,
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: AppColors.brand.withValues(alpha: 0.28)),
      ),
      child: Stack(
        children: [
          Positioned.fill(
            child: DecoratedBox(
              decoration: BoxDecoration(
                color: AppColors.surfaceCard,
                gradient: RadialGradient(
                  center: const Alignment(0, -0.85),
                  radius: 1.15,
                  colors: [
                    AppColors.brand.withValues(alpha: 0.22),
                    AppColors.brand.withValues(alpha: 0.06),
                    AppColors.surfaceCard,
                  ],
                  stops: const [0.0, 0.35, 0.7],
                ),
              ),
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 20, 20, 18),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.center,
              children: [
                Text(
                  'SUA SEQUÊNCIA',
                  textAlign: TextAlign.center,
                  style: theme.textTheme.labelSmall?.copyWith(
                    fontWeight: FontWeight.w800,
                    color: AppColors.brand,
                    letterSpacing: 1.2,
                    fontSize: 11,
                  ),
                ),
                const SizedBox(height: 20),
                Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    Text(
                      '$streak',
                      style: theme.textTheme.displayLarge?.copyWith(
                        fontWeight: FontWeight.w900,
                        color: AppColors.onSurface,
                        fontSize: 64,
                        height: 0.85,
                        letterSpacing: -3,
                      ),
                    ),
                    const Padding(
                      padding: EdgeInsets.only(left: 2, bottom: 10),
                      child: Icon(
                        Icons.local_fire_department_rounded,
                        color: AppColors.brand,
                        size: 32,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 4),
                Text(
                  'dias seguidos',
                  textAlign: TextAlign.center,
                  style: theme.textTheme.titleMedium?.copyWith(
                    fontWeight: FontWeight.w800,
                    color: AppColors.onSurface,
                  ),
                ),
                const SizedBox(height: 14),
                RichText(
                  textAlign: TextAlign.center,
                  text: TextSpan(
                    style: theme.textTheme.bodySmall?.copyWith(
                      color: AppColors.onSurfaceMuted,
                      height: 1.45,
                      fontSize: 13,
                    ),
                    children: [
                      TextSpan(text: copy.lead),
                      TextSpan(
                        text: copy.highlightDays,
                        style: const TextStyle(
                          color: AppColors.brand,
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                      TextSpan(text: copy.trail),
                    ],
                  ),
                ),
                const SizedBox(height: 22),
                AthleteQuestWeekDots(weekDays: weekDays),
                const SizedBox(height: 20),
                SizedBox(
                  width: double.infinity,
                  child: FilledButton.icon(
                    onPressed: onReserveTap,
                    icon: const Icon(
                      Icons.bolt_rounded,
                      color: AppColors.black,
                      size: 20,
                    ),
                    label: const Text(
                      'Reservar agora · manter chama',
                      style: TextStyle(
                        fontWeight: FontWeight.w800,
                        color: AppColors.black,
                        fontSize: 15,
                      ),
                    ),
                    style: FilledButton.styleFrom(
                      backgroundColor: AppColors.brand,
                      foregroundColor: AppColors.black,
                      padding: const EdgeInsets.symmetric(vertical: 16),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(28),
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
