import '../../arena/domain/aulas/arena_class.dart';

/// O que a arena liberou para o professor DA EQUIPE fazer nas turmas dele
/// (fase 2: chaves do vínculo, desligadas por padrão). É só dica para a
/// tela: quem decide é a callable.
class ProfessorArenaActions {
  const ProfessorArenaActions({
    required this.canEnrollStudents,
    required this.canScheduleLessons,
    required this.canCancelLessons,
  });

  static const none = ProfessorArenaActions(
    canEnrollStudents: false,
    canScheduleLessons: false,
    canCancelLessons: false,
  );

  factory ProfessorArenaActions.fromMap(Object? raw) {
    if (raw is! Map) return none;
    return ProfessorArenaActions(
      canEnrollStudents: raw['canEnrollStudents'] == true,
      canScheduleLessons: raw['canScheduleLessons'] == true,
      canCancelLessons: raw['canCancelLessons'] == true,
    );
  }

  final bool canEnrollStudents;
  final bool canScheduleLessons;
  final bool canCancelLessons;

  bool get any => canEnrollStudents || canScheduleLessons || canCancelLessons;
}

/// Plano da tabela da arena (o professor não escolhe preço).
class ProfessorPlanOption {
  const ProfessorPlanOption({
    required this.planId,
    required this.name,
    required this.kind,
    required this.priceReais,
    required this.classesPerWeek,
    required this.credits,
    required this.validityDays,
  });

  factory ProfessorPlanOption.fromMap(Map<String, Object?> map) {
    return ProfessorPlanOption(
      planId: _str(map['planId']),
      name: _str(map['name'], 'Plano'),
      kind: _str(map['kind']),
      priceReais: _num(map['priceReais']) ?? 0,
      classesPerWeek: _int(map['classesPerWeek']),
      credits: _int(map['credits']),
      validityDays: _int(map['validityDays']),
    );
  }

  final String planId;
  final String name;

  /// `monthly` ou `package`.
  final String kind;
  final double priceReais;
  final int? classesPerWeek;
  final int? credits;
  final int? validityDays;

  bool get isMonthly => kind == 'monthly';
  bool get isPackage => kind == 'package';
}

class ProfessorActionClass {
  const ProfessorActionClass({
    required this.classId,
    required this.name,
    required this.type,
    required this.level,
    required this.sport,
    required this.weekdays,
    required this.startTime,
    required this.endTime,
    required this.courtName,
    required this.capacity,
    required this.takenByWeekday,
  });

  factory ProfessorActionClass.fromMap(Map<String, Object?> map) {
    final taken = <int, int>{};
    final raw = map['takenByWeekday'];
    if (raw is Map) {
      raw.forEach((k, v) {
        final day = int.tryParse(k.toString());
        if (day != null && v is num) taken[day] = v.toInt();
      });
    }
    return ProfessorActionClass(
      classId: _str(map['classId']),
      name: _str(map['name'], 'Turma'),
      type: ArenaClassTypeX.fromId(map['type']),
      level: ArenaClassLevelX.fromId(map['level']),
      sport: _str(map['sport']),
      weekdays: _ints(map['weekdays']),
      startTime: _str(map['startTime']),
      endTime: _str(map['endTime']),
      courtName: _str(map['courtName']),
      capacity: _int(map['capacity']) ?? 0,
      takenByWeekday: taken,
    );
  }

  final String classId;
  final String name;
  final ArenaClassType type;
  final ArenaClassLevel level;
  final String sport;
  final List<int> weekdays;
  final String startTime;
  final String endTime;
  final String courtName;
  final int capacity;

  /// Alunos ativos por dia da semana (ISO 1–7).
  final Map<int, int> takenByWeekday;

  int freeOn(int weekday) => capacity - (takenByWeekday[weekday] ?? 0);

  /// Vagas no dia mais cheio — o que dá para prometer em todos os dias.
  int get freeSpots => weekdays.isEmpty
      ? 0
      : weekdays.map(freeOn).reduce((a, b) => a < b ? a : b);

  bool get isFull => freeSpots <= 0;
}

