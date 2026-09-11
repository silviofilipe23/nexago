import '../../../core/profiles/app_user_profile.dart';
import 'package:nexago_app/core/deep_link/app_domains.dart';
import 'athlete_firestore_codes.dart';
import 'athlete_profile.dart';
import 'athlete_profile_options.dart';

/// Barras de nível acompanham a escada única de 7 níveis.
const athleteLevelSegmentCount = 7;

class AthletePublicSportEntry {
  const AthletePublicSportEntry({
    required this.label,
    required this.levelLabel,
    required this.levelSegments,
    required this.isPrimary,
    this.firestoreCode,
    this.rankingPosition,
  });

  final String label;
  final String levelLabel;
  final int levelSegments;
  final bool isPrimary;

  /// Código canônico do esporte no Firestore (`VOLEI_PRAIA`, `BASQUETE`…).
  ///
  /// É por ele que a arte de fundo é escolhida, não pelo rótulo: casar texto
  /// (`label.contains('vôlei')`) confunde praia com quadra e quebra em acento.
  final String? firestoreCode;

  /// Posição do atleta no ranking DESTE esporte.
  ///
  /// Nulo por enquanto: o perfil público só conhece o rank geral
  /// (`AthletePublicRankingSnapshot.rank`), não um por esporte. A UI mostra
  /// travessão quando é nulo, em vez de inventar número.
  final int? rankingPosition;
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

/// Preenche a posição de ranking de cada esporte a partir de
/// `{código do esporte: posição}`. Esporte fora do mapa fica sem posição, e a
/// UI mostra travessão.
List<AthletePublicSportEntry> withSportRanks(
  List<AthletePublicSportEntry> entries,
  Map<String, int> ranksBySport,
) {
  if (ranksBySport.isEmpty) return entries;
  return [
    for (final e in entries)
      AthletePublicSportEntry(
        label: e.label,
        levelLabel: e.levelLabel,
        levelSegments: e.levelSegments,
        isPrimary: e.isPrimary,
        firestoreCode: e.firestoreCode,
        rankingPosition: ranksBySport[e.firestoreCode],
      ),
  ];
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
        firestoreCode: firestoreId.toUpperCase(),
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

/// Segmentos preenchidos da barra (1..[athleteLevelSegmentCount]) a partir do
/// rank unificado: 0→1, 1→2, 2→3, 3→4, 4→5, 5→6, Open→7. Desconhecido/
/// ausente → 1.
int levelSegmentsFromCode(String? raw) {
  final rank = AthleteProfileOptions.levelRank(raw);
  if (rank == null) return 1;
  switch (rank) {
    case 0:
      return 1;
    case 1:
      return 2;
    case 2:
      return 3;
    case 3:
      return 4;
    case 4:
      return 5;
    case 5:
      return 6;
    default:
      return athleteLevelSegmentCount;
  }
}

/// Níveis oficiais: Iniciante 1/2, Intermediário 1/2, Avançado 1/2 e Open.
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
  return normalized.isNotEmpty
      ? normalized
      : AthleteProfileOptions.levels.first;
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

/// Handle público do atleta. Só existe quando a pessoa ESCOLHEU um apelido —
/// derivar `@primeiro.ultimo` do nome fabricava identidade: o campo é livre e
/// não tem unicidade nenhuma, então dois "João Silva" exibiam o mesmo `@`.
String? athletePublicHandle(AthleteProfile profile) {
  final nick = profile.nickname?.trim();
  if (nick == null || nick.isEmpty) return null;
  final handle = nick.startsWith('@') ? nick : '@$nick';
  return handle.toLowerCase();
}

/// URL pública do perfil no portal do atleta.
///
/// O path leva o UID, não o apelido. A rota do portal se chama `atletas/:handle`,
/// mas o parâmetro é consumido como id de documento — o repositório faz
/// `getDoc(doc(db, 'public_profiles', uid))`, e o próprio portal monta o link
/// dele com `profile.uid`. Mandar apelido ali dá 404.
///
/// Usar o uid também torna o link estável: apelido muda, id não.
///
/// O mesmo endereço é o que um dia abrirá o app — `atleta.nexago.com.br` já é o
/// host do entitlement do iOS e o único aceito em `kAppDeepLinkHosts`. Quando a
/// rota existir no app, os links já compartilhados passam a abrir nele.
Uri athletePublicProfileUrl(AthleteProfile profile) {
  return Uri.parse('${AppDomains.athletePortal}/atletas/${profile.id}');
}

String athleteAgeCategoryLabel(String? birthDateRaw) {
  final iso = AthleteFirestoreCodes.birthDateBrToIso(birthDateRaw);
  if (iso == null) return '';
  final year = int.tryParse(iso.substring(0, 4));
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
  return initialsFromDisplayName(name);
}
