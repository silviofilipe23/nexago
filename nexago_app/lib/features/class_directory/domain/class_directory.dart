/// Hub › Aulas e treinos (canvas "Atleta - Hub Aulas", H2–H5): quem oferece
/// aula perto do atleta — arenas com turma, centros de treinamento e
/// professores independentes. Espelha `searchClassDirectory` e
/// `getClassDirectoryDetail` (`functions/src/class-directory.ts`); os
/// professores vêm da vitrine que já existe (`searchProfessors`).
library;

import '../../athlete_training/domain/public_professor.dart';

/// Tipo do resultado — também é o segmento da lista.
enum ClassProviderKind { arena, center, professor }

extension ClassProviderKindX on ClassProviderKind {
  String get tagLabel => switch (this) {
        ClassProviderKind.arena => 'Arena',
        ClassProviderKind.center => 'Centro de treinamento',
        ClassProviderKind.professor => 'Professor independente',
      };

  /// Id que a callable entende.
  String get wireId => switch (this) {
        ClassProviderKind.arena => 'arena',
        ClassProviderKind.center => 'center',
        ClassProviderKind.professor => 'professor',
      };
}

class DirectoryPerson {
  const DirectoryPerson({required this.name, this.photoUrl});

  factory DirectoryPerson.fromMap(Map<String, Object?> m) => DirectoryPerson(
        name: _str(m['name'], 'Professor'),
        photoUrl: _strOrNull(m['photoUrl']),
      );

  final String name;
  final String? photoUrl;
}

/// Turma de destaque no card da lista.
class DirectorySlot {
  const DirectorySlot({
    required this.className,
    required this.level,
    required this.weekdays,
    required this.startTime,
    required this.openSpots,
  });

  factory DirectorySlot.fromMap(Map<String, Object?> m) => DirectorySlot(
        className: _str(m['className'], 'Turma'),
        level: _str(m['level']),
        weekdays: _ints(m['weekdays']),
        startTime: _str(m['startTime']),
        openSpots: _int(m['openSpots']) ?? 0,
      );

  final String className;
  final String level;
  final List<int> weekdays;
  final String startTime;
  final int openSpots;
}

/// Aula experimental configurada na vitrine do portal (arena ou CT).
class DirectoryTrial {
  const DirectoryTrial({this.priceReais = 0, this.note = ''});

  /// `null` quando a vitrine não oferece experimental.
  static DirectoryTrial? fromMap(Object? raw) {
    if (raw is! Map || raw['enabled'] != true) return null;
    return DirectoryTrial(
      priceReais: _double(raw['priceReais']) ?? 0,
      note: _str(raw['note']),
    );
  }

  final double priceReais;
  final String note;

  bool get isFree => priceReais <= 0;
}

/// Um item da lista (H2): arena, CT ou professor.
class ClassProvider {
  const ClassProvider({
    required this.kind,
    required this.id,
    required this.name,
    this.logoUrl,
    this.city = '',
    this.sports = const [],
    this.levels = const [],
    this.classCount = 0,
    this.openSpots = 0,
    this.distanceKm,
    this.priceFromReais,
    this.professorCount = 0,
    this.professors = const [],
    this.highlight,
    this.schedule = const [],
    this.trial,
    this.places = const [],
    this.rating,
    this.ratingCount = 0,
    this.acceptsPrivate = false,
  });

  factory ClassProvider.fromMap(Map<String, Object?> m) => ClassProvider(
        kind: m['kind'] == 'center'
            ? ClassProviderKind.center
            : ClassProviderKind.arena,
        id: _str(m['id']),
        name: _str(m['name'], 'Arena'),
        logoUrl: _strOrNull(m['logoUrl']),
        city: _str(m['city']),
        sports: _strs(m['sports']),
        levels: _strs(m['levels']),
        classCount: _int(m['classCount']) ?? 0,
        openSpots: _int(m['openSpots']) ?? 0,
        distanceKm: _double(m['distanceKm']),
        priceFromReais: _double(m['priceFromReais']),
        professorCount: _int(m['professorCount']) ?? 0,
        professors: _maps(m['professors'], DirectoryPerson.fromMap),
        highlight: m['highlight'] is Map
            ? DirectorySlot.fromMap(_map(m['highlight']! as Map))
            : null,
        schedule: _maps(m['schedule'], DirectorySlot.fromMap),
        trial: DirectoryTrial.fromMap(m['trial']),
      );

