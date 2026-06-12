import 'package:flutter/material.dart';

class CompeteHubUserRanking {
  const CompeteHubUserRanking({
    required this.rank,
    required this.seasonLabel,
    required this.subtitle,
    required this.points,
    required this.tournamentsCount,
    this.promotionPointsRemaining,
    this.promotionProgress = 1,
    this.isUnranked = false,
  });

  final int rank;
  final String seasonLabel;
  final String subtitle;
  final int points;
  final int tournamentsCount;
  final int? promotionPointsRemaining;
  final double promotionProgress;
  final bool isUnranked;

  bool get canPromote =>
      !isUnranked && promotionPointsRemaining != null;

  String get rankLabel => isUnranked ? '—' : '#$rank';

  factory CompeteHubUserRanking.unranked({
    required int seasonYear,
    required bool isSeasonMode,
  }) {
    return CompeteHubUserRanking(
      rank: 0,
      seasonLabel: isSeasonMode ? 'TEMPORADA $seasonYear' : 'RANKING GERAL',
      subtitle: isSeasonMode
          ? 'Sem pontos oficiais nesta temporada ainda.'
          : 'Participe de torneios para entrar no ranking.',
      points: 0,
      tournamentsCount: 0,
      isUnranked: true,
    );
  }
}

class CompeteHubAthletePreview {
  const CompeteHubAthletePreview({
    this.userId,
    required this.name,
    required this.categoryLabel,
    required this.initials,
    required this.avatarColor,
    this.avatarUrl,
    this.isOnline = false,
  });

  final String? userId;
  final String name;
  final String categoryLabel;
  final String initials;
  final Color avatarColor;
  final String? avatarUrl;
  final bool isOnline;
}

class CompeteHubRankingEntry {
  const CompeteHubRankingEntry({
    required this.rank,
    required this.initials,
    required this.name,
    required this.points,
    required this.tournamentsCount,
    required this.avatarColor,
    this.avatarUrl,
    this.isCurrentUser = false,
  });

  final int rank;
  final String initials;
  final String name;
  final int points;
  final int tournamentsCount;
  final Color avatarColor;
  final String? avatarUrl;
  final bool isCurrentUser;
}
