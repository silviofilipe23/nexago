import 'athlete_firestore_codes.dart';
import 'athlete_profile.dart';

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
    final levelLabel = levelCode != null && levelCode.isNotEmpty
        ? AthleteFirestoreCodes.levelFirestoreToLabel(levelCode)
        : (profile.level.trim().isNotEmpty ? profile.level : '—');
    entries.add(
      AthletePublicSportEntry(
        label: label,
        levelLabel: levelLabel.isNotEmpty ? levelLabel : '—',
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
        levelLabel: profile.level.trim().isNotEmpty ? profile.level : '—',
        levelSegments: levelSegmentsFromCode(profile.level),
        isPrimary: true,
      ),
    );
  }

  return entries;
}

int levelSegmentsFromCode(String? raw) {
  final code = raw?.trim().toLowerCase() ?? '';
  const map = {
    'iniciante': 1,
    'basico': 2,
    'básico': 2,
    'intermediario': 3,
    'intermediário': 3,
    'avancado': 4,
    'avançado': 4,
    'open': 5,
    'profissional': 5,
  };
  if (map.containsKey(code)) return map[code]!;
  for (final entry in map.entries) {
    if (code.contains(entry.key)) return entry.value;
  }
  return 2;
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
