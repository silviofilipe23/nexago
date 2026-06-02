import 'athlete_firestore_codes.dart';
import 'athlete_profile.dart';
import 'athlete_public_profile_models.dart';

enum AthleteDiscoverSort { ranking, proximity, level }

enum AthleteDiscoverGenderFilter { all, male, female }

enum AthleteDiscoverGameObjective {
  balanced,
  trainDown,
  trainUp,
}

/// Chip rápido de categoria (Cat A / B / C / PRO).
class AthleteDiscoverQuickCategory {
  const AthleteDiscoverQuickCategory({required this.label});

  final String label;

  static const all = AthleteDiscoverQuickCategory(label: '');
  static const catA = AthleteDiscoverQuickCategory(label: 'Cat A');
  static const catB = AthleteDiscoverQuickCategory(label: 'Cat B');
  static const catC = AthleteDiscoverQuickCategory(label: 'Cat C');
  static const pro = AthleteDiscoverQuickCategory(label: 'PRO');

  static const values = [all, catA, catB, catC, pro];
}

class AthleteDiscoverFilters {
  const AthleteDiscoverFilters({
    this.sportFirestoreId,
    this.categories = const {},
    this.gender = AthleteDiscoverGenderFilter.all,
    this.gameObjective,
    this.maxDistanceKm = 50,
    this.unlimitedDistance = true,
    this.availableNowOnly = false,
    this.lookingForPartnerOnly = false,
    this.completeProfileOnly = false,
    this.quickCategory = AthleteDiscoverQuickCategory.all,
  });

  final String? sportFirestoreId;
  final Set<String> categories;
  final AthleteDiscoverGenderFilter gender;
  final AthleteDiscoverGameObjective? gameObjective;
  final double maxDistanceKm;
  final bool unlimitedDistance;
  final bool availableNowOnly;
  final bool lookingForPartnerOnly;
  final bool completeProfileOnly;
  final AthleteDiscoverQuickCategory quickCategory;

  static const defaults = AthleteDiscoverFilters();

  bool get hasActiveFilters =>
      sportFirestoreId != null ||
      categories.isNotEmpty ||
      gender != AthleteDiscoverGenderFilter.all ||
      gameObjective != null ||
      !unlimitedDistance ||
      availableNowOnly ||
      lookingForPartnerOnly ||
      completeProfileOnly ||
      quickCategory.label.isNotEmpty;

  AthleteDiscoverFilters copyWith({
    Object? sportFirestoreId = _unset,
    Set<String>? categories,
    AthleteDiscoverGenderFilter? gender,
    Object? gameObjective = _unset,
    double? maxDistanceKm,
    bool? unlimitedDistance,
    bool? availableNowOnly,
    bool? lookingForPartnerOnly,
    bool? completeProfileOnly,
    AthleteDiscoverQuickCategory? quickCategory,
  }) {
    return AthleteDiscoverFilters(
      sportFirestoreId: identical(sportFirestoreId, _unset)
          ? this.sportFirestoreId
          : sportFirestoreId as String?,
      categories: categories ?? this.categories,
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
      quickCategory: quickCategory ?? this.quickCategory,
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
  });

  final String userId;
  final AthleteProfile profile;
  final AthletePublicRankingSnapshot ranking;
  final bool isFollowing;
  final bool isCurrentUser;

  String get displayName =>
      profile.name.trim().isNotEmpty ? profile.name.trim() : 'Atleta';

  String get initials => athleteInitialsFromName(displayName);

  String? get handle => athletePublicHandle(profile);

  String get displayCategory {
    final cat = profile.category?.trim() ?? '';
    if (cat.isNotEmpty) return cat;
    return '';
  }

  String get ageLabel => athleteAgeCategoryLabel(profile.birthDate);

  String get genderShortLabel {
    final g = profile.gender?.trim().toLowerCase() ?? '';
    if (g.startsWith('masc')) return '♂';
    if (g.startsWith('fem')) return '♀';
    return '';
  }

  String get primarySportLabel {
    final id = profile.primarySportFirestoreId;
    if (id != null && id.isNotEmpty) {
      final label = AthleteFirestoreCodes.sportFirestoreToLabel(id);
      if (label != null && label.isNotEmpty) return label;
    }
    return profile.sport.trim().isNotEmpty ? profile.sport : '—';
  }

  int get levelSegments {
    final id = profile.primarySportFirestoreId;
    if (id != null && profile.levelsBySportFirestore.containsKey(id)) {
      return levelSegmentsFromCode(profile.levelsBySportFirestore[id]);
    }
    return levelSegmentsFromCode(profile.level);
  }

  String get levelLabel => profile.level.trim().isNotEmpty
      ? profile.level.trim()
      : 'Iniciante';

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
