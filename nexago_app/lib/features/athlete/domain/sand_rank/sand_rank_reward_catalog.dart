import 'package:flutter/material.dart';

import 'sand_rank_models.dart';

/// Catálogo de recompensas da trilha de elos.
///
/// Porte 1:1 de `SAND_RANK_REWARD_CATALOG` em
/// `functions/src/sand-rank-engine.ts` — qualquer recompensa nova precisa
/// ser adicionada lá também (é a CF que concede; aqui é só exibição).
class SandRankRewardDefinition {
  const SandRankRewardDefinition({
    required this.id,
    required this.type,
    required this.trackIndex,
    required this.title,
    required this.description,
  });

  final String id;
  final SandRankRewardType type;
  final int trackIndex;
  final String title;
  final String description;
}

abstract final class SandRankRewardCatalog {
  SandRankRewardCatalog._();

  static const List<SandRankRewardDefinition> all = [
    // —— Iniciante ——
    SandRankRewardDefinition(
      id: 'EMBLEM_INICIANTE',
      type: SandRankRewardType.emblem,
      trackIndex: 0,
      title: 'Emblema Iniciante',
      description: 'Seu primeiro emblema de elo.',
    ),
    SandRankRewardDefinition(
      id: 'FRAME_INICIANTE',
      type: SandRankRewardType.avatarFrame,
      trackIndex: 0,
      title: 'Moldura Iniciante',
      description: 'Moldura de avatar do elo Iniciante.',
    ),
    SandRankRewardDefinition(
      id: 'TITLE_INICIANTE',
      type: SandRankRewardType.title,
      trackIndex: 1,
      title: 'Pé na Areia',
      description: 'Título exclusivo do Iniciante II.',
    ),
    SandRankRewardDefinition(
      id: 'FRAME_INICIANTE_GOLD',
      type: SandRankRewardType.avatarFrame,
      trackIndex: 2,
      title: 'Moldura Iniciante dourada',
      description: 'Versão dourada da moldura Iniciante.',
    ),
    // —— Competidor ——
    SandRankRewardDefinition(
      id: 'EMBLEM_COMPETIDOR',
      type: SandRankRewardType.emblem,
      trackIndex: 3,
      title: 'Emblema Competidor',
      description: 'Emblema do elo Competidor.',
    ),
    SandRankRewardDefinition(
      id: 'FRAME_COMPETIDOR',
      type: SandRankRewardType.avatarFrame,
      trackIndex: 3,
      title: 'Moldura Competidor',
      description: 'Moldura de avatar do elo Competidor.',
    ),
    SandRankRewardDefinition(
      id: 'TITLE_COMPETIDOR',
      type: SandRankRewardType.title,
      trackIndex: 4,
      title: 'Ritmo de Jogo',
      description: 'Título exclusivo do Competidor II.',
    ),
    SandRankRewardDefinition(
      id: 'FRAME_COMPETIDOR_GOLD',
      type: SandRankRewardType.avatarFrame,
      trackIndex: 5,
      title: 'Moldura Competidor dourada',
      description: 'Versão dourada da moldura Competidor.',
    ),
    // —— Desafiante ——
    SandRankRewardDefinition(
      id: 'EMBLEM_DESAFIANTE',
      type: SandRankRewardType.emblem,
      trackIndex: 6,
      title: 'Emblema Desafiante',
      description: 'Emblema do elo Desafiante.',
    ),
    SandRankRewardDefinition(
      id: 'FRAME_DESAFIANTE',
      type: SandRankRewardType.avatarFrame,
      trackIndex: 6,
      title: 'Moldura Desafiante',
      description: 'Moldura de avatar do elo Desafiante.',
    ),
    SandRankRewardDefinition(
      id: 'PERK_STREAK_SHIELD_1',
      type: SandRankRewardType.perk,
      trackIndex: 6,
      title: 'Protetor de Sequência',
      description: '1 escudo por mês: um dia perdido não zera sua sequência.',
    ),
    SandRankRewardDefinition(
      id: 'TITLE_DESAFIANTE',
      type: SandRankRewardType.title,
      trackIndex: 7,
      title: 'Dono da Quadra',
      description: 'Título exclusivo do Desafiante II.',
    ),
    SandRankRewardDefinition(
      id: 'FRAME_DESAFIANTE_GOLD',
      type: SandRankRewardType.avatarFrame,
      trackIndex: 8,
      title: 'Moldura Desafiante dourada',
      description: 'Versão dourada da moldura Desafiante.',
    ),
    // —— Elite ——
    SandRankRewardDefinition(
      id: 'EMBLEM_ELITE',
      type: SandRankRewardType.emblem,
      trackIndex: 9,
      title: 'Emblema Elite',
      description: 'Emblema do elo Elite.',
    ),
    SandRankRewardDefinition(
      id: 'FRAME_ELITE',
      type: SandRankRewardType.avatarFrame,
      trackIndex: 9,
      title: 'Moldura Elite',
      description: 'Moldura de avatar do elo Elite.',
    ),
    SandRankRewardDefinition(
      id: 'TITLE_ELITE',
      type: SandRankRewardType.title,
      trackIndex: 10,
      title: 'Elite da Areia',
      description: 'Título exclusivo do Elite II.',
    ),
    SandRankRewardDefinition(
      id: 'FRAME_ELITE_GOLD',
      type: SandRankRewardType.avatarFrame,
      trackIndex: 11,
      title: 'Moldura Elite dourada',
      description: 'Versão dourada da moldura Elite.',
    ),
    // —— Mestre ——
    SandRankRewardDefinition(
      id: 'EMBLEM_MESTRE',
      type: SandRankRewardType.emblem,
      trackIndex: 12,
      title: 'Emblema Mestre',
      description: 'Emblema do elo Mestre.',
    ),
    SandRankRewardDefinition(
      id: 'FRAME_MESTRE',
      type: SandRankRewardType.avatarFrame,
      trackIndex: 12,
      title: 'Moldura Mestre',
      description: 'Moldura de avatar do elo Mestre.',
    ),
    SandRankRewardDefinition(
      id: 'PERK_STREAK_SHIELD_2',
      type: SandRankRewardType.perk,
      trackIndex: 12,
      title: 'Protetor de Sequência+',
      description: '2 escudos por mês para proteger sua sequência.',
    ),
    SandRankRewardDefinition(
      id: 'TITLE_MESTRE',
      type: SandRankRewardType.title,
      trackIndex: 13,
      title: 'Imparável',
      description: 'Título exclusivo do Mestre II.',
    ),
    SandRankRewardDefinition(
      id: 'FRAME_MESTRE_GOLD',
      type: SandRankRewardType.avatarFrame,
      trackIndex: 14,
      title: 'Moldura Mestre dourada',
      description: 'Versão dourada da moldura Mestre.',
    ),
    // —— Lenda ——
    SandRankRewardDefinition(
      id: 'EMBLEM_LENDA',
      type: SandRankRewardType.emblem,
      trackIndex: 15,
      title: 'Emblema Lenda',
      description: 'O emblema lendário — o topo da trilha.',
    ),
    SandRankRewardDefinition(
      id: 'FRAME_LENDA',
      type: SandRankRewardType.avatarFrame,
      trackIndex: 15,
      title: 'Moldura Lenda',
      description: 'Moldura dourada animada, exclusiva das Lendas.',
    ),
    SandRankRewardDefinition(
      id: 'TITLE_LENDA',
      type: SandRankRewardType.title,
      trackIndex: 15,
      title: 'Lenda',
      description: 'O título máximo do NexaGO.',
    ),
    SandRankRewardDefinition(
      id: 'VOUCHER_LENDA',
      type: SandRankRewardType.partnerVoucher,
      trackIndex: 15,
      title: 'Recompensa de parceiro',
      description: 'Benefício exclusivo de parceiros para Lendas. Em breve.',
    ),
  ];

