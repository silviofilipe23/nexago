import 'athlete_firestore_codes.dart';
import 'athlete_profile.dart';
import 'athlete_profile_options.dart';

const athleteLevelSegmentCount = 4;

class AthletePublicSportEntry {
  const AthletePublicSportEntry({
    required this.label,
    required this.levelLabel,
    required this.levelSegments,
    required this.isPrimary,
  });

  final String label;
  final String levelLabel;
  final int levelSegments;
  final bool isPrimary;
}

class AthletePublicRankingSnapshot {
  const AthletePublicRankingSnapshot({
    this.rank,
    this.points = 0,
    this.tournamentsCount = 0,
    this.seasonYear,
  });

  final int? rank;
  final int points;
  final int tournamentsCount;
  final int? seasonYear;

  bool get hasRank => rank != null && rank! > 0;
}

class AthletePublicPartnerEntry {
  const AthletePublicPartnerEntry({
    required this.userId,
    required this.name,
    required this.initials,
    required this.avatarUrl,
    this.subtitle = '',
  });

  final String userId;
  final String name;
  final String initials;
  final String? avatarUrl;
  final String subtitle;
}

List<AthletePublicSportEntry> buildPublicSportEntries(AthleteProfile profile) {
  final entries = <AthletePublicSportEntry>[];
  final primaryId = profile.primarySportFirestoreId;
  final secondaryIds = profile.secondarySportFirestoreIds;
  final levels = profile.levelsBySportFirestore;

  void addSport(String? firestoreId, {required bool isPrimary}) {
    if (firestoreId == null || firestoreId.isEmpty) return;
    final label = AthleteFirestoreCodes.sportFirestoreToLabel(firestoreId);
    if (label == null || label.isEmpty) return;
    final levelCode = levels[firestoreId] ?? levels[firestoreId.toUpperCase()];
    final levelLabel = resolveAthleteLevelLabel(
      profile,
      sportFirestoreId: firestoreId,
    );
    entries.add(
      AthletePublicSportEntry(
        label: label,
        levelLabel: levelLabel,
        levelSegments: levelSegmentsFromCode(levelCode ?? profile.level),
        isPrimary: isPrimary,
      ),
    );
  }

  addSport(primaryId, isPrimary: true);
  for (final id in secondaryIds) {
    if (id == primaryId) continue;
    addSport(id, isPrimary: false);
  }

  if (entries.isEmpty && profile.sport.trim().isNotEmpty) {
    entries.add(
      AthletePublicSportEntry(
        label: profile.sport,
        levelLabel: resolveAthleteLevelLabel(profile),
        levelSegments: resolveAthleteLevelSegments(profile),
        isPrimary: true,
      ),
    );
  }

  return entries;
}

int levelSegmentsFromCode(String? raw) {
  if (raw == null || raw.trim().isEmpty) return 1;

  final normalizedLabel = AthleteProfileOptions.normalizeLevel(raw);
  final code = AthleteFirestoreCodes.levelLabelToFirestore(
    normalizedLabel.isNotEmpty ? normalizedLabel : raw,
  ).toLowerCase();

  const map = {
    'iniciante': 1,
    'basico': 1,
    'básico': 1,
    'intermediario': 2,
    'intermediário': 2,
    'open': 3,
    'pro': 4,
    'avancado': 4,
    'avançado': 4,
    'profissional': 4,
  };
  if (map.containsKey(code)) return map[code]!;
  for (final entry in map.entries) {
    if (code.contains(entry.key)) return entry.value;
  }
  return 1;
}

/// Níveis oficiais: Iniciante, Intermediário, Open e Pro.
String resolveAthleteLevelLabel(
  AthleteProfile profile, {
  String? sportFirestoreId,
}) {
  final sportId = sportFirestoreId ?? profile.primarySportFirestoreId;
  if (sportId != null && sportId.isNotEmpty) {
    final code = profile.levelsBySportFirestore[sportId] ??
        profile.levelsBySportFirestore[sportId.toUpperCase()];
    if (code != null && code.trim().isNotEmpty) {
      final label = AthleteFirestoreCodes.levelFirestoreToLabel(code);
      if (label.isNotEmpty) return label;
    }
  }
  final normalized = AthleteProfileOptions.normalizeLevel(profile.level);
  return normalized.isNotEmpty ? normalized : AthleteProfileOptions.levels.first;
}

int resolveAthleteLevelSegments(
  AthleteProfile profile, {
  String? sportFirestoreId,
}) {
  final sportId = sportFirestoreId ?? profile.primarySportFirestoreId;
  if (sportId != null && sportId.isNotEmpty) {
    final code = profile.levelsBySportFirestore[sportId] ??
        profile.levelsBySportFirestore[sportId.toUpperCase()];
    if (code != null && code.trim().isNotEmpty) {
      return levelSegmentsFromCode(code);
    }
  }
  return levelSegmentsFromCode(profile.level);
}

String? athletePublicHandle(AthleteProfile profile) {
  final nick = profile.nickname?.trim();
  if (nick != null && nick.isNotEmpty) {
    final handle = nick.startsWith('@') ? nick : '@$nick';
    return handle.toLowerCase();
  }
  final parts = profile.name.trim().split(' ').where((p) => p.isNotEmpty);
  if (parts.isEmpty) return null;
  final first = parts.first.toLowerCase();
  final last = parts.length > 1 ? parts.last.toLowerCase() : '';
  if (last.isEmpty) return '@$first';
  return '@$first.$last';
}

String athleteAgeCategoryLabel(String? birthDateIso) {
  if (birthDateIso == null || birthDateIso.trim().isEmpty) return '';
  final match = RegExp(
    r'^(\d{4})-(\d{2})-(\d{2})$',
  ).firstMatch(birthDateIso.trim());
  if (match == null) return '';
  final year = int.tryParse(match.group(1)!);
  if (year == null) return '';
  final age = DateTime.now().year - year;
  if (age <= 23) return 'SUB 23';
  if (age <= 35) return 'ADULTO';
  if (age <= 45) return 'MASTER';
  return 'SÊNIOR';
}

String athleteGenderShortLabel(String? gender) {
  final g = gender?.trim().toLowerCase() ?? '';
  if (g.startsWith('masc')) return 'MASCULINO';
  if (g.startsWith('fem')) return 'FEMININO';
  if (g.startsWith('mix')) return 'MISTO';
  if (g.isEmpty) return '';
  return gender!.trim().toUpperCase();
}

String athleteLocationLabel(AthleteProfile profile) {
  final city = profile.city.trim();
  final state = profile.state?.trim();
  if (city.isEmpty) return '';
  if (state != null && state.isNotEmpty) return '$city · $state';
  return city;
}

String formatSocialCount(int count) {
  if (count >= 1000000) {
    final v = count / 1000000;
    return '${v.toStringAsFixed(v >= 10 ? 0 : 1)}M';
  }
  if (count >= 1000) {
    final v = count / 1000;
    return '${v.toStringAsFixed(v >= 10 ? 0 : 1)}k';
  }
  return count.toString();
}

String athleteInitialsFromName(String name) {
  final parts = name.trim().split(' ').where((p) => p.isNotEmpty).toList();
  if (parts.isEmpty) return '?';
  if (parts.length == 1) {
    return parts.first.length >= 2
        ? parts.first.substring(0, 2).toUpperCase()
        : parts.first.toUpperCase();
  }
  return '${parts.first[0]}${parts.last[0]}'.toUpperCase();
}