class ProfessorSessionExtra {
  const ProfessorSessionExtra({
    required this.studentId,
    required this.name,
    required this.kind,
    required this.athleteId,
  });

  factory ProfessorSessionExtra.fromMap(Map<String, Object?> map) {
    return ProfessorSessionExtra(
      studentId: _str(map['studentId']),
      name: _str(map['name'], 'Aluno'),
      kind: _str(map['kind']),
      athleteId: _strOrNull(map['athleteId']),
    );
  }

  final String studentId;
  final String name;

  /// `makeup` ou `trial`.
  final String kind;
  final String? athleteId;
}

/// Aula do professor nos próximos dias (encaixe, reposição, aviso).
class ProfessorActionSession {
  const ProfessorActionSession({
    required this.sessionId,
    required this.classId,
    required this.className,
    required this.type,
    required this.date,
    required this.startTime,
    required this.endTime,
    required this.courtName,
    required this.capacity,
    required this.taken,
    required this.studentCount,
    required this.extras,
  });

  factory ProfessorActionSession.fromMap(Map<String, Object?> map) {
    return ProfessorActionSession(
      sessionId: _str(map['sessionId']),
      classId: _str(map['classId']),
      className: _str(map['className'], 'Aula'),
      type: ArenaClassTypeX.fromId(map['type']),
      date: _str(map['date']),
      startTime: _str(map['startTime']),
      endTime: _str(map['endTime']),
      courtName: _str(map['courtName']),
      capacity: _int(map['capacity']) ?? 0,
      taken: _int(map['taken']) ?? 0,
      studentCount: _int(map['studentCount']) ?? 0,
      extras: _maps(map['extras']).map(ProfessorSessionExtra.fromMap).toList(),
    );
  }

  final String sessionId;
  final String classId;
  final String className;
  final ArenaClassType type;
  final String date;
  final String startTime;
  final String endTime;
  final String courtName;
  final int capacity;

  /// Turma do dia + encaixes.
  final int taken;
  final int studentCount;
  final List<ProfessorSessionExtra> extras;

  int get free => capacity - taken;
}

class ProfessorWaitlistEntry {
  const ProfessorWaitlistEntry({
    required this.entryId,
    required this.classId,
    required this.name,
    required this.athleteId,
    required this.note,
    required this.since,
  });

  factory ProfessorWaitlistEntry.fromMap(Map<String, Object?> map) {
    return ProfessorWaitlistEntry(
      entryId: _str(map['entryId']),
      classId: _str(map['classId']),
      name: _str(map['name'], 'Aluno'),
      athleteId: _strOrNull(map['athleteId']),
      note: _strOrNull(map['note']),
      since: _strOrNull(map['since']),
    );
  }

  final String entryId;
  final String classId;
  final String name;
  final String? athleteId;
  final String? note;
  final String? since;
}

class ProfessorMakeupCredit {
  const ProfessorMakeupCredit({
    required this.creditId,
    required this.studentId,
    required this.name,
    required this.expiresOn,
    required this.sourceDate,
  });

  factory ProfessorMakeupCredit.fromMap(Map<String, Object?> map) {
    return ProfessorMakeupCredit(
      creditId: _str(map['creditId']),
      studentId: _str(map['studentId']),
      name: _str(map['name'], 'Aluno'),
      expiresOn: _strOrNull(map['expiresOn']),
      sourceDate: _strOrNull(map['sourceDate']),
    );
  }

  final String creditId;
  final String studentId;
  final String name;
  final String? expiresOn;
  final String? sourceDate;
}

/// Experimental recente (com conta) que ainda não é aluno do professor.
class ProfessorTrialCandidate {
  const ProfessorTrialCandidate({
    required this.sessionId,
    required this.classId,
    required this.className,
    required this.date,
    required this.startTime,
    required this.studentId,
    required this.athleteId,
    required this.name,
    required this.mark,
  });

