import 'package:flutter/material.dart';

import '../../../core/theme/app_colors.dart';
import 'athlete_discover_models.dart';
import 'athlete_firestore_codes.dart';
import 'athlete_profile.dart';
import 'athlete_profile_options.dart';
import 'athlete_public_profile_models.dart';

const _onlineThresholdMinutes = 15;

bool isAthleteOnline(AthleteProfile profile, DateTime now) {
  final last = profile.lastActiveAt;
  if (last == null) return false;
  return now.difference(last).inMinutes <= _onlineThresholdMinutes;
}

bool isDiscoverableProfile(AthleteProfile profile) => profile.isDiscoverable;

String normalizeDiscoverSearch(String raw) => raw.trim().toLowerCase();

bool matchesDiscoverSearch(AthleteDiscoverEntry entry, String query) {
  if (query.isEmpty) return true;
  final q = normalizeDiscoverSearch(query);
  final parts = <String>[
    entry.displayName,
    entry.handle ?? '',
    entry.profile.city,
    entry.profile.state ?? '',
    entry.primarySportLabel,
    entry.profile.nickname ?? '',
  ];
  return parts.any((p) => p.toLowerCase().contains(q));
}

AthleteDiscoverGameObjective? gameObjectiveFromFirestore(String? raw) {
  if (raw == null || raw.trim().isEmpty) return null;
  final n = raw.trim().toLowerCase();
  if (n.contains('treinar') && (n.contains('-forte') || n.contains('menos'))) {
    return AthleteDiscoverGameObjective.trainDown;
  }
  if (n.contains('evoluir') || n.contains('+forte') || n.contains('mais forte')) {
    return AthleteDiscoverGameObjective.trainUp;
  }
  if (n.contains('equilibr') || n.contains('balanced')) {
    return AthleteDiscoverGameObjective.balanced;
  }
  return null;
}

bool _matchesGender(AthleteProfile profile, AthleteDiscoverGenderFilter filter) {
  if (filter == AthleteDiscoverGenderFilter.all) return true;
  final g = profile.gender?.trim().toLowerCase() ?? '';
  if (filter == AthleteDiscoverGenderFilter.male) {
    return g.startsWith('masc');
  }
  return g.startsWith('fem');
}

bool _matchesSport(AthleteProfile profile, String? sportFirestoreId) {
  if (sportFirestoreId == null || sportFirestoreId.isEmpty) return true;
  final primary = profile.primarySportFirestoreId?.trim() ?? '';
  if (primary == sportFirestoreId) return true;
  return profile.secondarySportFirestoreIds.contains(sportFirestoreId);
}

bool _profileHasDefinedLevel(AthleteProfile profile) {
  final sportId = profile.primarySportFirestoreId;
  if (sportId != null && sportId.isNotEmpty) {
    final code = profile.levelsBySportFirestore[sportId] ??
        profile.levelsBySportFirestore[sportId.toUpperCase()];
    if (code != null && code.trim().isNotEmpty) return true;
  }
  return profile.level.trim().isNotEmpty;
}

bool _matchesLevel(AthleteProfile profile, AthleteDiscoverFilters filters) {
  final quick = filters.quickLevel.label.trim();
  final hasLevelFilter = quick.isNotEmpty || filters.levels.isNotEmpty;
  if (hasLevelFilter && !_profileHasDefinedLevel(profile)) return false;

  // Chips e filtro avançado usam os rótulos finos da escada de 5
  // (Iniciante 1/2, Intermediário 1/2, Open); comparar direto, sem reduzir
  // a bucket, senão nenhum nível fino nunca casa com o filtro.
  final resolved = resolveAthleteLevelLabel(profile);
  if (quick.isNotEmpty) {
    if (resolved.toLowerCase() != quick.toLowerCase()) return false;
  }
  if (filters.levels.isEmpty) return true;
  return filters.levels.any(
    (level) => resolved.toLowerCase() == level.trim().toLowerCase(),
  );
}

bool _matchesProximity(
  AthleteProfile profile,
  AthleteProfile? viewer,
  AthleteDiscoverFilters filters,
) {
  if (filters.unlimitedDistance || viewer == null) return true;
  final viewerCity = viewer.city.trim().toLowerCase();
  final viewerState = viewer.state?.trim().toLowerCase() ?? '';
  final city = profile.city.trim().toLowerCase();
  final state = profile.state?.trim().toLowerCase() ?? '';
  if (viewerCity.isNotEmpty && city == viewerCity) {
    if (viewerState.isEmpty || state.isEmpty || viewerState == state) {
      return true;
    }
  }
  // v1: distância curta = mesma cidade; caso contrário exclui quando filtro ativo
  return filters.maxDistanceKm >= 50;
}

