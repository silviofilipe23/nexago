import 'package:cloud_firestore/cloud_firestore.dart';

enum GamificationBadge {
  firstGame,
  fiveGames,
  streak3,
  streak7;

  String get id => switch (this) {
        GamificationBadge.firstGame => 'FIRST_GAME',
        GamificationBadge.fiveGames => 'FIVE_GAMES',
        GamificationBadge.streak3 => 'STREAK_3',
        GamificationBadge.streak7 => 'STREAK_7',
      };

  String get title => switch (this) {
        GamificationBadge.firstGame => 'Primeiro jogo',
        GamificationBadge.fiveGames => '5 jogos completos',
        GamificationBadge.streak3 => 'Sequência de 3 dias',
        GamificationBadge.streak7 => 'Sequência de 7 dias',
      };

  String get description => switch (this) {
        GamificationBadge.firstGame => 'Você entrou no ritmo.',
        GamificationBadge.fiveGames => 'Consistência de atleta dedicado.',
        GamificationBadge.streak3 => 'Disciplina em alta.',
        GamificationBadge.streak7 => 'Semana perfeita.',
      };

  String get icon => switch (this) {
        GamificationBadge.firstGame => '🎯',
        GamificationBadge.fiveGames => '🏐',
        GamificationBadge.streak3 => '🔥',
        GamificationBadge.streak7 => '👑',
      };

  static GamificationBadge? fromId(String raw) {
    final id = raw.trim().toUpperCase();
    for (final badge in GamificationBadge.values) {
      if (badge.id == id) return badge;
    }
    return null;
  }
}

enum GamificationMission {
  playToday,
  inviteOnePlayer;

  String get id => switch (this) {
        GamificationMission.playToday => 'PLAY_TODAY',
        GamificationMission.inviteOnePlayer => 'INVITE_ONE_PLAYER',
      };

  String get title => switch (this) {
        GamificationMission.playToday => 'Jogue 1x hoje',
        GamificationMission.inviteOnePlayer => 'Convide 1 jogador',
      };
}

class GamificationSummary {
  const GamificationSummary({
    required this.xp,
    required this.level,
    required this.streak,
    required this.totalGames,
    required this.lastGameDate,
    required this.updatedAt,
  });

  final int xp;
  final int level;
  final int streak;
  final int totalGames;
  final DateTime? lastGameDate;
  final DateTime? updatedAt;

  factory GamificationSummary.initial() {
    return const GamificationSummary(
      xp: 0,
      level: 0,
      streak: 0,
      totalGames: 0,
      lastGameDate: null,
      updatedAt: null,
    );
  }

  factory GamificationSummary.fromMap(Map<String, dynamic> map) {
    DateTime? parseDate(dynamic raw) {
      if (raw is Timestamp) return raw.toDate();
      if (raw is String) return DateTime.tryParse(raw);
      return null;
    }

    final xp = (map['xp'] as num?)?.toInt() ?? 0;
    final level = (map['level'] as num?)?.toInt() ?? _levelFromXp(xp);
    return GamificationSummary(
      xp: xp,
      level: level,
      streak: (map['streak'] as num?)?.toInt() ?? 0,
      totalGames: (map['totalGames'] as num?)?.toInt() ?? 0,
      lastGameDate: parseDate(map['lastGameDate']),
      updatedAt: parseDate(map['updatedAt']),
    );
  }

  int get xpInCurrentLevel => xp % 100;
  int get xpForNextLevel => ((level + 1) * 100) - xp;
  double get progressToNextLevel => (xpInCurrentLevel / 100).clamp(0, 1);

  String? get motivationalNudge {
    final now = DateTime.now();
    if (lastGameDate != null) {
      final diffDays = _dayDifference(lastGameDate!, now);
      if (streak > 0 && diffDays == 1) {
        return 'Faltam poucas horas para manter sua sequência.';
      }
      if (diffDays >= 3) {
        return 'Sentimos sua falta 😢';
      }
    }

    if (xpForNextLevel > 0 && xpForNextLevel <= 30) {
      return 'Você está a $xpForNextLevel XP do próximo nível.';
    }

    if (totalGames >= 12 || streak >= 5) {
      return '🔥 Você está entre os mais ativos.';
    }

    return null;
  }

  static int _levelFromXp(int xp) => (xp ~/ 100).clamp(0, 100000);

  static int _dayDifference(DateTime from, DateTime to) {
    final a = DateTime(from.year, from.month, from.day);
    final b = DateTime(to.year, to.month, to.day);
    return b.difference(a).inDays;
  }
}

class UserBadgeProgress {
  const UserBadgeProgress({
    required this.badge,
    required this.unlockedAt,
  });

  final GamificationBadge badge;
  final DateTime unlockedAt;

  factory UserBadgeProgress.fromMap(Map<String, dynamic> map) {
    final badgeRaw = (map['badgeId'] as String?) ?? '';
    final badge =
        GamificationBadge.fromId(badgeRaw) ?? GamificationBadge.firstGame;
    final ts = map['unlockedAt'];
    final unlockedAt = ts is Timestamp ? ts.toDate() : DateTime.now();
    return UserBadgeProgress(badge: badge, unlockedAt: unlockedAt);
  }
}

class DailyMissionStatus {
  const DailyMissionStatus({
    required this.mission,
    required this.completed,
  });

  final GamificationMission mission;
  final bool completed;
}

class DailyMissionBundle {
  const DailyMissionBundle({
    required this.dayKey,
    required this.missions,
  });

  final String dayKey;
  final List<DailyMissionStatus> missions;
}

class GamificationFeedback {
  const GamificationFeedback({
    required this.xpGained,
    required this.streakIncreased,
    required this.newStreak,
    required this.unlockedBadges,
  });

  final int xpGained;
  final bool streakIncreased;
  final int newStreak;
  final List<GamificationBadge> unlockedBadges;
}
