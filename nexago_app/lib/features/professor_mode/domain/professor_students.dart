import '../../arena/domain/aulas/arena_class.dart';
import '../../professor_links/domain/arena_professor_link.dart';

/// Alunos do professor, como a callable `getMyProfessorStudents` entrega:
/// as arenas em que ele dá aula, as turmas dele e os alunos dessas turmas —
/// só nas arenas com vínculo `ACTIVE` + "Gerenciar as próprias aulas" (a
/// mesma régua da chamada). Plano e situação do pagamento vêm só para a
/// equipe da arena. Nada aqui autoriza: o servidor já filtrou.
class ProfessorStudentsSnapshot {
  const ProfessorStudentsSnapshot({
    required this.todayKey,
    required this.arenas,
    required this.classes,
    required this.students,
  });

  static const empty = ProfessorStudentsSnapshot(
    todayKey: '',
    arenas: [],
    classes: [],
    students: [],
  );

  factory ProfessorStudentsSnapshot.fromMap(Map<String, Object?> map) {
    return ProfessorStudentsSnapshot(
      todayKey: _str(map['todayKey']),
      arenas: _maps(map['arenas']).map(ProfessorArenaSummary.fromMap).toList(),
      classes:
          _maps(map['classes']).map(ProfessorClassSummary.fromMap).toList(),
      students: _maps(map['students']).map(ProfessorStudent.fromMap).toList(),
    );
  }

  final String todayKey;
  final List<ProfessorArenaSummary> arenas;
  final List<ProfessorClassSummary> classes;
  final List<ProfessorStudent> students;

  ProfessorArenaSummary? arena(String arenaId) {
    for (final a in arenas) {
      if (a.arenaId == arenaId) return a;
    }
    return null;
  }

  ProfessorStudent? student(String arenaId, String studentId) {
    for (final s in students) {
      if (s.arenaId == arenaId && s.studentId == studentId) return s;
    }
    return null;
  }
}

class ProfessorArenaSummary {
  const ProfessorArenaSummary({
    required this.arenaId,
    required this.arenaName,
    required this.type,
    required this.canSeeStudents,
    required this.studentCount,
    required this.classCount,
  });

  factory ProfessorArenaSummary.fromMap(Map<String, Object?> map) {
    final raw = map['relationshipType'];
    return ProfessorArenaSummary(
      arenaId: _str(map['arenaId']),
      arenaName: _str(map['arenaName'], 'Arena'),
      type: raw == null ? null : ArenaProfessorLinkType.parse(raw),
      canSeeStudents: map['canSeeStudents'] == true,
      studentCount: _int(map['studentCount']) ?? 0,
      classCount: _int(map['classCount']) ?? 0,
    );
  }

  final String arenaId;
  final String arenaName;

  /// `null`: dá aula na arena sem vínculo (professor das Aulas de antes).
  final ArenaProfessorLinkType? type;
  final bool canSeeStudents;
  final int studentCount;
  final int classCount;
}

class ProfessorClassSummary {
  const ProfessorClassSummary({
    required this.classId,
    required this.arenaId,
    required this.arenaName,
    required this.name,
    required this.type,
    required this.level,
    required this.weekdays,
    required this.startTime,
    required this.endTime,
    required this.courtName,
    required this.capacity,
    required this.activeCount,
    required this.waitlistCount,
    required this.presenceRate,
    required this.nextDate,
    required this.status,
  });

  factory ProfessorClassSummary.fromMap(Map<String, Object?> map) {
    return ProfessorClassSummary(
      classId: _str(map['classId']),
      arenaId: _str(map['arenaId']),
      arenaName: _str(map['arenaName'], 'Arena'),
      name: _str(map['name'], 'Aula'),
      type: ArenaClassTypeX.fromId(map['type']),
      level: ArenaClassLevelX.fromId(map['level']),
      weekdays: _ints(map['weekdays']),
      startTime: _str(map['startTime']),
      endTime: _str(map['endTime']),
      courtName: _str(map['courtName']),
      capacity: _int(map['capacity']) ?? 0,
      activeCount: _int(map['activeCount']) ?? 0,
      waitlistCount: _int(map['waitlistCount']) ?? 0,
      presenceRate: _int(map['presenceRate']),
      nextDate: _strOrNull(map['nextDate']),
      status: _str(map['status']),
    );
  }

