import 'package:cloud_firestore/cloud_firestore.dart';

enum GamificationBadge {
  firstGame,
  fiveGames,
  streak3,
  streak7,
  profileComplete;

  String get id => switch (this) {
    GamificationBadge.firstGame => 'FIRST_GAME',
    GamificationBadge.fiveGames => 'FIVE_GAMES',
    GamificationBadge.streak3 => 'STREAK_3',
    GamificationBadge.streak7 => 'STREAK_7',
    GamificationBadge.profileComplete => 'PROFILE_COMPLETE',
  };

  String get title => switch (this) {
    GamificationBadge.firstGame => 'Primeiro jogo',
    GamificationBadge.fiveGames => '5 jogos completos',
    GamificationBadge.streak3 => 'Sequência de 3 dias',
    GamificationBadge.streak7 => 'Sequência de 7 dias',
    GamificationBadge.profileComplete => 'Perfil completo',
  };

  String get description => switch (this) {
    GamificationBadge.firstGame => 'Você entrou no ritmo.',
    GamificationBadge.fiveGames => 'Consistência de atleta dedicado.',
    GamificationBadge.streak3 => 'Disciplina em alta.',
    GamificationBadge.streak7 => 'Semana perfeita.',
    GamificationBadge.profileComplete =>
      'Você completou todos os passos do perfil.',
  };

  String get icon => switch (this) {
    GamificationBadge.firstGame => '🎯',
    GamificationBadge.fiveGames => '🏐',
    GamificationBadge.streak3 => '🔥',
    GamificationBadge.streak7 => '👑',
    GamificationBadge.profileComplete => '🏆',
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
  // inviteOnePlayer,
  reserveToday,
  favoriteArena,
  exploreTournament,
  shareProfile;

  String get id => switch (this) {
    GamificationMission.playToday => 'PLAY_TODAY',
    // GamificationMission.inviteOnePlayer => 'INVITE_ONE_PLAYER',
    GamificationMission.reserveToday => 'RESERVE_TODAY',
    GamificationMission.favoriteArena => 'FAVORITE_ARENA',
    GamificationMission.exploreTournament => 'EXPLORE_TOURNAMENT',
    GamificationMission.shareProfile => 'SHARE_PROFILE',
  };

  static GamificationMission? fromId(String raw) {
    final id = raw.trim().toUpperCase();
    for (final m in GamificationMission.values) {
      if (m.id == id) return m;
    }
    return null;
  }
}

class GamificationSummary {
  const GamificationSummary({
    required this.xp,
    required this.level,
    required this.streak,
    required this.totalGames,
    required this.lastGameDate,
    required this.updatedAt,
    this.gameCompletionDays = const [],
    this.streakShieldsAvailable = 0,
    this.highestSandRankTrackIndex = 0,
  });

  final int xp;
  final int level;
  final int streak;
  final int totalGames;
  final DateTime? lastGameDate;
  final DateTime? updatedAt;

  /// Dias com atividade (`YYYY-MM-DD`), usados na UI de sequência.
  final List<String> gameCompletionDays;

  /// Protetores de Sequência disponíveis (perk da trilha de elos).
  final int streakShieldsAvailable;

  /// Maior degrau da trilha de elos já alcançado (fonte: sand-rank-sync).
  final int highestSandRankTrackIndex;

  factory GamificationSummary.initial() {
    return const GamificationSummary(
      xp: 0,
      level: 0,
      streak: 0,
      totalGames: 0,
      lastGameDate: null,
      updatedAt: null,
      gameCompletionDays: [],
    );
  }

  factory GamificationSummary.fromMap(Map<String, dynamic> map) {
    DateTime? parseDate(dynamic raw) {
      if (raw is Timestamp) return raw.toDate();
      if (raw is String) return DateTime.tryParse(raw);
      return null;
    }

    final rawDays = map['gameCompletionDays'];
    final gameDays = rawDays is List
        ? rawDays
            .map((e) => e?.toString().trim() ?? '')
            .where((s) => s.length >= 8)
            .toList(growable: false)
        : const <String>[];

    final xp = (map['xp'] as num?)?.toInt() ?? 0;
    final level = (map['level'] as num?)?.toInt() ?? _levelFromXp(xp);
    return GamificationSummary(
      xp: xp,
      level: level,
      streak: (map['streak'] as num?)?.toInt() ?? 0,
      totalGames: (map['totalGames'] as num?)?.toInt() ?? 0,
      lastGameDate: parseDate(map['lastGameDate']),
      updatedAt: parseDate(map['updatedAt']),
      gameCompletionDays: gameDays,
      streakShieldsAvailable:
          (map['streakShieldsAvailable'] as num?)?.toInt() ?? 0,
      highestSandRankTrackIndex:
          (map['highestSandRankTrackIndex'] as num?)?.toInt() ?? 0,
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
    required this.achievementId,
    required this.title,
    required this.unlockedAt,
    this.legacyBadge,
  });

  final String achievementId;
  final String title;
  final DateTime unlockedAt;
  final GamificationBadge? legacyBadge;

  /// Compatibilidade com código que usa [legacyBadge].
  GamificationBadge get badge =>
      legacyBadge ??
      GamificationBadge.fromId(achievementId) ??
      GamificationBadge.firstGame;

  factory UserBadgeProgress.fromMap(Map<String, dynamic> map) {
    final badgeRaw =
        (map['badgeId'] as String?) ?? (map['id'] as String?) ?? '';
    final achievementId = _normalizeAchievementId(badgeRaw);
    final title = (map['title'] as String?)?.trim();
    final legacy = GamificationBadge.fromId(achievementId);
    final ts = map['unlockedAt'];
    final unlockedAt = ts is Timestamp ? ts.toDate() : DateTime.now();
    return UserBadgeProgress(
      achievementId: achievementId,
      title: title?.isNotEmpty == true
          ? title!
          : (legacy?.title ?? achievementId),
      unlockedAt: unlockedAt,
      legacyBadge: legacy,
    );
  }

  static String _normalizeAchievementId(String raw) {
    final t = raw.trim();
    if (t.isEmpty) return t;
    const aliases = {
      'attendance_pontual': 'ATTENDANCE_STREAK_5',
      'attendance_comprometido': 'ATTENDANCE_TOTAL_10',
    };
    if (aliases.containsKey(t)) return aliases[t]!;
    return t.toUpperCase().replaceAll('-', '_');
  }
}

class DailyMissionStatus {
  const DailyMissionStatus({required this.mission, required this.completed});

  final GamificationMission mission;
  final bool completed;
}

class DailyMissionBundle {
  const DailyMissionBundle({required this.dayKey, required this.missions});

  final String dayKey;
  final List<DailyMissionStatus> missions;
}

class GamificationFeedback {
  const GamificationFeedback({
    required this.xpGained,
    required this.streakIncreased,
    required this.newStreak,
    required this.unlockedBadges,
    this.unlockedAchievementIds = const [],
    this.completedMissionIds = const [],
    this.title,
  });

  final int xpGained;
  final bool streakIncreased;
  final int newStreak;
  final List<GamificationBadge> unlockedBadges;
  final List<String> unlockedAchievementIds;
  final List<String> completedMissionIds;
  final String? title;
}
