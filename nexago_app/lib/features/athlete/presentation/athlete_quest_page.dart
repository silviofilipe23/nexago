import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/router/routes.dart';
import '../../../core/theme/app_colors.dart';
import '../domain/athlete_quest/athlete_quest_providers.dart';
import '../domain/athlete_shell_providers.dart';
import '../domain/gamification_providers.dart';
import 'widgets/athlete_quest/athlete_quest_big_quest_card.dart';
import 'widgets/athlete_quest/athlete_quest_daily_missions_section.dart';
import 'widgets/athlete_quest/athlete_quest_league_section.dart';
import 'widgets/athlete_quest/athlete_quest_level_card.dart';
import 'daily_mission_navigation.dart';
import 'widgets/athlete_quest/athlete_quest_streak_hero.dart';

/// Gamificação amplificada (protótipo 03 — Quest).
class AthleteQuestPage extends ConsumerWidget {
  const AthleteQuestPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final summaryAsync = ref.watch(gamificationSummaryProvider);
    final questUi = ref.watch(athleteQuestUiProvider);

    return Scaffold(
      backgroundColor: AppColors.canvas,
      appBar: _appBar(context, theme),
      body: summaryAsync.when(
        loading: () => const Center(
          child: CircularProgressIndicator(color: AppColors.brand),
        ),
        error: (_, _) => const _ErrorState(),
        data: (summary) {
          if (questUi == null) {
            return const Center(
              child: CircularProgressIndicator(color: AppColors.brand),
            );
          }

          return ListView(
            padding: const EdgeInsets.fromLTRB(20, 8, 20, 28),
            children: [
              AthleteQuestStreakHero(
                summary: summary,
                weekDays: questUi.weekDays,
                onReserveTap: () {
                  ref.read(athleteShellTabIndexProvider.notifier).state =
                      athleteShellReservarTabIndex;
                  context.pop();
                },
              ),
              const SizedBox(height: 16),
              AthleteQuestLevelCard(summary: summary),
              const SizedBox(height: 24),
              AthleteQuestDailyMissionsSection(
                missions: questUi.missions,
                onMissionTap: (mission) =>
                    navigateForDailyMission(context, ref, mission),
              ),
              const SizedBox(height: 24),
              AthleteQuestBigQuestCard(quest: questUi.bigQuest),
              const SizedBox(height: 24),
              AthleteQuestLeagueSection(entries: questUi.leagueEntries),
            ],
          );
        },
      ),
    );
  }

  PreferredSizeWidget _appBar(BuildContext context, ThemeData theme) {
    return AppBar(
      backgroundColor: AppColors.canvas,
      surfaceTintColor: Colors.transparent,
      elevation: 0,
      centerTitle: true,
      leading: Padding(
        padding: const EdgeInsets.only(left: 12),
        child: Center(
          child: Material(
            color: AppColors.surfaceRaised,
            borderRadius: BorderRadius.circular(12),
            child: InkWell(
              onTap: () {
                if (context.canPop()) {
                  context.pop();
                } else {
                  context.go(AppRoutes.discover);
                }
              },
              borderRadius: BorderRadius.circular(12),
              child: const SizedBox(
                width: 40,
                height: 40,
                child: Icon(
                  Icons.chevron_left_rounded,
                  color: AppColors.onSurface,
                ),
              ),
            ),
          ),
        ),
      ),
      title: Text(
        'Quest',
        style: theme.textTheme.titleLarge?.copyWith(
          fontWeight: FontWeight.w800,
          color: AppColors.onSurface,
          letterSpacing: -0.3,
        ),
      ),
    );
  }
}

class _ErrorState extends StatelessWidget {
  const _ErrorState();

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Text(
          'Não foi possível carregar sua evolução.',
          textAlign: TextAlign.center,
          style: theme.textTheme.bodyLarge?.copyWith(
            color: AppColors.onSurfaceMuted,
          ),
        ),
      ),
    );
  }
}