  factory ProfessorTrialCandidate.fromMap(Map<String, Object?> map) {
    return ProfessorTrialCandidate(
      sessionId: _str(map['sessionId']),
      classId: _str(map['classId']),
      className: _str(map['className'], 'Aula'),
      date: _str(map['date']),
      startTime: _str(map['startTime']),
      studentId: _str(map['studentId']),
      athleteId: _str(map['athleteId']),
      name: _str(map['name'], 'Aluno'),
      mark: _strOrNull(map['mark']),
    );
  }

  final String sessionId;
  final String classId;
  final String className;
  final String date;
  final String startTime;
  final String studentId;
  final String athleteId;
  final String name;

  /// Marca da chamada da experimental (`present`, `absent`…), se fechada.
  final String? mark;
}

/// Tudo o que as telas de ação leem numa arena (`getProfessorClassActions`).
class ProfessorActionsContext {
  const ProfessorActionsContext({
    required this.todayKey,
    required this.arenaId,
    required this.permissions,
    required this.onlineBillingEnabled,
    required this.makeupValidityDays,
    required this.cancelGeneratesCredit,
    required this.enrollmentFeeReais,
    required this.plans,
    required this.classes,
    required this.sessions,
    required this.waitlist,
    required this.credits,
    required this.trials,
  });

  factory ProfessorActionsContext.fromMap(Map<String, Object?> map) {
    final rules = map['rules'] is Map
        ? _stringKeys(map['rules'] as Map)
        : const <String, Object?>{};
    return ProfessorActionsContext(
      todayKey: _str(map['todayKey']),
      arenaId: _str(map['arenaId']),
      permissions: ProfessorArenaActions.fromMap(map['permissions']),
      onlineBillingEnabled: rules['onlineBillingEnabled'] == true,
      makeupValidityDays: _int(rules['makeupValidityDays']) ?? 30,
      cancelGeneratesCredit: rules['arenaCancelGeneratesCredit'] != false,
      enrollmentFeeReais: _num(rules['enrollmentFeeReais']) ?? 0,
      plans: _maps(map['plans']).map(ProfessorPlanOption.fromMap).toList(),
      classes: _maps(map['classes']).map(ProfessorActionClass.fromMap).toList(),
      sessions:
          _maps(map['sessions']).map(ProfessorActionSession.fromMap).toList(),
      waitlist:
          _maps(map['waitlist']).map(ProfessorWaitlistEntry.fromMap).toList(),
      credits:
          _maps(map['credits']).map(ProfessorMakeupCredit.fromMap).toList(),
      trials:
          _maps(map['trials']).map(ProfessorTrialCandidate.fromMap).toList(),
    );
  }

  final String todayKey;
  final String arenaId;
  final ProfessorArenaActions permissions;
  final bool onlineBillingEnabled;
  final int makeupValidityDays;
  final bool cancelGeneratesCredit;
  final double enrollmentFeeReais;
  final List<ProfessorPlanOption> plans;
  final List<ProfessorActionClass> classes;
  final List<ProfessorActionSession> sessions;
  final List<ProfessorWaitlistEntry> waitlist;
  final List<ProfessorMakeupCredit> credits;
  final List<ProfessorTrialCandidate> trials;

  ProfessorActionClass? classById(String classId) {
    for (final c in classes) {
      if (c.classId == classId) return c;
    }
    return null;
  }

  List<ProfessorWaitlistEntry> waitlistOf(String classId) =>
      waitlist.where((w) => w.classId == classId).toList();

  List<ProfessorMakeupCredit> creditsOf(String studentId) =>
      credits.where((c) => c.studentId == studentId).toList();
}

/// Prévia da 1ª cobrança da matrícula (servidor).
class ProfessorEnrollmentPreview {
  const ProfessorEnrollmentPreview(
      {required this.charges, required this.total});

  factory ProfessorEnrollmentPreview.fromMap(Map<String, Object?> map) {
    return ProfessorEnrollmentPreview(
      charges: _maps(map['charges'])
          .map((c) => (
                description: _str(c['description'], 'Cobrança'),
                amount: _num(c['amountReais']) ?? 0,
                dueDate: _str(c['dueDate']),
              ))
          .toList(),
      total: _num(map['totalReais']) ?? 0,
    );
  }

  final List<({String description, double amount, String dueDate})> charges;
  final double total;
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
