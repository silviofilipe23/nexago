import 'package:intl/intl.dart';

import '../../athlete/domain/athlete_display_name.dart';
import '../../athlete/domain/athlete_firestore_codes.dart';
import '../../athlete/domain/athlete_profile.dart';
import '../../athlete/domain/athlete_public_profile_models.dart';
import '../../ranking/domain/ranking_list_models.dart';
import 'tournament_team.dart';

enum TeamDiscoverSort { ranking, proximity, trending }

enum TeamDiscoverGenderFilter {
  all,
  male,
  female,
  mixed;

  String get chipLabel => switch (this) {
    TeamDiscoverGenderFilter.all => 'Todos',
    TeamDiscoverGenderFilter.male => 'Masculino',
    TeamDiscoverGenderFilter.female => 'Feminino',
    TeamDiscoverGenderFilter.mixed => 'Misto',
  };
}

enum TeamDiscoverPartnershipFilter { all, active, lookingForPartner }

class TeamDiscoverFilters {
  const TeamDiscoverFilters({
    this.sportFirestoreId,
    this.gender = TeamDiscoverGenderFilter.all,
    this.partnership = TeamDiscoverPartnershipFilter.all,
    this.maxDistanceKm = 50,
    this.unlimitedDistance = true,
    this.availableNowOnly = false,
    this.trendingOnly = false,
    this.sameRankingRangeOnly = false,
  });

  final String? sportFirestoreId;
  final TeamDiscoverGenderFilter gender;
  final TeamDiscoverPartnershipFilter partnership;
  final double maxDistanceKm;
  final bool unlimitedDistance;
  final bool availableNowOnly;
  final bool trendingOnly;
  final bool sameRankingRangeOnly;

  static const defaults = TeamDiscoverFilters();

  bool get hasActiveFilters =>
      sportFirestoreId != null ||
      gender != TeamDiscoverGenderFilter.all ||
      partnership != TeamDiscoverPartnershipFilter.all ||
      !unlimitedDistance ||
      availableNowOnly ||
      trendingOnly ||
      sameRankingRangeOnly;

  TeamDiscoverFilters copyWith({
    Object? sportFirestoreId = _unset,
    TeamDiscoverGenderFilter? gender,
    TeamDiscoverPartnershipFilter? partnership,
    double? maxDistanceKm,
    bool? unlimitedDistance,
    bool? availableNowOnly,
    bool? trendingOnly,
    bool? sameRankingRangeOnly,
  }) {
    return TeamDiscoverFilters(
      sportFirestoreId: identical(sportFirestoreId, _unset)
          ? this.sportFirestoreId
          : sportFirestoreId as String?,
      gender: gender ?? this.gender,
      partnership: partnership ?? this.partnership,
      maxDistanceKm: maxDistanceKm ?? this.maxDistanceKm,
      unlimitedDistance: unlimitedDistance ?? this.unlimitedDistance,
      availableNowOnly: availableNowOnly ?? this.availableNowOnly,
      trendingOnly: trendingOnly ?? this.trendingOnly,
      sameRankingRangeOnly: sameRankingRangeOnly ?? this.sameRankingRangeOnly,
    );
  }

  static const _unset = Object();
}

class TeamDiscoverRankingSnapshot {
  const TeamDiscoverRankingSnapshot({
    this.rank,
    this.points = 0,
    this.tournamentsCount = 0,
  });

  final int? rank;
  final int points;
  final int tournamentsCount;

  bool get hasRank => rank != null && rank! > 0;
}

class TeamDiscoverEntry {
  const TeamDiscoverEntry({
    required this.teamId,
    required this.team,
    this.player1,
    this.player2,
    this.ranking = const TeamDiscoverRankingSnapshot(),
    this.isFollowing = false,
    this.isCurrentUserTeam = false,
  });

