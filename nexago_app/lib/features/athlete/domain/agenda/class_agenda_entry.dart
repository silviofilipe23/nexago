/// Aula da arena na agenda do atleta — espelha um item de `getMyClassAgenda`
/// (`functions/src/arena-class-athlete-agenda.ts`). As coleções de aula são só
/// da equipe da arena; o atleta lê pela callable, sem dado de outro aluno.
class ClassAgendaEntry {
  const ClassAgendaEntry({
    required this.sessionId,
    required this.arenaId,
    required this.arenaName,
    required this.classId,
    required this.className,
    required this.teacherName,
    required this.courtName,
    required this.date,
    required this.startTime,
    required this.endTime,
    required this.startAt,
    required this.status,
    required this.role,
    required this.kind,
    this.myMark,
    this.studentCount,
  });

  final String sessionId;
  final String arenaId;
  final String arenaName;
  final String classId;
  final String className;
  final String teacherName;
  final String courtName;

  /// `YYYY-MM-DD` (dia da aula no fuso da arena).
  final String date;
  final String startTime;
  final String endTime;

  /// Instante de início (UTC) — null em aula antiga sem `startAt`.
  final DateTime? startAt;

  /// `scheduled`, `canceled` ou `completed`.
  final String status;

  /// `student` ou `teacher`.
  final String role;

  /// `regular`, `makeup` (reposição) ou `trial` (experimental).
  final String kind;
  final String? myMark;
  final int? studentCount;

  bool get isTeacher => role == 'teacher';
  bool get isCanceled => status == 'canceled';

  factory ClassAgendaEntry.fromMap(Map<String, Object?> map) {
    String s(String key, [String fallback = '']) {
      final v = map[key];
      return v is String ? v : fallback;
    }

    final startRaw = map['startAt'];
    final count = map['studentCount'];
    final mark = map['myMark'];
    return ClassAgendaEntry(
      sessionId: s('sessionId'),
      arenaId: s('arenaId'),
      arenaName: s('arenaName', 'Arena'),
      classId: s('classId'),
      className: s('className', 'Aula'),
      teacherName: s('teacherName'),
      courtName: s('courtName'),
      date: s('date'),
      startTime: s('startTime'),
      endTime: s('endTime'),
      startAt: startRaw is String ? DateTime.tryParse(startRaw) : null,
      status: s('status', 'scheduled'),
      role: s('role', 'student'),
      kind: s('kind', 'regular'),
      myMark: mark is String ? mark : null,
      studentCount: count is num ? count.toInt() : null,
    );
  }
}
