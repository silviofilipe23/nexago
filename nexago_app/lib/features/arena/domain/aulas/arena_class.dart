import 'package:cloud_firestore/cloud_firestore.dart';

import 'arena_class_parse.dart';

/// Tipo da aula. Espelha `CLASS_TYPES` em `functions/src/arena-class-constants.ts`.
enum ArenaClassType { turma, particular, dupla, experimental }

extension ArenaClassTypeX on ArenaClassType {
  String get id => name;

  String get label => switch (this) {
        ArenaClassType.turma => 'Turma',
        ArenaClassType.particular => 'Particular',
        ArenaClassType.dupla => 'Dupla',
        ArenaClassType.experimental => 'Experimental',
      };

  /// Valor desconhecido cai em turma — mesmo default do `parseArenaClass`.
  static ArenaClassType fromId(Object? raw) {
    final id = raw is String ? raw.trim() : '';
    for (final t in ArenaClassType.values) {
      if (t.id == id) return t;
    }
    return ArenaClassType.turma;
  }
}

/// Nível da turma. Espelha `CLASS_LEVELS` do backend.
enum ArenaClassLevel { iniciante, intermediario, avancado, kids, livre }

extension ArenaClassLevelX on ArenaClassLevel {
  String get id => name;

  String get label => switch (this) {
        ArenaClassLevel.iniciante => 'Iniciante',
        ArenaClassLevel.intermediario => 'Intermediário',
        ArenaClassLevel.avancado => 'Avançado',
        ArenaClassLevel.kids => 'Kids',
        ArenaClassLevel.livre => 'Livre',
      };

  static ArenaClassLevel fromId(Object? raw) {
    final id = raw is String ? raw.trim() : '';
    for (final l in ArenaClassLevel.values) {
      if (l.id == id) return l;
    }
    return ArenaClassLevel.livre;
  }
}

/// Turma ou aula avulsa em `arenaClasses/{classId}`.
///
/// Escrita SEMPRE via callables (`upsertArenaClass`, `setArenaClassStatus`…);
/// o app só lê. Na fase 1 turmas são criadas no portal da arena.
class ArenaClass {
  const ArenaClass({
    required this.id,
    required this.arenaId,
    required this.name,
    required this.type,
    required this.sport,
    required this.level,
    required this.teacherId,
    required this.teacherName,
    required this.teacherColor,
    required this.weekdays,
    required this.startTime,
    required this.endTime,
    required this.courtId,
    required this.courtName,
    required this.capacity,
    required this.studentCount,
    required this.startDate,
    this.endDate,
    required this.status,
    required this.conflictDates,
  });

  final String id;
  final String arenaId;
  final String name;
  final ArenaClassType type;

  /// Código do catálogo de esportes.
  final String sport;
  final ArenaClassLevel level;
  final String teacherId;
  final String teacherName;

  /// `#RRGGBB` do professor.
  final String teacherColor;

  /// ISO 1=seg … 7=dom; vazio = aula avulsa (uma data só, [startDate]).
  final List<int> weekdays;

  /// `HH:mm`.
  final String startTime;
  final String endTime;
  final String courtId;
  final String courtName;
  final int capacity;

  /// Alunos ativos — mantido pelo backend na mesma transação da matrícula.
  final int studentCount;

  /// `YYYY-MM-DD`.
  final String startDate;
  final String? endDate;

  /// `active` | `paused` | `archived`.
  final String status;

  /// Datas em que a quadra estava ocupada e a aula não foi criada.
  final List<String> conflictDates;

  bool get isActive => status == 'active';
  bool get isPaused => status == 'paused';
  bool get isArchived => status == 'archived';

  /// Aula avulsa (particular/dupla/experimental marcada para um dia só).
  bool get isSingle => weekdays.isEmpty;

  bool get isFull => capacity > 0 && studentCount >= capacity;

  factory ArenaClass.fromFirestore(
    DocumentSnapshot<Map<String, dynamic>> doc,
  ) =>
      ArenaClass.fromMap(doc.id, doc.data() ?? const {});

  factory ArenaClass.fromMap(String id, Map<String, dynamic> data) {
    final weekdays = <int>[
      if (data['weekdays'] is List)
        for (final d in data['weekdays'] as List)
          if (d is num && d.toInt() >= 1 && d.toInt() <= 7) d.toInt(),
    ]..sort();
    return ArenaClass(
      id: id,
      arenaId: parseString(data['arenaId'], ''),
      name: parseString(data['name'], 'Aula'),
      type: ArenaClassTypeX.fromId(data['type']),
      sport: parseString(data['sport'], ''),
      level: ArenaClassLevelX.fromId(data['level']),
      teacherId: parseString(data['teacherId'], ''),
      teacherName: parseString(data['teacherName'], 'Professor'),
      teacherColor: parseString(data['teacherColor'], '#FF6A1A'),
      weekdays: weekdays,
      startTime: parseHm(data['startTime']),
      endTime: parseHm(data['endTime']),
      courtId: parseString(data['courtId'], ''),
      courtName: parseString(data['courtName'], 'Quadra'),
      capacity: parseInt(data['capacity'], 0),
      studentCount: parseInt(data['studentCount'], 0),
      startDate: parseString(data['startDate'], ''),
      endDate: parseStringOrNull(data['endDate']),
      status: parseString(data['status'], ''),
      conflictDates: parseStringList(data['conflictDates']),
    );
  }
}
