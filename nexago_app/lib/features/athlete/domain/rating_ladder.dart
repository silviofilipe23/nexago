import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:nexago_app/core/firebase/firebase_providers.dart';

import 'athlete_profile_options.dart';

/// Degrau da escada de pontos de nível (rating Glicko) — espelho de
/// `RatingLadderLevel` em `functions/src/rating-config.ts`.
class RatingLadderLevel {
  const RatingLadderLevel({
    required this.code,
    required this.rank,
    required this.label,
    required this.initialRating,
    this.promoteAt,
    this.demoteAt,
  });

  final String code;
  final int rank;
  final String label;

  /// Pontos com que o atleta começa ao declarar (ou subir para) o nível.
  final int initialRating;

  /// Marca da zona de acesso ao degrau de cima; `null` no topo (Open).
  final int? promoteAt;

  /// Marca da zona de reclassificação; `null` no piso (Iniciante 1).
  final int? demoteAt;
}

/// Escada + flags que mudam o que "chegar na marca" significa.
class RatingLadder {
  const RatingLadder({
    required this.levels,
    this.autoPromotes = false,
    this.autoRelegates = false,
    this.minRatedMatches = 10,
    this.relegationObservationDays = 90,
    this.relegationObservationMinMatches = 6,
  });

  final List<RatingLadderLevel> levels;

  /// A engine sobe o atleta sozinha ao passar da marca — só com
  /// `shadowMode: false` e `autoPromotionEnabled: true` (`rating-ladder.ts`).
  final bool autoPromotes;

  /// A engine desce o atleta ao fim da observação — só com
  /// `shadowMode: false` e `autoRelegationEnabled: true`.
  final bool autoRelegates;

  /// Partidas rateadas exigidas antes de qualquer decisão da escada.
  final int minRatedMatches;

  /// Janela de observação antes de descer e as partidas mínimas nela —
  /// sem jogar, ninguém desce (`rating-ladder.ts`).
  final int relegationObservationDays;
  final int relegationObservationMinMatches;
}

/// `VOLLEYBALL_LEVELS` de `functions/src/rating-config.ts` — a régua vale até
/// alguém gravar `levels` em `ratingLadders/{esporte}`, que a sobrescreve.
const List<RatingLadderLevel> kDefaultRatingLadderLevels = [
  RatingLadderLevel(
    code: 'iniciante_1',
    rank: 0,
    label: 'Iniciante 1',
    initialRating: 1250,
    promoteAt: 1420,
  ),
  RatingLadderLevel(
    code: 'iniciante_2',
    rank: 1,
    label: 'Iniciante 2',
    initialRating: 1450,
    promoteAt: 1570,
    demoteAt: 1350,
  ),
  RatingLadderLevel(
    code: 'intermediario_1',
    rank: 2,
    label: 'Intermediário 1',
    initialRating: 1600,
    promoteAt: 1720,
    demoteAt: 1500,
  ),
  RatingLadderLevel(
    code: 'intermediario_2',
    rank: 3,
    label: 'Intermediário 2',
    initialRating: 1750,
    promoteAt: 1870,
    demoteAt: 1650,
  ),
  RatingLadderLevel(
    code: 'avancado_1',
    rank: 4,
    label: 'Avançado 1',
    initialRating: 1900,
    promoteAt: 2020,
    demoteAt: 1800,
  ),
  RatingLadderLevel(
    code: 'avancado_2',
    rank: 5,
    label: 'Avançado 2',
    initialRating: 2050,
    promoteAt: 2170,
    demoteAt: 1950,
  ),
  RatingLadderLevel(
    code: 'open',
    rank: 6,
    label: 'Open',
    initialRating: 2200,
    demoteAt: 2100,
  ),
];

const RatingLadder kDefaultRatingLadder = RatingLadder(
  levels: kDefaultRatingLadderLevels,
);

/// Doc de `ratingLadders` sobre os defaults — mesma regra de
/// `parseLadderConfig`: `levels` inválido em qualquer linha descarta a lista
/// inteira; flags ausentes ficam no padrão (modo sombra: ninguém sobe nem
/// desce sozinho).
RatingLadder parseRatingLadder(Map<String, dynamic>? raw) {
  final flags = raw?['flags'];
  final ladder = raw?['ladder'];
  bool flag(String key, bool fallback) {
    final value = flags is Map ? flags[key] : null;
    return value is bool ? value : fallback;
  }

  int rule(String key, int fallback) {
    final value = ladder is Map ? ladder[key] : null;
    return value is num && value.isFinite ? value.round() : fallback;
  }

  final external = !flag('shadowMode', true);
  return RatingLadder(
    levels:
        parseRatingLadderLevels(raw?['levels']) ?? kDefaultRatingLadderLevels,
    autoPromotes: external && flag('autoPromotionEnabled', false),
    autoRelegates: external && flag('autoRelegationEnabled', false),
    minRatedMatches: rule(
      'minRatedMatches',
      kDefaultRatingLadder.minRatedMatches,
    ),
    relegationObservationDays: rule(
      'relegationObservationDays',
      kDefaultRatingLadder.relegationObservationDays,
    ),
    relegationObservationMinMatches: rule(
      'relegationObservationMinMatches',
      kDefaultRatingLadder.relegationObservationMinMatches,
    ),
  );
}

