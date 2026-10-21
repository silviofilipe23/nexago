/// T11/T13 · professor na vitrine — espelha `searchProfessors` e
/// `getProfessorPublicProfile` (`functions/src/professor-public-profile.ts`).
/// Só aparece quem escolheu "Aparecer no perfil da arena"; preço de
/// particular só com a disponibilidade publicada no perfil.

class PublicProfessorArena {
  const PublicProfessorArena({
    required this.arenaId,
    required this.arenaName,
    this.city = '',
    this.logoUrl,
    this.independent = false,
    this.distanceKm,
  });

  factory PublicProfessorArena.fromMap(Map<String, Object?> m) =>
      PublicProfessorArena(
        arenaId: _str(m['arenaId']),
        arenaName: _str(m['arenaName'], 'Arena'),
        city: _str(m['city']),
        logoUrl: _strOrNull(m['logoUrl']),
        independent: m['relationshipType'] == 'INDEPENDENT',
        distanceKm: _double(m['distanceKm']),
      );

  final String arenaId;
  final String arenaName;
  final String city;
  final String? logoUrl;

  /// `INDEPENDENT` = cobra direto do aluno; senão é da equipe da arena.
  final bool independent;
  final double? distanceKm;
}

class PublicProfessorPlan {
  const PublicProfessorPlan({
    required this.name,
    required this.kind,
    required this.priceReais,
    this.classes,
  });

  factory PublicProfessorPlan.fromMap(Map<String, Object?> m) =>
      PublicProfessorPlan(
        name: _str(m['name'], 'Plano'),
        kind: _str(m['kind'], 'single'),
        priceReais: _double(m['priceReais']) ?? 0,
        classes: _int(m['classes']),
      );

  final String name;
  final String kind;
  final double priceReais;
  final int? classes;
}

class PublicProfessor {
  const PublicProfessor({
    required this.professorUid,
    required this.name,
    this.photoUrl,
    this.modalities = const [],
    this.arenas = const [],
    this.rating,
    this.ratingCount = 0,
    this.priceFromReais,
    this.acceptsPrivate = false,
    this.nearestKm,
    this.since,
    this.plans = const [],
    this.isMyProfessor = false,
    this.contactRequested = false,
  });

  factory PublicProfessor.fromMap(Map<String, Object?> m) {
    List<T> list<T>(String key, T Function(Map<String, Object?>) of) {
      final raw = m[key];
      return raw is List
          ? [
              for (final e in raw)
                if (e is Map) of(_map(e)),
            ]
          : <T>[];
    }

    final mods = m['modalities'];
    return PublicProfessor(
      professorUid: _str(m['professorUid']),
      name: _str(m['name'], 'Professor'),
      photoUrl: _strOrNull(m['photoUrl']),
      modalities: mods is List ? mods.whereType<String>().toList() : const [],
      arenas: list('arenas', PublicProfessorArena.fromMap),
      rating: _double(m['rating']),
      ratingCount: _int(m['ratingCount']) ?? 0,
      priceFromReais: _double(m['priceFromReais']),
      acceptsPrivate: m['acceptsPrivate'] == true,
      nearestKm: _double(m['nearestKm']),
      since: _strOrNull(m['since']),
      plans: list('plans', PublicProfessorPlan.fromMap),
      isMyProfessor: m['isMyProfessor'] == true,
      contactRequested: m['contactRequested'] == true,
    );
  }

  final String professorUid;
  final String name;
  final String? photoUrl;
  final List<String> modalities;

  /// Da mais perto para a mais longe.
  final List<PublicProfessorArena> arenas;
  final double? rating;
  final int ratingCount;
  final double? priceFromReais;
  final bool acceptsPrivate;
  final double? nearestKm;

  /// Só no perfil: `YYYY-MM-DD` do vínculo mais antigo na vitrine.
  final String? since;
  final List<PublicProfessorPlan> plans;
  final bool isMyProfessor;
  final bool contactRequested;

  PublicProfessor copyWith({bool? contactRequested}) => PublicProfessor(
        professorUid: professorUid,
        name: name,
        photoUrl: photoUrl,
        modalities: modalities,
        arenas: arenas,
        rating: rating,
        ratingCount: ratingCount,
        priceFromReais: priceFromReais,
        acceptsPrivate: acceptsPrivate,
        nearestKm: nearestKm,
        since: since,
        plans: plans,
        isMyProfessor: isMyProfessor,
        contactRequested: contactRequested ?? this.contactRequested,
      );
}

class ProfessorSearchResult {
  const ProfessorSearchResult(
      {this.items = const [], this.modalities = const []});

  factory ProfessorSearchResult.fromMap(Map<String, Object?> m) {
    final items = m['items'];
    final mods = m['modalities'];
    return ProfessorSearchResult(
      items: items is List
          ? [
              for (final e in items)
                if (e is Map) PublicProfessor.fromMap(_map(e)),
            ]
          : const [],
      modalities: mods is List ? mods.whereType<String>().toList() : const [],
    );
  }

  final List<PublicProfessor> items;

  /// Modalidades da vitrine (chips do filtro).
  final List<String> modalities;
}

/// O que a busca pede ao servidor (chave do provider — só valores simples).
typedef ProfessorSearchQuery = ({
  String sport,
  String text,
  double? lat,
  double? lng,
});

// ── rótulos ──────────────────────────────────────────────────────────────

/// "2,1 km" (ou "800 m").
String professorDistanceLabel(double km) {
  if (km < 1) return '${(km * 1000).round()} m';
  return '${km.toStringAsFixed(1).replaceAll('.', ',')} km';
}

/// "4,8".
String professorRatingLabel(double rating) =>
    rating.toStringAsFixed(1).replaceAll('.', ',');

/// "desde mar 2025".
String professorSinceLabel(String dateKey) {
  final d = DateTime.tryParse(dateKey);
  if (d == null) return '';
  const months = [
    'jan', 'fev', 'mar', 'abr', 'mai', 'jun', //
    'jul', 'ago', 'set', 'out', 'nov', 'dez',
  ];
  return 'desde ${months[d.month - 1]} ${d.year}';
}

// ── auxiliares ───────────────────────────────────────────────────────────

String _str(Object? v, [String fallback = '']) =>
    v is String && v.trim().isNotEmpty ? v.trim() : fallback;

String? _strOrNull(Object? v) =>
    v is String && v.trim().isNotEmpty ? v.trim() : null;

int? _int(Object? v) => v is num ? v.toInt() : null;

double? _double(Object? v) => v is num ? v.toDouble() : null;

Map<String, Object?> _map(Map<dynamic, dynamic> m) =>
    m.map((k, v) => MapEntry('$k', v));
