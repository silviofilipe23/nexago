import '../daily_mission_catalog.dart';
import '../gamification_models.dart';
import 'athlete_quest_models.dart';

const _weekdayLabels = ['SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB', 'DOM'];

const _streakShieldTarget = 7;

DateTime _dateOnly(DateTime dt) => DateTime(dt.year, dt.month, dt.day);

/// Segunda-feira da semana calendário de [anchor].
DateTime _mondayOfWeek(DateTime anchor) {
  final d = _dateOnly(anchor);
  return d.subtract(Duration(days: d.weekday - DateTime.monday));
}

/// Nível exibido na UI (1-based), alinhado ao perfil/settings.
int gamificationDisplayLevel(GamificationSummary summary) {
  return (summary.level + 1).clamp(1, 999);
}

String levelTitle(int displayLevel) {
  return switch (displayLevel) {
    1 => 'Iniciante',
    2 => 'Estreante',
    3 => 'Bola na rede',
    4 => 'Veterano',
    5 => 'Elite',
    _ => 'Nível $displayLevel',
  };
}

String? nextLevelUnlockHint(int nextDisplayLevel) {
  return switch (nextDisplayLevel) {
    3 => 'desbloqueia torneios',
    4 => 'desbloqueia ligas semanais',
    _ => null,
  };
}

/// Dias da semana atual (seg–dom) com estado visual do streak.
List<StreakWeekDay> buildStreakWeekDays(
  GamificationSummary summary,
  DateTime now,
) {
  final today = _dateOnly(now);
  final monday = _mondayOfWeek(today);
  final lastGame = summary.lastGameDate != null
      ? _dateOnly(summary.lastGameDate!)
      : null;
  final streak = summary.streak;

  final completedDates = <DateTime>{};
  if (streak > 0 && lastGame != null) {
    for (var i = 0; i < streak; i++) {
      completedDates.add(lastGame.subtract(Duration(days: i)));
    }
  }

  final streakActiveToday = lastGame == today;
  final streakNeedsPlayToday =
      streak > 0 && lastGame != null && lastGame == today.subtract(const Duration(days: 1));

  return List.generate(7, (index) {
    final day = monday.add(Duration(days: index));
    final StreakWeekDayState state;
    if (day.isAfter(today)) {
      state = StreakWeekDayState.upcoming;
    } else if (day == today) {
      if (streakActiveToday && completedDates.contains(today)) {
        state = StreakWeekDayState.completed;
      } else if (streakNeedsPlayToday || (streak == 0 && !completedDates.contains(today))) {
        state = StreakWeekDayState.today;
      } else if (completedDates.contains(today)) {
        state = StreakWeekDayState.completed;
      } else {
        state = StreakWeekDayState.today;
      }
    } else if (completedDates.contains(day)) {
      state = StreakWeekDayState.completed;
    } else {
      state = StreakWeekDayState.missed;
    }

    return StreakWeekDay(
      weekdayLabel: _weekdayLabels[index],
      state: state,
    );
  });
}

/// Subtítulo do hero de streak (partes em negrito via RichText na UI).
StreakHeroCopy streakHeroCopy(int streak) {
  final nextDay = streak + 1;
  final daysToShield =
      (_streakShieldTarget - streak).clamp(0, _streakShieldTarget);
  final shieldPart = daysToShield > 0
      ? 'próximo escudo em ${daysToShield}d'
      : 'escudo desbloqueado';
  return StreakHeroCopy(
    lead: 'Jogue hoje pra chegar a ',
    highlightDays: '$nextDay dias',
    trail: ' · $shieldPart',
  );
}

class StreakHeroCopy {
  const StreakHeroCopy({
    required this.lead,
    required this.highlightDays,
    required this.trail,
  });

  final String lead;
  final String highlightDays;
  final String trail;
}

String missionSubtitle(GamificationMission mission) {
  return DailyMissionCatalog.subtitleForId(mission.id);
}

String missionTitle(GamificationMission mission) {
  return DailyMissionCatalog.byId(mission.id)?.title ?? mission.id;
}

int missionXpReward(String missionId) {
  return DailyMissionCatalog.xpForId(missionId);
}

int dailyMissionsTotalXp() => DailyMissionCatalog.totalXpReward();
