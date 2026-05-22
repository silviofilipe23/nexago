import 'package:flutter/material.dart';

import '../../../../../core/ui/app_snackbar.dart';
import '../../../domain/achievements/achievement_catalog.dart';
import '../../../domain/achievements/achievement_status.dart';
import '../../../domain/athlete_profile.dart';
import '../../../domain/gamification_models.dart';
import '../../../../arenas/domain/my_booking_item.dart';

/// Versão exibida no rodapé (alinhar com [pubspec.yaml]).
abstract final class AthleteSettingsAppInfo {
  AthleteSettingsAppInfo._();

  static const String versionName = '1.0.0';
  static const String buildNumber = '1';

  static String get footerLabel =>
      'nexaGO · v$versionName · build $buildNumber';
}

void showAthleteSettingsComingSoon(BuildContext context) {
  showAppSnackBar(context, 'Em breve.');
}

String athleteInitialsFromName(String name) {
  final parts = name.trim().split(RegExp(r'\s+'));
  if (parts.isEmpty || parts.first.isEmpty) return '?';
  if (parts.length == 1) {
    final p = parts.first;
    return p.length >= 2
        ? p.substring(0, 2).toUpperCase()
        : p[0].toUpperCase();
  }
  return '${parts.first[0]}${parts.last[0]}'.toUpperCase();
}

int countAthleteNonCanceledBookings(List<MyBookingItem> bookings) {
  return bookings.where((b) {
    final s = b.rawStatus.trim().toLowerCase();
    return s != 'canceled' && s != 'cancelled';
  }).length;
}

int firstBookingXpReward() =>
    AchievementCatalog.byId('FIRST_BOOKING')?.xpReward ?? 30;

/// Dados agregados para subtítulos da tela de configurações.
class AthleteSettingsViewData {
  const AthleteSettingsViewData({
    required this.profile,
    required this.email,
    required this.displayLevel,
    required this.achievements,
    required this.totalBookings,
    required this.totalGames,
    required this.firstBookingXp,
  });

  final AthleteProfile profile;
  final String? email;
  final int displayLevel;
  final AchievementsScreenState achievements;
  final int totalBookings;
  final int totalGames;
  final int firstBookingXp;

  String get profileSubtitle => 'Nome, esporte, bio';

  String get sportsLevelSubtitle {
    final sport = profile.sport.trim();
    final level = profile.level.trim();
    final extraCount = profile.secondarySportFirestoreIds.length;

    if (sport.isEmpty && level.isEmpty) {
      return extraCount > 0
          ? '$extraCount esporte${extraCount == 1 ? '' : 's'} cadastrado${extraCount == 1 ? '' : 's'}'
          : 'Defina esporte e nível';
    }

    String base;
    if (sport.isEmpty) {
      base = level;
    } else if (level.isEmpty) {
      base = sport;
    } else {
      base = '$sport · $level';
    }

    if (extraCount <= 0) return base;
    final suffix =
        extraCount == 1 ? '(+1 esporte)' : '(+$extraCount esportes)';
    return '$base $suffix';
  }

  String get achievementsSubtitle =>
      '${achievements.unlockedCount} desbloqueadas · ${achievements.inProgressCount} em progresso';

  String get achievementsTrailing =>
      '${achievements.unlockedCount}/${achievements.totalCount}';

  String get bookingsSubtitle =>
      '$totalBookings reservas · primeira ganha +$firstBookingXp XP';

  String get matchHistorySubtitle =>
      '$totalGames jogos · $totalBookings reservas';
}

AthleteSettingsViewData buildAthleteSettingsViewData({
  required AthleteProfile profile,
  required String? email,
  required GamificationSummary summary,
  required AchievementsScreenState achievements,
  required List<MyBookingItem> bookings,
}) {
  return AthleteSettingsViewData(
    profile: profile,
    email: email,
    displayLevel: (summary.level + 1).clamp(1, 999),
    achievements: achievements,
    totalBookings: countAthleteNonCanceledBookings(bookings),
    totalGames: summary.totalGames,
    firstBookingXp: firstBookingXpReward(),
  );
}