  final String classId;
  final String arenaId;
  final String arenaName;
  final String name;
  final ArenaClassType type;
  final ArenaClassLevel level;

  /// ISO 1–7; vazio = aula avulsa.
  final List<int> weekdays;
  final String startTime;
  final String endTime;
  final String courtName;
  final int capacity;
  final int activeCount;
  final int waitlistCount;
  final int? presenceRate;
  final String? nextDate;
  final String status;

  bool get isPaused => status == 'paused';
}

/// Marca da chamada nas aulas do professor.
enum ProfessorMark { present, absent, excused }

class ProfessorStudentMark {
  const ProfessorStudentMark({
    required this.date,
    required this.mark,
    required this.makeup,
  });

  factory ProfessorStudentMark.fromMap(Map<String, Object?> map) {
    final mark = switch (map['mark']) {
      'present' => ProfessorMark.present,
      'excused' => ProfessorMark.excused,
      _ => ProfessorMark.absent,
    };
    return ProfessorStudentMark(
      date: _str(map['date']),
      mark: mark,
      makeup: map['makeup'] == true,
    );
  }

  final String date;
  final ProfessorMark mark;

  /// Veio como reposição nesta aula.
  final bool makeup;
}

class ProfessorStudentClass {
  const ProfessorStudentClass({
    required this.classId,
    required this.name,
    required this.type,
    required this.weekdays,
    required this.startTime,
    required this.endTime,
  });

  factory ProfessorStudentClass.fromMap(Map<String, Object?> map) {
    return ProfessorStudentClass(
      classId: _str(map['classId']),
      name: _str(map['name'], 'Aula'),
      type: ArenaClassTypeX.fromId(map['type']),
      weekdays: _ints(map['weekdays']),
      startTime: _str(map['startTime']),
      endTime: _str(map['endTime']),
    );
  }

  final String classId;
  final String name;
  final ArenaClassType type;
  final List<int> weekdays;
  final String startTime;
  final String endTime;
}

class ProfessorStudentPlan {
  const ProfessorStudentPlan({
    required this.enrollmentId,
    required this.paused,
    required this.name,
    required this.kind,
    required this.priceReais,
    required this.credits,
    required this.creditsLeft,
    required this.expiresOn,
  });

  factory ProfessorStudentPlan.fromMap(Map<String, Object?> map) {
    return ProfessorStudentPlan(
      enrollmentId: _str(map['enrollmentId']),
      paused: map['status'] == 'paused',
      name: _str(map['name'], 'Plano'),
      kind: _str(map['kind']),
      priceReais: _num(map['priceReais']) ?? 0,
      credits: _int(map['credits']),
      creditsLeft: _int(map['creditsLeft']),
      expiresOn: _strOrNull(map['expiresOn']),
    );
  }

  final String enrollmentId;
  final bool paused;
  final String name;

  /// `monthly`, `package` ou `single`.
  final String kind;
  final double priceReais;
  final int? credits;
  final int? creditsLeft;
  final String? expiresOn;

  bool get isPackage => kind == 'package';
}

/// Situação do pagamento — mesma régua do app da arena
/// (`arenaClassStudentStanding`).
enum ProfessorBillingStanding { upToDate, dueToday, overdue, paused, noPlan }

class ProfessorStudentBilling {
  const ProfessorStudentBilling({
    required this.standing,
    required this.nextDueDate,
  });