  /// Professor da vitrine (`searchProfessors`) como item do diretório. Só
  /// entra quem atende como independente em alguma arena — o da equipe da
  /// arena já aparece dentro dela.
  factory ClassProvider.fromProfessor(PublicProfessor p) => ClassProvider(
        kind: ClassProviderKind.professor,
        id: p.professorUid,
        name: p.name,
        logoUrl: p.photoUrl,
        city: p.arenas.isEmpty ? '' : p.arenas.first.city,
        sports: p.modalities,
        distanceKm: p.nearestKm ??
            (p.arenas.isEmpty ? null : p.arenas.first.distanceKm),
        priceFromReais: p.priceFromReais,
        places: [for (final a in p.arenas) a.arenaName],
        rating: p.rating,
        ratingCount: p.ratingCount,
        acceptsPrivate: p.acceptsPrivate,
      );

  final ClassProviderKind kind;
  final String id;
  final String name;
  final String? logoUrl;
  final String city;
  final List<String> sports;
  final List<String> levels;
  final int classCount;
  final int openSpots;
  final double? distanceKm;
  final double? priceFromReais;
  final int professorCount;
  final List<DirectoryPerson> professors;
  final DirectorySlot? highlight;

  /// Grade compacta de todas as turmas (filtros de nível, período e vaga).
  final List<DirectorySlot> schedule;

  /// Aula experimental da vitrine (arena/CT); `null` = não oferece.
  final DirectoryTrial? trial;

  /// Professor: arenas onde dá aula.
  final List<String> places;
  final double? rating;
  final int ratingCount;
  final bool acceptsPrivate;

  /// Professor sempre "tem horário" (a agenda dele decide); arena/CT, só com
  /// vaga em alguma turma.
  bool get hasOpening =>
      kind == ClassProviderKind.professor ? acceptsPrivate : openSpots > 0;
}

/// Turma no detalhe (H4/H5).
class DirectoryClass {
  const DirectoryClass({
    required this.classId,
    required this.name,
    this.level = '',
    this.sport = '',
    this.weekdays = const [],
    this.startTime = '',
    this.endTime = '',
    this.professorName = '',
    this.professorUid,
    this.place = '',
    this.capacity = 0,
    this.taken = 0,
    this.programId,
  });

  factory DirectoryClass.fromMap(Map<String, Object?> m) => DirectoryClass(
        classId: _str(m['classId']),
        name: _str(m['name'], 'Turma'),
        level: _str(m['level']),
        sport: _str(m['sport']),
        weekdays: _ints(m['weekdays']),
        startTime: _str(m['startTime']),
        endTime: _str(m['endTime']),
        professorName: _str(m['professorName']),
        professorUid: _strOrNull(m['professorUid']),
        place: _str(m['place']),
        capacity: _int(m['capacity']) ?? 0,
        taken: _int(m['taken']) ?? 0,
        programId: _strOrNull(m['programId']),
      );

  final String classId;
  final String name;
  final String level;
  final String sport;
  final List<int> weekdays;
  final String startTime;
  final String endTime;
  final String professorName;
  final String? professorUid;
  final String place;
  final int capacity;
  final int taken;
  final String? programId;

  int get openSpots => (capacity - taken).clamp(0, capacity);
  bool get isFull => capacity > 0 && openSpots == 0;
}

class DirectoryPlan {
  const DirectoryPlan({
    required this.name,
    required this.kind,
    required this.priceReais,
    this.classesPerWeek,
    this.credits,
    this.description = '',
    this.featured = false,
    this.programIds = const [],
  });

  factory DirectoryPlan.fromMap(Map<String, Object?> m) => DirectoryPlan(
        name: _str(m['name'], 'Plano'),
        kind: _str(m['kind'], 'monthly'),
        priceReais: _double(m['priceReais']) ?? 0,
        classesPerWeek: _int(m['classesPerWeek']),
        credits: _int(m['credits']),
        description: _str(m['description']),
        featured: m['featured'] == true,
        programIds: _strs(m['programIds']),
      );

  final String name;
  final String kind;
  final double priceReais;
  final int? classesPerWeek;
  final int? credits;
  final String description;
  final bool featured;
  final List<String> programIds;

  /// "/mês", "/pacote" ou "/aula".
  String get unit => switch (kind) {
        'monthly' => '/mês',
        'single' => '/aula',
        _ => '/pacote',
      };
}

class DirectoryProgram {
  const DirectoryProgram({
    required this.programId,
    required this.name,
    this.color = '',
    this.levels = const [],
  });

  factory DirectoryProgram.fromMap(Map<String, Object?> m) => DirectoryProgram(
        programId: _str(m['programId']),
        name: _str(m['name'], 'Programa'),
        color: _str(m['color']),
        levels: _strs(m['levels']),
      );