bool _matchesGameObjective(AthleteProfile profile, AthleteDiscoverFilters filters) {
  final wanted = filters.gameObjective;
  if (wanted == null) return true;
  final actual = gameObjectiveFromFirestore(profile.gameObjective);
  return actual == wanted;
}

List<AthleteDiscoverEntry> applyDiscoverFilters({
  required List<AthleteDiscoverEntry> entries,
  required AthleteDiscoverFilters filters,
  AthleteProfile? viewerProfile,
  String searchQuery = '',
  DateTime? now,
}) {
  final reference = now ?? DateTime.now();
  final q = normalizeDiscoverSearch(searchQuery);

  return entries.where((entry) {
    final profile = entry.profile;
    if (!isDiscoverableProfile(profile)) return false;
    if (!matchesDiscoverSearch(entry, q)) return false;
    if (!_matchesGender(profile, filters.gender)) return false;
    if (!_matchesSport(profile, filters.sportFirestoreId)) return false;
    if (!_matchesLevel(profile, filters)) return false;
    if (!_matchesProximity(profile, viewerProfile, filters)) return false;
    if (!_matchesGameObjective(profile, filters)) return false;
    if (filters.completeProfileOnly && !profile.onboardingCompleted) {
      return false;
    }
    if (filters.lookingForPartnerOnly && !profile.lookingForPartner) {
      return false;
    }
    if (filters.availableNowOnly && !isAthleteOnline(profile, reference)) {
      return false;
    }
    return true;
  }).toList();
}

int _proximityScore(AthleteProfile profile, AthleteProfile? viewer) {
  if (viewer == null) return 0;
  var score = 0;
  final viewerCity = viewer.city.trim().toLowerCase();
  final city = profile.city.trim().toLowerCase();
  if (viewerCity.isNotEmpty && city == viewerCity) score += 2;
  final viewerState = viewer.state?.trim().toLowerCase() ?? '';
  final state = profile.state?.trim().toLowerCase() ?? '';
  if (viewerState.isNotEmpty && state.isNotEmpty && viewerState == state) {
    score += 1;
  }
  return score;
}

List<AthleteDiscoverEntry> sortDiscoverEntries({
  required List<AthleteDiscoverEntry> entries,
  required AthleteDiscoverSort sort,
  AthleteProfile? viewerProfile,
  String? sportFirestoreId,
}) {
  final sorted = [...entries];
  switch (sort) {
    case AthleteDiscoverSort.compatibility:
      sorted.sort((a, b) {
        final cmp = computeDiscoverCompatibilityScore(
          viewer: viewerProfile,
          target: b.profile,
          sportFirestoreId: sportFirestoreId,
        ).compareTo(
          computeDiscoverCompatibilityScore(
            viewer: viewerProfile,
            target: a.profile,
            sportFirestoreId: sportFirestoreId,
          ),
        );
        if (cmp != 0) return cmp;
        return a.displayName.compareTo(b.displayName);
      });
    case AthleteDiscoverSort.ranking:
      sorted.sort((a, b) {
        final ar = a.rankPosition ?? 999999;
        final br = b.rankPosition ?? 999999;
        if (ar != br) return ar.compareTo(br);
        return b.rankPoints.compareTo(a.rankPoints);
      });
    case AthleteDiscoverSort.proximity:
      sorted.sort((a, b) {
        final cmp = _proximityScore(b.profile, viewerProfile)
            .compareTo(_proximityScore(a.profile, viewerProfile));
        if (cmp != 0) return cmp;
        return a.displayName.compareTo(b.displayName);
      });
    case AthleteDiscoverSort.level:
      sorted.sort((a, b) {
        final cmp = b.levelSegments.compareTo(a.levelSegments);
        if (cmp != 0) return cmp;
        return a.displayName.compareTo(b.displayName);
      });
  }
  return sorted;
}

int countOnlineAthletes(
  List<AthleteDiscoverEntry> entries, {
  DateTime? now,
}) {
  final reference = now ?? DateTime.now();
  return entries
      .where((e) => isAthleteOnline(e.profile, reference))
      .length;
}