List<RatingLadderLevel>? parseRatingLadderLevels(Object? raw) {
  if (raw is! List || raw.isEmpty) return null;
  int? nullableInt(Object? v) => v is num && v.isFinite ? v.round() : null;
  final levels = <RatingLadderLevel>[];
  for (final entry in raw) {
    if (entry is! Map) return null;
    final code =
        entry['code'] is String ? (entry['code'] as String).trim() : '';
    final rank = nullableInt(entry['rank']);
    final initial = nullableInt(entry['initialRating']);
    if (code.isEmpty || rank == null || initial == null) return null;
    final label = entry['label'];
    levels.add(
      RatingLadderLevel(
        code: code,
        rank: rank,
        label: label is String && label.trim().isNotEmpty ? label.trim() : code,
        initialRating: initial,
        promoteAt: nullableInt(entry['promoteAt']),
        demoteAt: nullableInt(entry['demoteAt']),
      ),
    );
  }
  return levels..sort((a, b) => a.rank.compareTo(b.rank));
}

/// Degrau pelo código exato ou, para legados e labels, pelo rank unificado —
/// como `resolveLadderLevel`. Sem nada reconhecível, o piso.
RatingLadderLevel resolveRatingLadderLevel(
  List<RatingLadderLevel> levels,
  String? rawLevel,
) {
  final code = rawLevel?.trim() ?? '';
  for (final level in levels) {
    if (level.code == code) return level;
  }
  final rank = AthleteProfileOptions.levelRank(code);
  if (rank != null) {
    for (final level in levels) {
      if (level.rank == rank) return level;
    }
    for (final level in levels.reversed) {
      if (level.rank <= rank) return level;
    }
  }
  return levels.first;
}

RatingLadderLevel? ratingLadderLevelAbove(
  List<RatingLadderLevel> levels,
  RatingLadderLevel level,
) {
  for (final candidate in levels) {
    if (candidate.rank > level.rank) return candidate;
  }
  return null;
}

/// Onde os pontos do atleta estão dentro do degrau: de "começa com" (0%) até
/// "sobe com" (100%).
class LevelPointsProgress {
  const LevelPointsProgress({
    required this.level,
    required this.points,
    required this.progress,
    this.next,
    this.pointsToPromote,
  });

  final RatingLadderLevel level;
  final RatingLadderLevel? next;
  final int points;

  /// Quanto falta para a marca de subida; 0 quando já passou; `null` no topo.
  final int? pointsToPromote;
  final double progress;

  bool get reachedPromotion => pointsToPromote == 0;
}

LevelPointsProgress levelPointsProgress(
  List<RatingLadderLevel> levels,
  String? levelCode,
  double rating,
) {
  final level = resolveRatingLadderLevel(levels, levelCode);
  final points = rating.round();
  final promoteAt = level.promoteAt;
  if (promoteAt == null) {
    return LevelPointsProgress(level: level, points: points, progress: 1);
  }
  final span = promoteAt - level.initialRating;
  return LevelPointsProgress(
    level: level,
    next: ratingLadderLevelAbove(levels, level),
    points: points,
    pointsToPromote: points >= promoteAt ? 0 : promoteAt - points,
    progress: span <= 0
        ? 1
        : ((points - level.initialRating) / span).clamp(0, 1).toDouble(),
  );
}

/// `ratingLadders/{esporte}` (fallback `ratingLadders/default`, depois os
/// defaults) — mesma ordem de `loadRatingLadderConfig`. Leitura liberada a
/// qualquer usuário logado; erro ou doc ausente caem nos defaults.
final ratingLadderProvider =
    StreamProvider.autoDispose.family<RatingLadder, String>((ref, sportCode) {
  final db = ref.watch(firestoreProvider);
  return db.doc('ratingLadders/$sportCode').snapshots().asyncMap((
    snap,
  ) async {
    if (snap.exists) return parseRatingLadder(snap.data());
    final fallback = await db.doc('ratingLadders/default').get();
    return parseRatingLadder(fallback.data());
  });
});