  factory ProfessorStudentBilling.fromMap(Map<String, Object?> map) {
    final standing = switch (map['standing']) {
      'due_today' => ProfessorBillingStanding.dueToday,
      'overdue' => ProfessorBillingStanding.overdue,
      'paused' => ProfessorBillingStanding.paused,
      'no_plan' => ProfessorBillingStanding.noPlan,
      _ => ProfessorBillingStanding.upToDate,
    };
    return ProfessorStudentBilling(
      standing: standing,
      nextDueDate: _strOrNull(map['nextDueDate']),
    );
  }

  final ProfessorBillingStanding standing;
  final String? nextDueDate;

  /// Atrasado ou vencendo hoje — o filtro "Pendentes".
  bool get isPending =>
      standing == ProfessorBillingStanding.overdue ||
      standing == ProfessorBillingStanding.dueToday;
}

class ProfessorStudent {
  const ProfessorStudent({
    required this.studentId,
    required this.arenaId,
    required this.arenaName,
    required this.athleteId,
    required this.name,
    required this.photoUrl,
    required this.paused,
    required this.since,
    required this.classes,
    required this.marks,
    required this.presenceRate,
    required this.lastDate,
    required this.credits,
    required this.plans,
    required this.billing,
  });

  factory ProfessorStudent.fromMap(Map<String, Object?> map) {
    final billing = map['billing'];
    return ProfessorStudent(
      studentId: _str(map['studentId']),
      arenaId: _str(map['arenaId']),
      arenaName: _str(map['arenaName'], 'Arena'),
      athleteId: _strOrNull(map['athleteId']),
      name: _str(map['name'], 'Aluno'),
      photoUrl: _strOrNull(map['photoUrl']),
      paused: map['status'] == 'paused',
      since: _strOrNull(map['since']),
      classes:
          _maps(map['classes']).map(ProfessorStudentClass.fromMap).toList(),
      marks: _maps(map['marks']).map(ProfessorStudentMark.fromMap).toList(),
      presenceRate: _int(map['presenceRate']),
      lastDate: _strOrNull(map['lastDate']),
      credits: _int(map['credits']) ?? 0,
      plans: _maps(map['plans']).map(ProfessorStudentPlan.fromMap).toList(),
      billing: billing is Map
          ? ProfessorStudentBilling.fromMap(_stringKeys(billing))
          : null,
    );
  }

  final String studentId;
  final String arenaId;
  final String arenaName;
  final String? athleteId;
  final String name;
  final String? photoUrl;
  final bool paused;

  /// `YYYY-MM-DD` da entrada mais antiga numa turma do professor.
  final String? since;
  final List<ProfessorStudentClass> classes;

  /// Últimas marcas, da mais antiga para a mais recente.
  final List<ProfessorStudentMark> marks;
  final int? presenceRate;
  final String? lastDate;

  /// Créditos de reposição disponíveis na arena.
  final int credits;

  /// Vazio fora da equipe da arena (ou sem matrícula).
  final List<ProfessorStudentPlan> plans;

  /// `null` fora da equipe da arena: a cobrança não é do professor ver.
  final ProfessorStudentBilling? billing;

  /// Chave estável na tela (o mesmo aluno pode estar em duas arenas).
  String get key => '$arenaId::$studentId';
}

String _str(Object? v, [String fallback = '']) =>
    v is String && v.isNotEmpty ? v : fallback;

String? _strOrNull(Object? v) => v is String && v.isNotEmpty ? v : null;

int? _int(Object? v) => v is num ? v.round() : null;

double? _num(Object? v) => v is num ? v.toDouble() : null;

List<int> _ints(Object? v) =>
    v is List ? v.whereType<num>().map((n) => n.toInt()).toList() : const [];

Map<String, Object?> _stringKeys(Map raw) =>
    raw.map((k, v) => MapEntry(k.toString(), v));

List<Map<String, Object?>> _maps(Object? v) =>
    v is List ? v.whereType<Map>().map(_stringKeys).toList() : const [];