List<String> discoverSportFilterOptions() {
  const ids = [
    'VOLEI_PRAIA',
    'BEACH_TENNIS',
    'VOLEI_QUADRA',
    'FUTEBOL',
    'BASQUETE',
    'TENIS',
  ];
  return ids
      .map(AthleteFirestoreCodes.sportFirestoreToLabel)
      .whereType<String>()
      .where((s) => s.isNotEmpty)
      .toList();
}

String? sportFirestoreIdForLabel(String label) {
  const ids = [
    'VOLEI_PRAIA',
    'BEACH_TENNIS',
    'VOLEI_QUADRA',
    'FUTEBOL',
    'BASQUETE',
    'TENIS',
    'CORRIDA',
    'OUTROS',
  ];
  for (final id in ids) {
    if (AthleteFirestoreCodes.sportFirestoreToLabel(id) == label) {
      return id;
    }
  }
  return null;
}

String _normalizePlace(String? raw) {
  if (raw == null) return '';
  return raw
      .trim()
      .toLowerCase()
      .replaceAll(RegExp(r'[áàâãä]'), 'a')
      .replaceAll(RegExp(r'[éèêë]'), 'e')
      .replaceAll(RegExp(r'[íìîï]'), 'i')
      .replaceAll(RegExp(r'[óòôõö]'), 'o')
      .replaceAll(RegExp(r'[úùûü]'), 'u')
      .replaceAll(RegExp(r'\s+'), ' ');
}

int _compatibilityLevelPoints({
  required String sport,
  required AthleteProfile viewer,
  required AthleteProfile target,
}) {
  final viewerRank = AthleteProfileOptions.levelRank(
    viewer.levelsBySportFirestore[sport] ??
        viewer.levelsBySportFirestore[sport.toUpperCase()],
  );
  final targetRank = AthleteProfileOptions.levelRank(
    target.levelsBySportFirestore[sport] ??
        target.levelsBySportFirestore[sport.toUpperCase()],
  );
  if (viewerRank == null || targetRank == null) return 20;
  final diff = (viewerRank - targetRank).abs();
  if (diff == 0) return 40;
  if (diff == 1) return 30;
  if (diff == 2) return 15;
  return 5;
}

int _compatibilityLocationPoints(AthleteProfile viewer, AthleteProfile target) {
  final cityA = _normalizePlace(viewer.city);
  final cityB = _normalizePlace(target.city);
  final stateA = _normalizePlace(viewer.state);
  final stateB = _normalizePlace(target.state);
  if (cityA.isEmpty && stateA.isEmpty) return 8;
  if (cityB.isEmpty && stateB.isEmpty) return 8;
  if (stateA.isNotEmpty && stateB.isNotEmpty && stateA != stateB) return 0;
  if (cityA.isNotEmpty && cityB.isNotEmpty && cityA == cityB) return 25;
  if (stateA.isNotEmpty && stateB.isNotEmpty && stateA == stateB) return 12;
  return 8;
}

/// Score 0–100 entre o atleta logado e um perfil discoverable (espelho v1 do
/// backend do Bora Jogar, objetivo amistoso).
int computeDiscoverCompatibilityScore({
  required AthleteProfile? viewer,
  required AthleteProfile target,
  String? sportFirestoreId,
}) {
  if (viewer == null) return 0;
  final sport = (sportFirestoreId?.trim().isNotEmpty == true
          ? sportFirestoreId
          : viewer.primarySportFirestoreId ?? target.primarySportFirestoreId)
      ?.trim();
  if (sport == null || sport.isEmpty) {
    return _compatibilityLocationPoints(viewer, target) + 34;
  }
  final level = _compatibilityLevelPoints(
    sport: sport,
    viewer: viewer,
    target: target,
  );
  final location = _compatibilityLocationPoints(viewer, target);
  const objective = 10;
  const reputation = 14;
  return (level + location + objective + reputation).clamp(0, 100);
}

