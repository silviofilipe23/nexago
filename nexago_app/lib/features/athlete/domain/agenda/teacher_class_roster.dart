import '../../../arena/domain/aulas/arena_class_session.dart';

/// Lista da chamada de uma aula que o usuário dá como professor — resposta de
/// `getMyClassSessionRoster` (`functions/src/arena-class-teacher.ts`). Só com
/// vínculo `ACTIVE` e "Gerenciar as próprias aulas" naquela arena: nome, foto,
/// tipo e marca de cada aluno, sem telefone nem financeiro.
class TeacherClassRoster {
  const TeacherClassRoster({required this.session, required this.students});

  factory TeacherClassRoster.fromMap(Map<String, Object?> map) {
    final rawSession = map['session'];
    final rawStudents = map['students'];
    return TeacherClassRoster(
      session: TeacherClassRosterSession.fromMap(
        rawSession is Map
            ? rawSession.map((k, v) => MapEntry(k.toString(), v))
            : const {},
      ),
      students: [
        if (rawStudents is List)
          for (final raw in rawStudents.whereType<Map>())
            TeacherClassRosterStudent.fromMap(
              raw.map((k, v) => MapEntry(k.toString(), v)),
            ),
      ],
    );
  }

  final TeacherClassRosterSession session;
  final List<TeacherClassRosterStudent> students;

  /// Marcas gravadas (aluno → marca), para comparar com o rascunho.
  Map<String, AttendanceMark> get savedMarks => {
        for (final s in students)
          if (s.mark != null) s.studentId: s.mark!,
      };
}

class TeacherClassRosterSession {
  const TeacherClassRosterSession({
    required this.sessionId,
    required this.arenaId,
    required this.arenaName,
    required this.classId,
    required this.className,
    required this.date,
    required this.startTime,
    required this.endTime,
    required this.courtName,
    required this.status,
    required this.attendanceOpen,
    this.teacherNote,
    this.sport,
  });

  factory TeacherClassRosterSession.fromMap(Map<String, Object?> map) {
    String s(String key, [String fallback = '']) {
      final v = map[key];
      return v is String && v.trim().isNotEmpty ? v.trim() : fallback;
    }

    final note = s('teacherNote');
    return TeacherClassRosterSession(
      sessionId: s('sessionId'),
      arenaId: s('arenaId'),
      arenaName: s('arenaName', 'Arena'),
      classId: s('classId'),
      className: s('className', 'Aula'),
      date: s('date'),
      startTime: s('startTime'),
      endTime: s('endTime'),
      courtName: s('courtName', 'Quadra'),
      status: s('status', 'scheduled'),
      attendanceOpen: map['attendanceOpen'] == true,
      teacherNote: note.isEmpty ? null : note,
      sport: s('sport').isEmpty ? null : s('sport'),
    );
  }

  final String sessionId;
  final String arenaId;
  final String arenaName;
  final String classId;
  final String className;

  /// `YYYY-MM-DD` (dia da aula no fuso da arena).
  final String date;
  final String startTime;
  final String endTime;
  final String courtName;

  /// `scheduled`, `canceled` ou `completed`.
  final String status;

  /// A chamada abre no dia da aula e fica fechada em aula cancelada.
  final bool attendanceOpen;
  final String? teacherNote;

  /// Esporte da turma (código do catálogo); `null` em aula antiga.
  final String? sport;

  bool get isCanceled => status == 'canceled';
  bool get isCompleted => status == 'completed';
}

class TeacherClassRosterStudent {
  const TeacherClassRosterStudent({
    required this.studentId,
    required this.name,
    required this.kind,
    this.photoUrl,
    this.mark,
    this.storyTaggable = false,
  });

  factory TeacherClassRosterStudent.fromMap(Map<String, Object?> map) {
    final name = map['name'];
    final photo = map['photoUrl'];
    final kind = map['kind'];
    return TeacherClassRosterStudent(
      studentId: map['studentId'] is String ? map['studentId']! as String : '',
      name: name is String && name.trim().isNotEmpty ? name.trim() : 'Aluno',
      photoUrl:
          photo is String && photo.trim().isNotEmpty ? photo.trim() : null,
      kind: kind == 'makeup' || kind == 'trial' ? kind! as String : 'regular',
      mark: AttendanceMarkX.fromId(map['mark']),
      storyTaggable: map['storyTaggable'] == true,
    );
  }

  final String studentId;
  final String name;
  final String? photoUrl;

  /// `regular`, `makeup` (reposição) ou `trial` (experimental).
  final String kind;
  final AttendanceMark? mark;

  /// Aluno com conta que liberou a marcação no story do treino (servidor
  /// confere de novo ao marcar). Servidor antigo não manda: `false`.
  final bool storyTaggable;

  bool get isPresent => mark == AttendanceMark.present;
}
