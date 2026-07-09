import '../daily_mission_catalog.dart';
import '../gamification_models.dart';
import 'athlete_quest_models.dart';

import '../sand_rank/sand_rank_catalog.dart';

const _weekdayLabels = ['SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB', 'DOM'];

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

DateTime? _parseActivityDayKey(String key) {
  final trimmed = key.trim();
  if (trimmed.length < 10) return null;
  final parsed = DateTime.tryParse(trimmed.substring(0, 10));
  if (parsed == null) return null;
  return DateTime(parsed.year, parsed.month, parsed.day);
}

/// Dias com atividade registrada (jogo, reserva ou missão de jogo).
Set<DateTime> _activityDatesFromSummary(GamificationSummary summary) {
  final dates = <DateTime>{};
  for (final key in summary.gameCompletionDays) {
    final day = _parseActivityDayKey(key);
    if (day != null) dates.add(day);
  }

  if (dates.isNotEmpty) return dates;

  // Legado: usuários sem `gameCompletionDays` no Firestore.
  final lastGame = summary.lastGameDate != null
      ? _dateOnly(summary.lastGameDate!)
      : null;
  if (summary.streak > 0 && lastGame != null) {
    for (var i = 0; i < summary.streak; i++) {
      dates.add(lastGame.subtract(Duration(days: i)));
    }
  }
  return dates;
}

DateTime? _latestActivityDate(Set<DateTime> activityDates) {
  if (activityDates.isEmpty) return null;
  return activityDates.reduce((a, b) => a.isAfter(b) ? a : b);
}

/// Dias da semana atual (seg–dom) com estado visual do streak.
List<StreakWeekDay> buildStreakWeekDays(
  GamificationSummary summary,
  DateTime now,
) {
  final today = _dateOnly(now);
  final monday = _mondayOfWeek(today);
  final streak = summary.streak;
  final activityDates = _activityDatesFromSummary(summary);
  final lastActivity = _latestActivityDate(activityDates) ??
      (summary.lastGameDate != null
          ? _dateOnly(summary.lastGameDate!)
          : null);

  final streakNeedsPlayToday = streak > 0 &&
      lastActivity != null &&
      lastActivity == today.subtract(const Duration(days: 1));

  return List.generate(7, (index) {
    final day = monday.add(Duration(days: index));
    final StreakWeekDayState state;
    if (day.isAfter(today)) {
      state = StreakWeekDayState.upcoming;
    } else if (activityDates.contains(day)) {
      state = StreakWeekDayState.completed;
    } else if (day == today) {
      if (streakNeedsPlayToday || streak == 0) {
        state = StreakWeekDayState.today;
      } else {
        state = StreakWeekDayState.missed;
      }
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
///
/// O escudo (Protetor de Sequência) é o perk da trilha de elos: 1/mês a
/// partir de Desafiante III, 2/mês a partir de Mestre III.
StreakHeroCopy streakHeroCopy(
  int streak, {
  int shieldsAvailable = 0,
  int highestSandRankTrackIndex = 0,
}) {
  final nextDay = streak + 1;
  final String shieldPart;
  if (shieldsAvailable > 0) {
    shieldPart = shieldsAvailable == 1
        ? '1 escudo de proteção'
        : '$shieldsAvailable escudos de proteção';
  } else if (highestSandRankTrackIndex >= shieldTrackIndexOnePerMonth) {
    shieldPart = 'escudo volta mês que vem';
  } else {
    shieldPart = 'escudo desbloqueia no elo Desafiante';
  }
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
