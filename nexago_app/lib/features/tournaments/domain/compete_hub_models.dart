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
    required this.name,
    required this.categoryLabel,
    required this.initials,
    required this.avatarColor,
    this.isOnline = false,
  });

  final String name;
  final String categoryLabel;
  final String initials;
  final Color avatarColor;
  final bool isOnline;
}

class CompeteHubTeamPreview {
  const CompeteHubTeamPreview({
    required this.partnerName,
    required this.categoryLabel,
    required this.monthsTogether,
    required this.winRatePercent,
    required this.wins,
    required this.losses,
    required this.partnerInitials,
    required this.partnerColor,
  });

  final String partnerName;
  final String categoryLabel;
  final int monthsTogether;
  final int winRatePercent;
  final int wins;
  final int losses;
  final String partnerInitials;
  final Color partnerColor;
}

class CompeteHubRankingEntry {
  const CompeteHubRankingEntry({
    required this.rank,
    required this.initials,
    required this.name,
    required this.points,
    required this.tournamentsCount,
    required this.avatarColor,
    this.isCurrentUser = false,
  });

  final int rank;
  final String initials;
  final String name;
  final int points;
  final int tournamentsCount;
  final Color avatarColor;
  final bool isCurrentUser;
}