String discoverLevelDisplayLabel(
  AthleteProfile profile, {
  String? sportFirestoreId,
}) {
  final sportId = sportFirestoreId ?? profile.primarySportFirestoreId;
  String? code;
  if (sportId != null && sportId.isNotEmpty) {
    code = profile.levelsBySportFirestore[sportId] ??
        profile.levelsBySportFirestore[sportId.toUpperCase()];
  }
  final rank = AthleteProfileOptions.levelRank(code ?? profile.level);
  if (rank == null) {
    final label = resolveAthleteLevelLabel(profile, sportFirestoreId: sportId);
    return label.isNotEmpty ? 'Nível $label' : '';
  }
  final numeric = rank >= 5 ? 5.0 : 3.0 + rank * 0.5;
  return 'Nível ${numeric.toStringAsFixed(1)}';
}

String discoverStatsLine({
  required AthleteDiscoverEntry entry,
  AthleteProfile? viewer,
  String? sportFirestoreId,
}) {
  final parts = <String>[];
  final level = discoverLevelDisplayLabel(
    entry.profile,
    sportFirestoreId: sportFirestoreId,
  );
  if (level.isNotEmpty) parts.add(level);

  final distance = entry.proximityDistanceLabel(viewer);
  if (distance != null && distance.isNotEmpty) {
    parts.add(distance.replaceAll('.0', '').replaceAll('.1', ''));
  }

  if (entry.locationLabel.isNotEmpty) parts.add(entry.locationLabel);
  return parts.join(' · ');
}

String? discoverContextTag({
  required AthleteDiscoverEntry entry,
  AthleteProfile? viewer,
}) {
  final distance = entry.proximityDistanceLabel(viewer);
  if (distance != null &&
      (distance.startsWith('2.') || distance.startsWith('3.'))) {
    return 'Perto de você';
  }
  final mutual = entry.mutualFollowersCount;
  if (mutual != null && mutual > 0) {
    return '$mutual amigo${mutual == 1 ? '' : 's'} em comum';
  }
  return null;
}

Color discoverCompatibilityColor(int score) {
  if (score >= 90) return AppColors.win;
  if (score >= 75) return AppColors.pending;
  return AppColors.brand;
}

AthleteDiscoverEntry buildDiscoverEntry({
  required AthleteProfile profile,
  AthletePublicRankingSnapshot ranking = const AthletePublicRankingSnapshot(),
  bool isFollowing = false,
  bool isCurrentUser = false,
  int followersCount = 0,
  int? mutualFollowersCount,
}) {
  return AthleteDiscoverEntry(
    userId: profile.id,
    profile: profile,
    ranking: ranking,
    isFollowing: isFollowing,
    isCurrentUser: isCurrentUser,
    followersCount: followersCount,
    mutualFollowersCount: mutualFollowersCount,
  );
}

/// Igualdades suportadas em query Firestore para pré-filtrar descoberta.
class DiscoverFirestoreConstraints {
  const DiscoverFirestoreConstraints({
    this.gender,
    this.lookingForPartnerOnly = false,
    this.sportFirestoreId,
  });

  final String? gender;
  final bool lookingForPartnerOnly;
  final String? sportFirestoreId;

  bool get isEmpty =>
      gender == null &&
      !lookingForPartnerOnly &&
      (sportFirestoreId == null || sportFirestoreId!.isEmpty);
}

String? discoverGenderFirestoreValue(AthleteDiscoverGenderFilter filter) {
  return switch (filter) {
    AthleteDiscoverGenderFilter.all => null,
    AthleteDiscoverGenderFilter.male => 'Masculino',
    AthleteDiscoverGenderFilter.female => 'Feminino',
  };
}

DiscoverFirestoreConstraints discoverFirestoreConstraints(
  AthleteDiscoverFilters filters,
) {
  final sportId = filters.sportFirestoreId?.trim();
  return DiscoverFirestoreConstraints(
    gender: discoverGenderFirestoreValue(filters.gender),
    lookingForPartnerOnly: filters.lookingForPartnerOnly,
    sportFirestoreId: sportId != null && sportId.isNotEmpty ? sportId : null,
  );
}

/// Esportes inscritos (primário + secundários) para índice `discoverSportIds`.
List<String> discoverSportIdsForProfile(AthleteProfile profile) {
  final ids = <String>{};
  final primary = profile.primarySportFirestoreId?.trim();
  if (primary != null && primary.isNotEmpty) {
    ids.add(primary);
  }
  for (final id in profile.secondarySportFirestoreIds) {
    final trimmed = id.trim();
    if (trimmed.isNotEmpty) {
      ids.add(trimmed);
    }
  }
  return ids.toList();
}
