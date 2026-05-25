import 'package:flutter/material.dart';

import '../gamification_models.dart';

enum StreakWeekDayState {
  completed,
  today,
  upcoming,
  missed,
}

class StreakWeekDay {
  const StreakWeekDay({
    required this.weekdayLabel,
    required this.state,
  });

  final String weekdayLabel;
  final StreakWeekDayState state;
}

class AthleteBigQuest {
  const AthleteBigQuest({
    required this.title,
    required this.goalCount,
    required this.completedCount,
    required this.segmentLabels,
    required this.endsAt,
    required this.rewardBadgeTitle,
    required this.rewardBadgeIcon,
  });

  final String title;
  final int goalCount;
  final int completedCount;
  final List<String> segmentLabels;
  final DateTime endsAt;
  final String rewardBadgeTitle;
  final IconData rewardBadgeIcon;
}

class AthleteLeagueEntry {
  const AthleteLeagueEntry({
    required this.rank,
    required this.initials,
    required this.name,
    required this.xp,
    required this.avatarColor,
    required this.isCurrentUser,
  });

  final int rank;
  final String initials;
  final String name;
  final int xp;
  final Color avatarColor;
  final bool isCurrentUser;
}

class AthleteQuestUiState {
  const AthleteQuestUiState({
    required this.summary,
    required this.missions,
    required this.weekDays,
    required this.bigQuest,
    required this.leagueEntries,
  });

  final GamificationSummary summary;
  final DailyMissionBundle? missions;
  final List<StreakWeekDay> weekDays;
  final AthleteBigQuest bigQuest;
  final List<AthleteLeagueEntry> leagueEntries;
}
