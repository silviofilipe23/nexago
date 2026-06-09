import 'package:intl/intl.dart';

import 'athlete_display_name.dart';
import 'athlete_firestore_codes.dart';
import 'athlete_profile.dart';
import 'athlete_public_profile_models.dart';

enum AthleteDiscoverSort { ranking, proximity, level }

enum AthleteDiscoverGenderFilter { all, male, female }

enum AthleteDiscoverGameObjective { balanced, trainDown, trainUp }

/// Chip rápido de nível (Iniciante / Intermediário / Open / Pro).
class AthleteDiscoverQuickLevel {
  const AthleteDiscoverQuickLevel({required this.label});

  final String label;

  static const all = AthleteDiscoverQuickLevel(label: '');
  static const iniciante = AthleteDiscoverQuickLevel(label: 'Iniciante');
  static const intermediario = AthleteDiscoverQuickLevel(label: 'Intermediário');
  static const open = AthleteDiscoverQuickLevel(label: 'Open');
  static const pro = AthleteDiscoverQuickLevel(label: 'Pro');

  static const values = [all, iniciante, intermediario, open, pro];
}

class AthleteDiscoverFilters {
  const AthleteDiscoverFilters({
    this.sportFirestoreId,
    this.levels = const {},
    this.gender = AthleteDiscoverGenderFilter.all,
    this.gameObjective,
    this.maxDistanceKm = 50,
    this.unlimitedDistance = true,
    this.availableNowOnly = false,
    this.lookingForPartnerOnly = false,
    this.completeProfileOnly = false,
    this.quickLevel = AthleteDiscoverQuickLevel.all,
  });

  final String? sportFirestoreId;
  final Set<String> levels;
  final AthleteDiscoverGenderFilter gender;
  final AthleteDiscoverGameObjective? gameObjective;
  final double maxDistanceKm;
  final bool unlimitedDistance;
  final bool availableNowOnly;
  final bool lookingForPartnerOnly;
  final bool completeProfileOnly;
  final AthleteDiscoverQuickLevel quickLevel;

  static const defaults = AthleteDiscoverFilters();

  bool get hasActiveFilters =>
      sportFirestoreId != null ||
      levels.isNotEmpty ||
      gender != AthleteDiscoverGenderFilter.all ||
      gameObjective != null ||
      !unlimitedDistance ||
      availableNowOnly ||
      lookingForPartnerOnly ||
      completeProfileOnly ||
      quickLevel.label.isNotEmpty;

  AthleteDiscoverFilters copyWith({
    Object? sportFirestoreId = _unset,
    Set<String>? levels,
    AthleteDiscoverGenderFilter? gender,
    Object? gameObjective = _unset,
    double? maxDistanceKm,
    bool? unlimitedDistance,
    bool? availableNowOnly,
    bool? lookingForPartnerOnly,
    bool? completeProfileOnly,
    AthleteDiscoverQuickLevel? quickLevel,
  }) {
    return AthleteDiscoverFilters(
      sportFirestoreId: identical(sportFirestoreId, _unset)
          ? this.sportFirestoreId
          : sportFirestoreId as String?,
      levels: levels ?? this.levels,
      gender: gender ?? this.gender,
      gameObjective: identical(gameObjective, _unset)
          ? this.gameObjective
          : gameObjective as AthleteDiscoverGameObjective?,
      maxDistanceKm: maxDistanceKm ?? this.maxDistanceKm,
      unlimitedDistance: unlimitedDistance ?? this.unlimitedDistance,
      availableNowOnly: availableNowOnly ?? this.availableNowOnly,
      lookingForPartnerOnly:
          lookingForPartnerOnly ?? this.lookingForPartnerOnly,
      completeProfileOnly: completeProfileOnly ?? this.completeProfileOnly,
      quickLevel: quickLevel ?? this.quickLevel,
    );
  }

  static const _unset = Object();
}

class AthleteDiscoverEntry {
  const AthleteDiscoverEntry({
    required this.userId,
    required this.profile,
    required this.ranking,
    this.isFollowing = false,
    this.isCurrentUser = false,
    this.followersCount = 0,
    this.mutualFollowersCount,
  });

  final String userId;
  final AthleteProfile profile;
  final AthletePublicRankingSnapshot ranking;
  final bool isFollowing;
  final bool isCurrentUser;
  final int followersCount;

  /// Seguidores em comum com o atleta logado; `null` sem sessão.
  final int? mutualFollowersCount;

  String get displayName => athleteDisplayName(profile);

  String get initials => athleteInitials(profile);

  String? get handle => athletePublicHandle(profile);

  String get displayCategory {
    final cat = profile.category?.trim() ?? '';
    if (cat.isNotEmpty) return cat;
    return '';
  }

  String get ageLabel => athleteAgeCategoryLabel(profile.birthDate);

  int? get ageYears {
    final iso = AthleteFirestoreCodes.birthDateBrToIso(profile.birthDate);
    if (iso == null) return null;
    final year = int.tryParse(iso.substring(0, 4));
    if (year == null) return null;
    return DateTime.now().year - year;
  }

  String get ageYearsLabel {
    final age = ageYears;
    if (age == null) return '';
    return '$age anos';
  }

  String get formattedRankPoints =>
      NumberFormat.decimalPattern('pt_BR').format(rankPoints);

  String get formattedFollowersCount => formatSocialCount(followersCount);

  String get formattedMutualFollowersCount =>
      formatSocialCount(mutualFollowersCount ?? 0);

  String get locationLabel => athleteLocationLabel(profile);

  /// v1: proxy por cidade/UF (km fixo quando na mesma região).
  String? proximityDistanceLabel(AthleteProfile? viewer) {
    if (viewer == null) return null;
    final viewerCity = viewer.city.trim().toLowerCase();
    final city = profile.city.trim().toLowerCase();
    if (viewerCity.isNotEmpty && city == viewerCity) return '2.1 km';
    final viewerState = viewer.state?.trim().toLowerCase() ?? '';
    final state = profile.state?.trim().toLowerCase() ?? '';
    if (viewerState.isNotEmpty && state.isNotEmpty && viewerState == state) {
      return '25 km';
    }
    return null;
  }

  String get genderShortLabel {
    final g = profile.gender?.trim().toLowerCase() ?? '';
    if (g.startsWith('masc')) return '♂';
    if (g.startsWith('fem')) return '♀';
    return '';
  }

  String get genderLabel => athleteGenderShortLabel(profile.gender);

  String get primarySportLabel {
    final id = profile.primarySportFirestoreId;
    if (id != null && id.isNotEmpty) {
      final label = AthleteFirestoreCodes.sportFirestoreToLabel(id);
      if (label != null && label.isNotEmpty) return label;
    }
    return profile.sport.trim().isNotEmpty ? profile.sport : '—';
  }

  int get levelSegments => resolveAthleteLevelSegments(profile);

  String get levelLabel => resolveAthleteLevelLabel(profile);

  int get rankPoints => ranking.points;

  int? get rankPosition => ranking.hasRank ? ranking.rank : null;

  bool get supportsOnlineStatus => profile.lastActiveAt != null;
}

class AthleteDiscoverPageResult {
  const AthleteDiscoverPageResult({
    required this.profiles,
    this.lastDocumentId,
    this.hasMore = false,
  });

  final List<AthleteProfile> profiles;
  final String? lastDocumentId;
  final bool hasMore;
}
