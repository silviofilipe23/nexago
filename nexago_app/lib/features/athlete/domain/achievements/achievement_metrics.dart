import '../gamification_models.dart';

/// Métricas agregadas para calcular progresso das conquistas.
class AchievementMetrics {
  const AchievementMetrics({
    required this.xp,
    required this.level,
    required this.streak,
    required this.totalGames,
    required this.invitesCount,
    required this.profileSharesCount,
    required this.gamesLast30Days,
    required this.gamesLast7Days,
    required this.favoriteArenasCount,
    required this.checkInsCount,
    required this.attendanceConfirmationsTotal,
    required this.attendanceConfirmationStreak,
    required this.totalBookings,
    required this.onboardingCompleted,
    required this.profileStepsDone,
    required this.profileAllComplete,
    required this.identityComplete,
  });

  final int xp;
  final int level;
  final int streak;
  final int totalGames;
  final int invitesCount;
  final int profileSharesCount;
  final int gamesLast30Days;
  final int gamesLast7Days;
  final int favoriteArenasCount;
  final int checkInsCount;
  final int attendanceConfirmationsTotal;
  final int attendanceConfirmationStreak;
  final int totalBookings;
  final bool onboardingCompleted;
  final int profileStepsDone;
  final bool profileAllComplete;
  final bool identityComplete;

  factory AchievementMetrics.empty() {
    return const AchievementMetrics(
      xp: 0,
      level: 0,
      streak: 0,
      totalGames: 0,
      invitesCount: 0,
      profileSharesCount: 0,
      gamesLast30Days: 0,
      gamesLast7Days: 0,
      favoriteArenasCount: 0,
      checkInsCount: 0,
      attendanceConfirmationsTotal: 0,
      attendanceConfirmationStreak: 0,
      totalBookings: 0,
      onboardingCompleted: false,
      profileStepsDone: 0,
      profileAllComplete: false,
      identityComplete: false,
    );
  }

  factory AchievementMetrics.fromSummaryMap(
    Map<String, dynamic> map, {
    required bool onboardingCompleted,
    required int profileStepsDone,
    required bool profileAllComplete,
    required bool identityComplete,
    int totalBookings = 0,
  }) {
    final summary = GamificationSummary.fromMap(map);
    return AchievementMetrics(
      xp: summary.xp,
      level: summary.level,
      streak: summary.streak,
      totalGames: summary.totalGames,
      invitesCount: (map['invitesCount'] as num?)?.toInt() ?? 0,
      profileSharesCount: (map['profileSharesCount'] as num?)?.toInt() ?? 0,
      gamesLast30Days: _countGamesInWindow(map, 30),
      gamesLast7Days: _countGamesInWindow(map, 7),
      favoriteArenasCount: (map['favoriteArenasCount'] as num?)?.toInt() ?? 0,
      checkInsCount: (map['checkInsCount'] as num?)?.toInt() ?? 0,
      attendanceConfirmationsTotal:
          (map['attendanceConfirmationsTotal'] as num?)?.toInt() ?? 0,
      attendanceConfirmationStreak:
          (map['attendanceConfirmationStreak'] as num?)?.toInt() ?? 0,
      totalBookings: totalBookings,
      onboardingCompleted: onboardingCompleted,
      profileStepsDone: profileStepsDone,
      profileAllComplete: profileAllComplete,
      identityComplete: identityComplete,
    );
  }

  static int _countGamesInWindow(Map<String, dynamic> map, int days) {
    final stored = (map['gamesLast${days}Days'] as num?)?.toInt();
    if (stored != null) return stored;
    final keys = _parseGameDayKeys(map['gameCompletionDays']);
    return countGameDaysInWindow(keys, days);
  }

  static List<String> _parseGameDayKeys(dynamic raw) {
    if (raw is! List) return const [];
    return raw
        .map((e) => e?.toString().trim() ?? '')
        .where((s) => s.length >= 8)
        .toList(growable: false);
  }

  /// Conta entradas de dias dentro da janela (cada jogo = uma entrada).
  static int countGameDaysInWindow(List<String> dayKeys, int days) {
    if (dayKeys.isEmpty) return 0;
    final cutoff = DateTime.now().subtract(Duration(days: days));
    var count = 0;
    for (final key in dayKeys) {
      final parsed = DateTime.tryParse(key.length >= 10 ? key.substring(0, 10) : key);
      if (parsed != null && !parsed.isBefore(cutoff)) {
        count++;
      }
    }
    return count;
  }
}

/// Extensão de leitura do summary Firestore.
extension GamificationSummaryMetrics on GamificationSummary {
  static AchievementMetrics fromFirestoreData({
    required Map<String, dynamic>? summaryMap,
    required bool onboardingCompleted,
    required int profileStepsDone,
    required bool profileAllComplete,
    required bool identityComplete,
    int totalBookings = 0,
  }) {
    if (summaryMap == null || summaryMap.isEmpty) {
      return AchievementMetrics.empty().copyWith(
        onboardingCompleted: onboardingCompleted,
        profileStepsDone: profileStepsDone,
        profileAllComplete: profileAllComplete,
        identityComplete: identityComplete,
        totalBookings: totalBookings,
      );
    }
    return AchievementMetrics.fromSummaryMap(
      summaryMap,
      onboardingCompleted: onboardingCompleted,
      profileStepsDone: profileStepsDone,
      profileAllComplete: profileAllComplete,
      identityComplete: identityComplete,
      totalBookings: totalBookings,
    );
  }
}

extension AchievementMetricsCopy on AchievementMetrics {
  AchievementMetrics copyWith({
    int? xp,
    int? invitesCount,
    int? profileSharesCount,
    bool? onboardingCompleted,
    int? profileStepsDone,
    bool? profileAllComplete,
    bool? identityComplete,
    int? totalBookings,
  }) {
    return AchievementMetrics(
      xp: xp ?? this.xp,
      level: level,
      streak: streak,
      totalGames: totalGames,
      invitesCount: invitesCount ?? this.invitesCount,
      profileSharesCount: profileSharesCount ?? this.profileSharesCount,
      gamesLast30Days: gamesLast30Days,
      gamesLast7Days: gamesLast7Days,
      favoriteArenasCount: favoriteArenasCount,
      checkInsCount: checkInsCount,
      attendanceConfirmationsTotal: attendanceConfirmationsTotal,
      attendanceConfirmationStreak: attendanceConfirmationStreak,
      totalBookings: totalBookings ?? this.totalBookings,
      onboardingCompleted: onboardingCompleted ?? this.onboardingCompleted,
      profileStepsDone: profileStepsDone ?? this.profileStepsDone,
      profileAllComplete: profileAllComplete ?? this.profileAllComplete,
      identityComplete: identityComplete ?? this.identityComplete,
    );
  }
}
