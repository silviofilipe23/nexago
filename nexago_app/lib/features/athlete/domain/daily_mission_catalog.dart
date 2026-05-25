import 'package:flutter/material.dart';

/// Catálogo único de missões diárias (IDs, copy, XP, ícones).
abstract final class DailyMissionCatalog {
  DailyMissionCatalog._();

  static const List<DailyMissionDefinition> all = [
    DailyMissionDefinition(
      id: 'PLAY_TODAY',
      title: 'Jogue 1x hoje',
      subtitle: 'Bata bola em qualquer arena.',
      xpReward: 40,
      icon: Icons.sports_tennis_rounded,
    ),
    // DailyMissionDefinition(
    //   id: 'INVITE_ONE_PLAYER',
    //   title: 'Convide 1 jogador',
    //   subtitle: 'Cada amigo que aceita vale +50 XP.',
    //   xpReward: 30,
    //   icon: Icons.person_add_rounded,
    // ),
    DailyMissionDefinition(
      id: 'RESERVE_TODAY',
      title: 'Reserve uma quadra hoje',
      subtitle: 'Confirme um horário para jogar hoje.',
      xpReward: 35,
      icon: Icons.event_available_rounded,
    ),
    DailyMissionDefinition(
      id: 'FAVORITE_ARENA',
      title: 'Favorite uma arena',
      subtitle: 'Salve uma arena para achar rápido depois.',
      xpReward: 15,
      icon: Icons.favorite_rounded,
    ),
    DailyMissionDefinition(
      id: 'EXPLORE_TOURNAMENT',
      title: 'Explore um torneio',
      subtitle: 'Veja detalhes de um torneio ou liga.',
      xpReward: 20,
      icon: Icons.emoji_events_outlined,
    ),
    DailyMissionDefinition(
      id: 'SHARE_PROFILE',
      title: 'Compartilhe seu perfil',
      subtitle: 'Mostre seu perfil para amigos.',
      xpReward: 20,
      icon: Icons.share_rounded,
    ),
  ];

  static int totalXpReward() => all.fold<int>(0, (sum, m) => sum + m.xpReward);

  static DailyMissionDefinition? byId(String raw) {
    final id = raw.trim().toUpperCase();
    for (final m in all) {
      if (m.id == id) return m;
    }
    return null;
  }

  static int xpForId(String missionId) => byId(missionId)?.xpReward ?? 20;

  static String subtitleForId(String missionId) =>
      byId(missionId)?.subtitle ?? '';

  static IconData iconForId(String missionId) =>
      byId(missionId)?.icon ?? Icons.flag_rounded;
}

class DailyMissionDefinition {
  const DailyMissionDefinition({
    required this.id,
    required this.title,
    required this.subtitle,
    required this.xpReward,
    required this.icon,
  });

  final String id;
  final String title;
  final String subtitle;
  final int xpReward;
  final IconData icon;
}
