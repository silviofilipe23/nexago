import 'package:flutter/material.dart';

enum RankingListMode { athletes, teams }

enum RankingGenderFilter { all, male, female, mixed }

class RankingPageFilter {
  const RankingPageFilter({
    this.mode = RankingListMode.athletes,
    this.year,
    this.gender = RankingGenderFilter.all,
    this.level,
  });

  final RankingListMode mode;
  final int? year;
  final RankingGenderFilter gender;
  /// Rank de nível selecionado (`null` = todos os níveis).
  final int? level;

  bool get isGeneralMode => year == null;

  String get pointsModeLabel => isGeneralMode ? 'SOMA TOTAL' : 'MELHORES 5';

  RankingPageFilter copyWith({
    RankingListMode? mode,
    int? Function()? year,
    RankingGenderFilter? gender,
    int? Function()? level,
  }) {
    return RankingPageFilter(
      mode: mode ?? this.mode,
      year: year != null ? year() : this.year,
      gender: gender ?? this.gender,
      level: level != null ? level() : this.level,
    );
  }
}

class RankingListEntry {
  const RankingListEntry({
    required this.rank,
    required this.points,
    required this.tournamentsCount,
    required this.displayName,
    required this.subtitle,
    required this.isCurrentUser,
    this.entityId = '',
    this.initials,
    this.avatarColor,
    this.avatarUrl,
    this.player1Initials,
    this.player2Initials,
    this.player1Color,
    this.player2Color,
    this.player1AvatarUrl,
    this.player2AvatarUrl,
  });

  final int rank;
  final int points;
  final int tournamentsCount;
  final String displayName;
  final String subtitle;
  final bool isCurrentUser;
  final String entityId;
  final String? initials;
  final Color? avatarColor;
  final String? avatarUrl;
  final String? player1Initials;
  final String? player2Initials;
  final Color? player1Color;
  final Color? player2Color;
  final String? player1AvatarUrl;
  final String? player2AvatarUrl;

  bool get isTeam =>
      player1Initials != null &&
      player2Initials != null &&
      player1Initials!.isNotEmpty;

  String get userPositionLabel =>
      isCurrentUser ? 'Sua posição • Você' : displayName;

  bool matchesSearch(String query) {
    if (query.isEmpty) return true;
    final q = query.toLowerCase();
    return displayName.toLowerCase().contains(q) ||
        subtitle.toLowerCase().contains(q);
  }
}
