import 'package:flutter/material.dart';

import 'achievement_category.dart';
import 'achievement_definition.dart';
import 'achievement_unlock_rule.dart';

/// Catálogo fixo de 24 conquistas (protótipo 03).
abstract final class AchievementCatalog {
  AchievementCatalog._();

  static const totalCount = 24;

  static const List<AchievementDefinition> all = [
    // —— Primeiros passos (8) ——
    AchievementDefinition(
      id: 'WELCOME',
      category: AchievementCategory.primeirosPassos,
      title: 'Bem-vindo',
      description: 'Complete o onboarding.',
      icon: Icons.star_rounded,
      xpReward: 20,
      rule: AchievementUnlockRule.onboardingCompleted(),
      sortOrder: 1,
    ),
    AchievementDefinition(
      id: 'FIRST_GAME',
      category: AchievementCategory.primeirosPassos,
      title: 'Primeiro jogo',
      description: 'Bata uma bola.',
      icon: Icons.sports_volleyball_rounded,
      xpReward: 50,
      rule: AchievementUnlockRule.totalGames(target: 1),
      sortOrder: 2,
    ),
    AchievementDefinition(
      id: 'IDENTITY',
      category: AchievementCategory.primeirosPassos,
      title: 'Identidade',
      description: 'Foto + esporte no perfil.',
      icon: Icons.badge_outlined,
      xpReward: 40,
      rule: AchievementUnlockRule.identityComplete(),
      sortOrder: 3,
    ),
    AchievementDefinition(
      id: 'PROFILE_COMPLETE',
      category: AchievementCategory.primeirosPassos,
      title: 'Perfil completo',
      description: 'Todos os passos do perfil.',
      icon: Icons.verified_outlined,
      xpReward: 80,
      rule: AchievementUnlockRule.profileAllComplete(),
      sortOrder: 4,
    ),
    AchievementDefinition(
      id: 'FIRST_BOOKING',
      category: AchievementCategory.primeirosPassos,
      title: 'Primeira reserva',
      description: 'Reserve sua primeira quadra.',
      icon: Icons.event_available_outlined,
      xpReward: 30,
      rule: AchievementUnlockRule.totalBookings(target: 1),
      sortOrder: 5,
    ),
    AchievementDefinition(
      id: 'FIRST_FAVORITE',
      category: AchievementCategory.primeirosPassos,
      title: 'Arena favorita',
      description: 'Favorite uma arena.',
      icon: Icons.favorite_outline_rounded,
      xpReward: 15,
      rule: AchievementUnlockRule.favoriteArenasCount(target: 1),
      sortOrder: 6,
    ),
    AchievementDefinition(
      id: 'FIRST_INVITE',
      category: AchievementCategory.primeirosPassos,
      title: 'Primeiro convite',
      description: 'Convide alguém para jogar.',
      icon: Icons.send_outlined,
      xpReward: 25,
      rule: AchievementUnlockRule.invitesCount(target: 1),
      sortOrder: 7,
    ),
    AchievementDefinition(
      id: 'FIRST_CHECKIN',
      category: AchievementCategory.primeirosPassos,
      title: 'Check-in',
      description: 'Confirme presença no local.',
      icon: Icons.location_on_outlined,
      xpReward: 25,
      rule: AchievementUnlockRule.checkInsCount(target: 1),
      sortOrder: 8,
    ),
    // —— Constância (8) ——
    AchievementDefinition(
      id: 'FIVE_GAMES',
      category: AchievementCategory.constancia,
      title: '5 jogos',
      description: 'Cinco partidas no total.',
      icon: Icons.looks_5_outlined,
      xpReward: 60,
      rule: AchievementUnlockRule.totalGames(target: 5),
      sortOrder: 9,
    ),
    AchievementDefinition(
      id: 'TEN_GAMES_30D',
      category: AchievementCategory.constancia,
      title: '10 jogos',
      description: '10 partidas em 30 dias.',
      icon: Icons.calendar_month_outlined,
      xpReward: 100,
      rule: AchievementUnlockRule.gamesInLastDays(days: 30, target: 10),
      sortOrder: 10,
    ),
    AchievementDefinition(
      id: 'TWENTY_FIVE_GAMES',
      category: AchievementCategory.constancia,
      title: '25 jogos',
      description: 'Veterano da quadra.',
      icon: Icons.military_tech_outlined,
      xpReward: 120,
      rule: AchievementUnlockRule.totalGames(target: 25),
      sortOrder: 11,
    ),
    AchievementDefinition(
      id: 'STREAK_3',
      category: AchievementCategory.constancia,
      title: 'Sequência 3',
      description: 'Jogue 3 dias seguidos.',
      icon: Icons.whatshot_outlined,
      xpReward: 45,
      rule: AchievementUnlockRule.streak(target: 3),
      sortOrder: 12,
    ),
    AchievementDefinition(
      id: 'STREAK_5',
      category: AchievementCategory.constancia,
      title: 'Em chamas',
      description: 'Sequência de 5 dias.',
      icon: Icons.local_fire_department_outlined,
      xpReward: 70,
      rule: AchievementUnlockRule.streak(target: 5),
      sortOrder: 13,
    ),
    AchievementDefinition(
      id: 'STREAK_7',
      category: AchievementCategory.constancia,
      title: 'Regular',
      description: 'Semana cheia de jogos.',
      icon: Icons.emoji_events_outlined,
      xpReward: 90,
      rule: AchievementUnlockRule.streak(target: 7),
      sortOrder: 14,
    ),
    AchievementDefinition(
      id: 'ATTENDANCE_STREAK_5',
      category: AchievementCategory.constancia,
      title: 'Pontual',
      description: '5 confirmações seguidas.',
      icon: Icons.schedule_rounded,
      xpReward: 55,
      rule: AchievementUnlockRule.attendanceStreak(target: 5),
      sortOrder: 15,
    ),
    AchievementDefinition(
      id: 'ATTENDANCE_TOTAL_10',
      category: AchievementCategory.constancia,
      title: 'Comprometido',
      description: '10 confirmações de presença.',
      icon: Icons.task_alt_outlined,
      xpReward: 75,
      rule: AchievementUnlockRule.attendanceConfirmations(target: 10),
      sortOrder: 16,
    ),
    // —— Social (8) ——
    AchievementDefinition(
      id: 'CONNECTOR',
      category: AchievementCategory.social,
      title: 'Conector',
      description: 'Convide 3 amigos.',
      icon: Icons.group_add_outlined,
      xpReward: 60,
      rule: AchievementUnlockRule.invitesCount(target: 3),
      sortOrder: 17,
    ),
    AchievementDefinition(
      id: 'AMBASSADOR',
      category: AchievementCategory.social,
      title: 'Embaixador',
      description: 'Compartilhe seu perfil.',
      icon: Icons.share_outlined,
      xpReward: 35,
      rule: AchievementUnlockRule.profileSharesCount(target: 1),
      sortOrder: 18,
    ),
    AchievementDefinition(
      id: 'FIVE_INVITES',
      category: AchievementCategory.social,
      title: 'Recrutador',
      description: '5 convites enviados.',
      icon: Icons.diversity_3_outlined,
      xpReward: 80,
      rule: AchievementUnlockRule.invitesCount(target: 5),
      sortOrder: 19,
    ),
    AchievementDefinition(
      id: 'THREE_SHARES',
      category: AchievementCategory.social,
      title: 'Influencer',
      description: 'Compartilhe 3 vezes.',
      icon: Icons.campaign_outlined,
      xpReward: 50,
      rule: AchievementUnlockRule.profileSharesCount(target: 3),
      sortOrder: 20,
    ),
    AchievementDefinition(
      id: 'TEN_INVITES',
      category: AchievementCategory.social,
      title: 'Rede forte',
      description: '10 convites enviados.',
      icon: Icons.hub_outlined,
      xpReward: 120,
      rule: AchievementUnlockRule.invitesCount(target: 10),
      sortOrder: 21,
    ),
    AchievementDefinition(
      id: 'FIVE_SHARES',
      category: AchievementCategory.social,
      title: 'Divulgador',
      description: '5 compartilhamentos.',
      icon: Icons.ios_share_outlined,
      xpReward: 70,
      rule: AchievementUnlockRule.profileSharesCount(target: 5),
      sortOrder: 22,
    ),
    AchievementDefinition(
      id: 'ACTIVE_WEEK',
      category: AchievementCategory.social,
      title: 'Semana ativa',
      description: '4 jogos em 7 dias.',
      icon: Icons.date_range_outlined,
      xpReward: 65,
      rule: AchievementUnlockRule.gamesInLastDays(days: 7, target: 4),
      sortOrder: 23,
    ),
    AchievementDefinition(
      id: 'DEDICATED',
      category: AchievementCategory.social,
      title: 'Dedicado',
      description: '20 jogos no total.',
      icon: Icons.sports_rounded,
      xpReward: 100,
      rule: AchievementUnlockRule.totalGames(target: 20),
      sortOrder: 24,
    ),
  ];

  static final Map<String, AchievementDefinition> _byId = {
    for (final d in all) d.id: d,
  };

  /// IDs legados no Firestore → catálogo atual.
  static const Map<String, String> legacyIdAliases = {
    'attendance_pontual': 'ATTENDANCE_STREAK_5',
    'attendance_comprometido': 'ATTENDANCE_TOTAL_10',
  };

  static AchievementDefinition? byId(String raw) {
    final normalized = normalizeId(raw);
    return _byId[normalized];
  }

  static String normalizeId(String raw) {
    final trimmed = raw.trim();
    if (trimmed.isEmpty) return trimmed;
    final upper = trimmed.toUpperCase().replaceAll('-', '_');
    return legacyIdAliases[trimmed] ??
        legacyIdAliases[upper.toLowerCase()] ??
        upper;
  }

  static List<AchievementDefinition> forCategory(AchievementCategory category) {
    return all.where((d) => d.category == category).toList(growable: false)
      ..sort((a, b) => a.sortOrder.compareTo(b.sortOrder));
  }
}
