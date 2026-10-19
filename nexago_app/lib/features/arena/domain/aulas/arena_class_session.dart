import 'package:cloud_firestore/cloud_firestore.dart';

import 'arena_class.dart';
import 'arena_class_parse.dart';

/// Marca da chamada. Espelha `ATTENDANCE_MARKS` do backend.
enum AttendanceMark { present, absent, excused }

extension AttendanceMarkX on AttendanceMark {
  String get id => name;

  String get label => switch (this) {
        AttendanceMark.present => 'Presente',
        AttendanceMark.absent => 'Falta',
        AttendanceMark.excused => 'Avisou',
      };

  static AttendanceMark? fromId(Object? raw) {
    final id = raw is String ? raw.trim() : '';
    for (final m in AttendanceMark.values) {
      if (m.id == id) return m;
    }
    return null;
  }
}

/// Motivo do cancelamento. Espelha `CANCEL_REASON_LABELS` do backend.
enum ArenaClassCancelReason { rain, teacherAbsent, maintenance, holiday, other }

extension ArenaClassCancelReasonX on ArenaClassCancelReason {
  String get id => switch (this) {
        ArenaClassCancelReason.rain => 'rain',
        ArenaClassCancelReason.teacherAbsent => 'teacher_absent',
        ArenaClassCancelReason.maintenance => 'maintenance',
        ArenaClassCancelReason.holiday => 'holiday',
        ArenaClassCancelReason.other => 'other',
      };

  /// Rótulo do chip.
  String get label => switch (this) {
        ArenaClassCancelReason.rain => 'Chuva',
        ArenaClassCancelReason.teacherAbsent => 'Professor ausente',
        ArenaClassCancelReason.maintenance => 'Manutenção',
        ArenaClassCancelReason.holiday => 'Feriado',
        ArenaClassCancelReason.other => 'Outro',
      };

  /// Trecho que o backend põe entre parênteses no push (vazio em "outro").
  String get pushLabel => switch (this) {
        ArenaClassCancelReason.rain => 'chuva',
        ArenaClassCancelReason.teacherAbsent => 'ausência do professor',
        ArenaClassCancelReason.maintenance => 'manutenção da quadra',
        ArenaClassCancelReason.holiday => 'feriado',
        ArenaClassCancelReason.other => '',
      };

  static ArenaClassCancelReason? fromId(Object? raw) {
    final id = raw is String ? raw.trim() : '';
    for (final r in ArenaClassCancelReason.values) {
      if (r.id == id) return r;
    }
    return null;
  }
}

/// Aula de um dia em `arenaClassSessions/{class_{classId}_{date}}`.
///
/// Carrega um snapshot da turma (nome, professor, quadra, vagas) do momento em
/// que foi materializada; a quadra fica bloqueada pelo booking
/// [blockBookingId] enquanto a aula está `scheduled`.
class ArenaClassSession {
  const ArenaClassSession({
    required this.id,
    required this.classId,
    required this.arenaId,
    required this.className,
    required this.type,
    required this.sport,
    required this.level,
    required this.teacherName,
    required this.teacherColor,
    required this.courtName,
    required this.capacity,
    required this.date,
    required this.startTime,
    required this.endTime,
    this.startAt,
    required this.status,
    required this.attendance,
    this.closedAt,
    this.cancelReason,
    this.cancelNote,
  });

  final String id;
  final String classId;
  final String arenaId;
  final String className;
  final ArenaClassType type;
  final String sport;
  final ArenaClassLevel level;
  final String teacherName;
  final String teacherColor;
  final String courtName;
  final int capacity;

  /// `YYYY-MM-DD` (dia civil da arena).
  final String date;

  /// `HH:mm`.
  final String startTime;
  final String endTime;

  /// Instante do início (gravado pelo backend no fuso de São Paulo).
  final DateTime? startAt;

  /// `scheduled` | `canceled` | `completed`.
  final String status;

  /// studentId → marca da chamada.
  final Map<String, AttendanceMark> attendance;
  final DateTime? closedAt;
  final ArenaClassCancelReason? cancelReason;
  final String? cancelNote;

  bool get isScheduled => status == 'scheduled';
  bool get isCanceled => status == 'canceled';

  /// Chamada fechada.
  bool get isCompleted => status == 'completed';

  int get presentCount =>
      attendance.values.where((m) => m == AttendanceMark.present).length;

  factory ArenaClassSession.fromFirestore(
    DocumentSnapshot<Map<String, dynamic>> doc,
  ) =>
      ArenaClassSession.fromMap(doc.id, doc.data() ?? const {});

  factory ArenaClassSession.fromMap(String id, Map<String, dynamic> data) {
    final attendance = <String, AttendanceMark>{};
    final raw = data['attendance'];
    if (raw is Map) {
      for (final entry in raw.entries) {
        final value = entry.value;
        if (entry.key is! String || value is! Map) continue;
        final mark = AttendanceMarkX.fromId(value['mark']);
        if (mark != null) attendance[entry.key as String] = mark;
      }
    }
    return ArenaClassSession(
      id: id,
      classId: parseString(data['classId'], ''),
      arenaId: parseString(data['arenaId'], ''),
      className: parseString(data['className'], 'Aula'),
      type: ArenaClassTypeX.fromId(data['type']),
      sport: parseString(data['sport'], ''),
      level: ArenaClassLevelX.fromId(data['level']),
      teacherName: parseString(data['teacherName'], 'Professor'),
      teacherColor: parseString(data['teacherColor'], '#FF6A1A'),
      courtName: parseString(data['courtName'], 'Quadra'),
      capacity: parseInt(data['capacity'], 0),
      date: parseString(data['date'], ''),
      startTime: parseHm(data['startTime']),
      endTime: parseHm(data['endTime']),
      startAt: parseTimestamp(data['startAt']),
      status: parseString(data['status'], 'scheduled'),
      attendance: attendance,
      closedAt: parseTimestamp(data['closedAt']),
      cancelReason: ArenaClassCancelReasonX.fromId(data['cancelReason']),
      cancelNote: parseStringOrNull(data['cancelNote']),
    );
  }
}

/// Aluno em `arenaClasses/{classId}/classStudents/{studentId}` — atleta
/// NexaGO (docId = uid, [athleteId] preenchido) ou nome livre sem conta.
class ArenaClassStudent {
  const ArenaClassStudent({
    required this.id,
    required this.classId,
    this.athleteId,
    required this.name,
    this.phone,
    this.photoUrl,
    required this.status,
    this.enrolledAt,
  });

  final String id;
  final String classId;
  final String? athleteId;
  final String name;
  final String? phone;
  final String? photoUrl;

  /// `active` | `removed`.
  final String status;
  final DateTime? enrolledAt;

  bool get isActive => status == 'active';

  /// Tem conta NexaGO — recebe push quando a aula é cancelada.
  bool get hasAccount => athleteId != null;

  factory ArenaClassStudent.fromFirestore(
    DocumentSnapshot<Map<String, dynamic>> doc,
  ) =>
      ArenaClassStudent.fromMap(doc.id, doc.data() ?? const {});

  factory ArenaClassStudent.fromMap(String id, Map<String, dynamic> data) {
    return ArenaClassStudent(
      id: id,
      classId: parseString(data['classId'], ''),
      athleteId: parseStringOrNull(data['athleteId']),
      name: parseString(data['name'], 'Aluno'),
      phone: parseStringOrNull(data['phone']),
      photoUrl: parseStringOrNull(data['photoUrl']),
      status: parseString(data['status'], 'active'),
      enrolledAt: parseTimestamp(data['enrolledAt']),
    );
  }
}