  final String programId;
  final String name;
  final String color;
  final List<String> levels;
}

class DirectoryPlace {
  const DirectoryPlace({
    required this.name,
    this.address = '',
    this.notes = '',
    this.distanceKm,
  });

  factory DirectoryPlace.fromMap(Map<String, Object?> m) => DirectoryPlace(
        name: _str(m['name'], 'Local'),
        address: _str(m['address']),
        notes: _str(m['notes']),
        distanceKm: _double(m['distanceKm']),
      );

  final String name;
  final String address;
  final String notes;
  final double? distanceKm;
}

class DirectoryStaff {
  const DirectoryStaff({
    required this.name,
    this.photoUrl,
    this.professorUid,
    this.role = '',
  });

  factory DirectoryStaff.fromMap(Map<String, Object?> m) => DirectoryStaff(
        name: _str(m['name'], 'Professor'),
        photoUrl: _strOrNull(m['photoUrl']),
        professorUid: _strOrNull(m['professorUid']),
        role: _str(m['role']),
      );

  final String name;
  final String? photoUrl;

  /// Com valor, abre o perfil público do professor (T11).
  final String? professorUid;
  final String role;
}

/// Detalhe da arena (H4) ou do CT (H5).
class ClassProviderDetail {
  const ClassProviderDetail({
    required this.kind,
    required this.id,
    required this.name,
    this.description = '',
    this.logoUrl,
    this.coverUrl,
    this.city = '',
    this.state = '',
    this.sports = const [],
    this.contactPhone,
    this.classes = const [],
    this.plans = const [],
    this.programs = const [],
    this.places = const [],
    this.professors = const [],
    this.makeupNoticeHours,
    this.trial,
  });

  factory ClassProviderDetail.fromMap(Map<String, Object?> m) =>
      ClassProviderDetail(
        kind: m['kind'] == 'center'
            ? ClassProviderKind.center
            : ClassProviderKind.arena,
        id: _str(m['id']),
        name: _str(m['name'], 'Arena'),
        description: _str(m['description']),
        logoUrl: _strOrNull(m['logoUrl']),
        coverUrl: _strOrNull(m['coverUrl']),
        city: _str(m['city']),
        state: _str(m['state']),
        sports: _strs(m['sports']),
        contactPhone: _strOrNull(m['contactPhone']),
        classes: _maps(m['classes'], DirectoryClass.fromMap),
        plans: _maps(m['plans'], DirectoryPlan.fromMap),
        programs: _maps(m['programs'], DirectoryProgram.fromMap),
        places: _maps(m['places'], DirectoryPlace.fromMap),
        professors: _maps(m['professors'], DirectoryStaff.fromMap),
        makeupNoticeHours: _int(m['makeupNoticeHours']),
        trial: DirectoryTrial.fromMap(m['trial']),
      );

  final ClassProviderKind kind;
  final String id;
  final String name;
  final String description;
  final String? logoUrl;
  final String? coverUrl;
  final String city;
  final String state;
  final List<String> sports;
  final String? contactPhone;
  final List<DirectoryClass> classes;
  final List<DirectoryPlan> plans;
  final List<DirectoryProgram> programs;
  final List<DirectoryPlace> places;
  final List<DirectoryStaff> professors;
  final int? makeupNoticeHours;

  /// Aula experimental da vitrine; `null` = não oferece.
  final DirectoryTrial? trial;

  bool get isCenter => kind == ClassProviderKind.center;
}

// ── auxiliares ───────────────────────────────────────────────────────────

String _str(Object? v, [String fallback = '']) =>
    v is String && v.trim().isNotEmpty ? v.trim() : fallback;

String? _strOrNull(Object? v) =>
    v is String && v.trim().isNotEmpty ? v.trim() : null;

int? _int(Object? v) => v is num ? v.toInt() : null;

double? _double(Object? v) => v is num ? v.toDouble() : null;

List<String> _strs(Object? v) => v is List
    ? [
        for (final e in v)
          if (e is String && e.trim().isNotEmpty) e.trim(),
      ]
    : const [];

List<int> _ints(Object? v) => v is List
    ? [
        for (final e in v)
          if (e is num) e.toInt(),
      ]
    : const [];

Map<String, Object?> _map(Map<dynamic, dynamic> m) =>
    m.map((k, v) => MapEntry('$k', v));

List<T> _maps<T>(Object? v, T Function(Map<String, Object?>) of) => v is List
    ? [
        for (final e in v)
          if (e is Map) of(_map(e)),
      ]
    : <T>[];