  static List<SandRankRewardDefinition> forTrackIndex(int trackIndex) {
    return all
        .where((r) => r.trackIndex == trackIndex)
        .toList(growable: false);
  }

  static SandRankRewardDefinition? byId(String id) {
    for (final reward in all) {
      if (reward.id == id) return reward;
    }
    return null;
  }

  /// Título exibível para um `titleId` equipado (ex.: 'TITLE_MESTRE').
  static String? displayTitleFor(String? titleId) {
    if (titleId == null) return null;
    final def = byId(titleId);
    return def?.type == SandRankRewardType.title ? def!.title : null;
  }
}

/// Identidade visual por elo — cor base usada em emblemas, barras e trilha.
Color sandRankColor(String rankCode) {
  return switch (rankCode) {
    'INICIANTE' => const Color(0xFFB08D57), // bronze-areia
    'COMPETIDOR' => const Color(0xFF2F6FBF), // azul
    'DESAFIANTE' => const Color(0xFF17A2A6), // turquesa
    'ELITE' => const Color(0xFF7B4FBF), // roxo
    'MESTRE' => const Color(0xFFC0392B), // carmesim
    'LENDA' => const Color(0xFFD4A017), // dourado
    _ => const Color(0xFFB08D57),
  };
}

/// Asset do emblema do elo (gerados via IA — assets/sand_rank/).
String sandRankEmblemAsset(String rankCode) {
  final code = rankCode.trim().toLowerCase();
  const known = {
    'iniciante',
    'competidor',
    'desafiante',
    'elite',
    'mestre',
    'lenda',
  };
  final safe = known.contains(code) ? code : 'iniciante';
  return 'assets/sand_rank/emblem_$safe.png';
}