  final String teamId;
  final TournamentTeam team;
  final AthleteProfile? player1;
  final AthleteProfile? player2;
  final TeamDiscoverRankingSnapshot ranking;
  final bool isFollowing;
  final bool isCurrentUserTeam;

  bool get isLookingForPartner => team.isLookingForPartner;

  bool get supportsOnlineStatus =>
      player1?.lastActiveAt != null || player2?.lastActiveAt != null;

  String get displayName {
    final name = team.teamName?.trim();
    if (name != null && name.isNotEmpty) return name;
    return pairDisplayName(player1, player2);
  }

  String get membersLabel {
    final p1 = player1 != null
        ? athleteDisplayName(player1!, fallback: '')
        : '';
    final p2 = player2 != null
        ? athleteDisplayName(player2!, fallback: '')
        : '';
    if (p1.isNotEmpty && p2.isNotEmpty && p1 != p2) {
      return '$p1 · $p2';
    }
    if (p1.isNotEmpty) return p1;
    return p2;
  }

  String get displayCategory {
    final cat = player1?.category?.trim() ?? player2?.category?.trim() ?? '';
    return cat;
  }

  String get primarySportLabel {
    final profile = player1 ?? player2;
    if (profile == null) return '—';
    final id = profile.primarySportFirestoreId;
    if (id != null && id.isNotEmpty) {
      final label = AthleteFirestoreCodes.sportFirestoreToLabel(id);
      if (label != null && label.isNotEmpty) return label;
    }
    return profile.sport.trim().isNotEmpty ? profile.sport : '—';
  }

  String get player1Initials =>
      player1 != null ? athleteInitials(player1!) : '?';

  String get player2Initials =>
      player2 != null ? athleteInitials(player2!) : '?';

  int? get rankPosition => ranking.hasRank ? ranking.rank : null;

  int get rankPoints => ranking.points;

  String get formattedRankPoints =>
      NumberFormat.decimalPattern('pt_BR').format(rankPoints);

  /// Barra de 5 pontos (nível do jogador 1 / esporte primário).
  int get levelSegments {
    final profile = player1 ?? player2;
    if (profile == null) return 2;
    final sportId = profile.primarySportFirestoreId?.trim();
    if (sportId != null && sportId.isNotEmpty) {
      final bySport = profile.levelsBySportFirestore[sportId]?.trim();
      if (bySport != null && bySport.isNotEmpty) {
        return levelSegmentsFromCode(bySport);
      }
    }
    return levelSegmentsFromCode(profile.level);
  }

  /// v1: proxy por cidade/UF (km fixo quando na mesma região).
  String? proximityDistanceLabel(AthleteProfile? viewer) {
    if (viewer == null) return null;
    final profile = player1 ?? player2;
    if (profile == null) return null;
    final viewerCity = viewer.city.trim().toLowerCase();
    final city = profile.city.trim().toLowerCase();
    if (viewerCity.isNotEmpty && city == viewerCity) return '8 km';
    final viewerState = viewer.state?.trim().toLowerCase() ?? '';
    final state = profile.state?.trim().toLowerCase() ?? '';
    if (viewerState.isNotEmpty && state.isNotEmpty && viewerState == state) {
      return '25 km';
    }
    return null;
  }
}

class TeamDiscoverPageResult {
  const TeamDiscoverPageResult({
    required this.teams,
    this.lastDocumentId,
    this.hasMore = false,
  });

  final List<TournamentTeam> teams;
  final String? lastDocumentId;
  final bool hasMore;
}

/// Converte filtro de duplas para o enum do ranking quando útil.
RankingGenderFilter? teamDiscoverGenderToRanking(TeamDiscoverGenderFilter g) {
  return switch (g) {
    TeamDiscoverGenderFilter.all => RankingGenderFilter.all,
    TeamDiscoverGenderFilter.male => RankingGenderFilter.male,
    TeamDiscoverGenderFilter.female => RankingGenderFilter.female,
    TeamDiscoverGenderFilter.mixed => RankingGenderFilter.mixed,
  };
}
