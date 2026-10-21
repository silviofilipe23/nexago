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
    this.canManageLessons = false,
    this.classType,
    this.sport,
    this.myRsvp,
    this.checkedIn = false,
    this.makeupNoticeHours,
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

  /// Só para o professor: o vínculo com a arena libera "Gerenciar as próprias
  /// aulas" — a chamada (`getMyClassSessionRoster` + `saveArenaClassAttendance`).
  /// Servidor antigo (sem o campo) = `false`.
  final bool canManageLessons;

  /// Tipo da turma (`turma`, `particular`, `dupla`, `experimental`).
  /// Servidor antigo (sem o campo) = `null`.
  final String? classType;

  /// Esporte da turma (código do catálogo). Servidor antigo ou aula antiga
  /// sem esporte = `null`.
  final String? sport;

  /// Só aluno: o que respondeu pelo app — `going`, `not_going` ou `null`.
  /// Servidor antigo (sem o campo) = `null`.
  final String? myRsvp;

  /// Só aluno: já fez check-in na arena pelo app.
  final bool checkedIn;

  /// Só aluno: antecedência (h) que a arena pede no "Não vou" para dar crédito
  /// de reposição. Servidor antigo = `null` (o app usa o padrão).
  final int? makeupNoticeHours;

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
    final type = map['classType'];
    final sport = map['sport'];
    final rsvp = map['myRsvp'];
    final notice = map['makeupNoticeHours'];
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
      canManageLessons: map['canManageLessons'] == true,
      classType: type is String && type.trim().isNotEmpty ? type.trim() : null,
      sport: sport is String && sport.trim().isNotEmpty ? sport.trim() : null,
      myRsvp: rsvp == 'going' || rsvp == 'not_going' ? rsvp as String : null,
      checkedIn: map['checkedIn'] == true,
      makeupNoticeHours: notice is num ? notice.toInt() : null,
    );
  }
}
