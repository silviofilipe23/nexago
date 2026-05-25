import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../data/mock_athlete_quest_data.dart';
import '../gamification_providers.dart';
import 'athlete_quest_logic.dart';
import 'athlete_quest_models.dart';

final athleteQuestUiProvider = Provider.autoDispose<AthleteQuestUiState?>((ref) {
  final summary = ref.watch(gamificationSummaryProvider).valueOrNull;
  if (summary == null) return null;

  final missions = ref.watch(dailyMissionsProvider).valueOrNull;
  final weekDays = buildStreakWeekDays(summary, DateTime.now());
  final bigQuest = mockAthleteBigQuest();
  final league = mockAthleteLeagueEntries(
    currentUserXp: summary.xpInCurrentLevel,
  );

  return AthleteQuestUiState(
    summary: summary,
    missions: missions,
    weekDays: weekDays,
    bigQuest: bigQuest,
    leagueEntries: league,
  );
});
