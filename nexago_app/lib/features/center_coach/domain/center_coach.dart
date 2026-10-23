/// App do Professor do Centro de Treinamento (canvas "NexaGO Centro de
/// Treinamento", P1–P9): o professor é um membro do centro
/// (`trainingCenters/{c}/centerMembers/{uid}`, papel `coach`) e lê/grava
/// direto no Firestore o que as rules liberam — a chamada das aulas em que
/// ele é o professor da data (`sessions.coachUid`). Créditos não saem daqui:
/// o gatilho `onTrainingCenterSessionWritten` aplica pela chamada.
///
/// Tudo neste arquivo é puro — os providers só entregam os documentos.

enum CenterMark { present, excused, absent }

CenterMark? centerMarkFrom(Object? raw) => switch (raw) {
  'present' => CenterMark.present,
  'excused' => CenterMark.excused,
  'absent' => CenterMark.absent,
  _ => null,
};

String centerMarkValue(CenterMark m) => switch (m) {
  CenterMark.present => 'present',
  CenterMark.excused => 'excused',
  CenterMark.absent => 'absent',
};

/// "Presente" / "Falta justificada" / "Falta" (mesmos rótulos do portal).
String centerMarkLabel(CenterMark? m) => switch (m) {
  CenterMark.present => 'Presente',
  CenterMark.excused => 'Falta justificada',
  CenterMark.absent => 'Falta',
  null => 'Sem marcação',
};

/// Letra do botão da chamada (P · J · F).
String centerMarkLetter(CenterMark m) => switch (m) {
  CenterMark.present => 'P',
  CenterMark.excused => 'J',
  CenterMark.absent => 'F',
};

const Map<String, String> kCenterRoleLabels = {
  'center_owner': 'Owner',
  'center_admin': 'Admin',
  'coach': 'Professor',
  'receptionist': 'Recepção',
};

/// Vínculo da conta com um centro (`centerMembers/{uid}`).
class CenterMembership {
  const CenterMembership({
    required this.centerId,
    required this.centerName,
    required this.role,
    required this.status,
    this.displayName = '',
    this.extraPerms = const [],
  });

  factory CenterMembership.fromMap(String centerId, Map<String, Object?> m) =>
      CenterMembership(
        centerId: centerId,
        centerName: _str(m['centerName'], 'Centro de treinamento'),
        role: _str(m['role'], 'coach'),
        status: _str(m['status'], 'invited'),
        displayName: _str(m['displayName']),
        extraPerms: _strings(m['extraPerms']),
      );

  final String centerId;
  final String centerName;

  /// `center_owner`, `center_admin`, `coach` ou `receptionist`.
  final String role;

  /// `active`, `invited` ou `revoked`.
  final String status;
  final String displayName;
  final List<String> extraPerms;

  bool get isActive => status == 'active';
  bool get isRevoked => status == 'revoked';
  bool get isManager => role == 'center_owner' || role == 'center_admin';
  String get roleLabel => kCenterRoleLabels[role] ?? 'Equipe';

  /// Espelha `ctHasPerm` das rules (papel + `extraPerms`).
  bool has(String perm) {
    if (!isActive) return false;
    if (isManager) return true;
    if (role == 'receptionist' &&
        (perm == 'view_enrollments' || perm == 'enroll_students')) {
      return true;
    }
    if (role == 'coach' && (perm == 'edit_classes' || perm == 'attendance')) {
      return true;
    }
    return extraPerms.contains(perm);
  }

  /// Vê o cadastro de todos os alunos (senão só os dele, `coachUids`).
  bool get seesAllStudents =>
      isManager || has('enroll_students') || has('view_finance');
}

/// Regras do centro que mudam o que a chamada faz com os créditos.
class CenterCoachPolicies {
  const CenterCoachPolicies({
    this.unexcusedAbsenceConsumes = true,
    this.excusedAbsenceMakeup = true,
    this.excusedNoticeHours = 4,
    this.makeupValidityDays = 30,
    this.cancelledClassMakeupAuto = true,
  });

  factory CenterCoachPolicies.fromMap(Map<String, Object?> m) =>
      CenterCoachPolicies(
        unexcusedAbsenceConsumes: m['unexcusedAbsenceConsumes'] != false,
        excusedAbsenceMakeup: m['excusedAbsenceMakeup'] != false,
        excusedNoticeHours: _int(m['excusedNoticeHours']) ?? 4,
        makeupValidityDays: _int(m['makeupValidityDays']) ?? 30,
        cancelledClassMakeupAuto: m['cancelledClassMakeup'] != 'manual',
      );

  final bool unexcusedAbsenceConsumes;
  final bool excusedAbsenceMakeup;
  final int excusedNoticeHours;
  final int makeupValidityDays;

  /// Aula cancelada pelo centro gera reposição automática (`auto`).
  final bool cancelledClassMakeupAuto;
}

class CenterCoachCenter {
  const CenterCoachCenter({
    required this.id,
    required this.name,
    this.status = 'active',
    this.policies = const CenterCoachPolicies(),
  });

  factory CenterCoachCenter.fromMap(String id, Map<String, Object?> m) =>
      CenterCoachCenter(
        id: id,
        name: _str(m['name'], 'Centro de treinamento'),
        status: _str(m['status'], 'pending'),
        policies: m['policies'] is Map
            ? CenterCoachPolicies.fromMap(_map(m['policies'] as Map))
            : const CenterCoachPolicies(),
      );

  final String id;
  final String name;

  /// `pending`, `active` ou `suspended` (suspenso = só leitura).
  final String status;
  final CenterCoachPolicies policies;

  bool get isSuspended => status == 'suspended';
}

/// Turma (`classes/{id}`).
class CenterCoachClass {
  const CenterCoachClass({
    required this.id,
    required this.name,
    this.level = '',
    this.coachUid = '',
    this.coachName = '',
    this.weekdays = const [],
    this.startTime = '',
    this.durationMin = 60,
    this.locationName = '',
    this.courtName = '',
    this.capacity = 0,
    this.seatsTaken = 0,
    this.rosterStudentIds = const [],
    this.status = 'active',
  });

  factory CenterCoachClass.fromMap(String id, Map<String, Object?> m) {
    final weekdays = m['weekdays'];
    return CenterCoachClass(
      id: id,
      name: _str(m['name'], 'Turma'),
      level: _str(m['level']),
      coachUid: _str(m['coachUid']),
      coachName: _str(m['coachName']),
      weekdays: weekdays is List
          ? [
              for (final w in weekdays)
                if (w is num) w.toInt() == 0 ? 7 : w.toInt(),
            ]
          : const [],
      startTime: _str(m['startTime']),
      durationMin: _int(m['durationMin']) ?? 60,
      locationName: _str(m['locationName']),
      courtName: _str(m['courtName']),
      capacity: _int(m['capacity']) ?? 0,
      seatsTaken: _int(m['seatsTaken']) ?? 0,
      rosterStudentIds: _strings(m['rosterStudentIds']),
      status: _str(m['status'], 'active'),
    );
  }

  final String id;
  final String name;
  final String level;
  final String coachUid;
  final String coachName;

  /// ISO: 1 = segunda … 7 = domingo.
  final List<int> weekdays;
  final String startTime;
  final int durationMin;
  final String locationName;
  final String courtName;
  final int capacity;
  final int seatsTaken;
  final List<String> rosterStudentIds;

  /// `draft`, `active`, `closed` ou `cancelled`.
  final String status;
}

/// Correção da chamada depois de finalizada (`sessions.attendanceLog[]`).
class AttendanceCorrection {
  const AttendanceCorrection({
    required this.studentId,
    required this.to,
    this.from,
    this.byName = '',
    this.reason = '',
    this.at,
  });

  factory AttendanceCorrection.fromMap(Map<String, Object?> m) =>
      AttendanceCorrection(
        studentId: _str(m['studentId']),
        from: centerMarkFrom(m['from']),
        to: centerMarkFrom(m['to']),
        byName: _str(m['byName']),
        reason: _str(m['reason']),
        at: _date(m['at']),
      );

  final String studentId;
  final CenterMark? from;
  final CenterMark? to;
  final String byName;
  final String reason;
  final DateTime? at;
}

/// Aula gerada (`sessions/{classId}_{dia}`).
class CenterCoachSession {
  const CenterCoachSession({
    required this.id,
    required this.classId,
    required this.className,
    required this.date,
    required this.startTime,
    this.durationMin = 60,
    this.coachUid = '',
    this.coachName = '',
    this.locationName = '',
    this.locationAddress = '',
    this.courtName = '',
    this.status = 'scheduled',
    this.changed = false,
    this.changeReason = '',
    this.attendance = const {},
    this.makeupStudentIds = const [],
    this.finalizedAt,
    this.finalizedByName = '',
    this.attendanceLog = const [],
    this.effects = const {},
    this.rsvps = const {},
    this.attendanceByStudent = const {},
  });

  factory CenterCoachSession.fromMap(String id, Map<String, Object?> m) {
    final att = m['attendance'] is Map
        ? _map(m['attendance'] as Map)
        : const {};
    final eff = m['effectsApplied'] is Map
        ? _map(m['effectsApplied'] as Map)
        : const {};
    final rsvps = m['rsvps'] is Map ? _map(m['rsvps'] as Map) : const {};
    final byStudent = m['attendanceByStudent'] is Map
        ? _map(m['attendanceByStudent'] as Map)
        : const {};
    final log = m['attendanceLog'];
    return CenterCoachSession(
      id: id,
      classId: _str(m['classId']),
      className: _str(m['className'], 'Aula'),
      date: _str(m['date']),
      startTime: _str(m['startTime'], '08:00'),
      durationMin: _int(m['durationMin']) ?? 60,
      coachUid: _str(m['coachUid']),
      coachName: _str(m['coachName']),
      locationName: _str(m['locationName']),
      locationAddress: _str(m['locationAddress']),
      courtName: _str(m['courtName']),
      status: _str(m['status'], 'scheduled'),
      changed: m['changed'] == true,
      changeReason: _str(m['changeReason']),
      attendance: {
        for (final e in att.entries)
          if (centerMarkFrom(e.value) != null) e.key: centerMarkFrom(e.value)!,
      },
      makeupStudentIds: _strings(m['makeupStudentIds']),
      finalizedAt: _date(m['finalizedAt']),
      finalizedByName: _str(m['finalizedByName']),
      attendanceLog: log is List
          ? [
              for (final x in log)
                if (x is Map) AttendanceCorrection.fromMap(_map(x)),
            ]
          : const [],
      effects: {
        for (final e in eff.entries)
          if (e.value is Map)
            e.key: (
              credit: _int((e.value as Map)['credit']) ?? 0,
              makeup: _int((e.value as Map)['makeup']) ?? 0,
            ),
      },
      rsvps: {
        for (final e in rsvps.entries)
          if (e.value is Map &&
              ((e.value as Map)['response'] == 'going' ||
                  (e.value as Map)['response'] == 'not_going'))
            e.key: (e.value as Map)['response'] as String,
      },
      attendanceByStudent: {
        for (final e in byStudent.entries)
          if (e.value == true) e.key: true,
      },
    );
  }

  final String id;
  final String classId;
  final String className;

  /// `YYYY-MM-DD` (dia no fuso do centro).
  final String date;

  /// `HH:mm`.
  final String startTime;
  final int durationMin;
  final String coachUid;
  final String coachName;
  final String locationName;
  final String locationAddress;
  final String courtName;

  /// `scheduled`, `cancelled` ou `done`.
  final String status;
  final bool changed;
  final String changeReason;
  final Map<String, CenterMark> attendance;
  final List<String> makeupStudentIds;
  final DateTime? finalizedAt;
  final String finalizedByName;
  final List<AttendanceCorrection> attendanceLog;

  /// Créditos que o servidor já aplicou por esta chamada.
  final Map<String, ({int credit, int makeup})> effects;

  /// "Vou" / "Não vou" do aluno pelo app.
  final Map<String, String> rsvps;
  final Map<String, bool> attendanceByStudent;

  bool get isDone => status == 'done';
  bool get isCancelled => status == 'cancelled';

  /// "Quadra 2 · Sede Barra".
  String get placeLabel =>
      [courtName, locationName].where((s) => s.trim().isNotEmpty).join(' · ');

  /// `HH:mm` do fim.
  String get endTime {
    final p = startTime.split(':');
    final h = p.isNotEmpty ? int.tryParse(p[0]) : null;
    final mi = p.length > 1 ? int.tryParse(p[1]) : null;
    if (h == null || mi == null) return '';
    final t = (h * 60 + mi + durationMin) % (24 * 60);
    return '${(t ~/ 60).toString().padLeft(2, '0')}:'
        '${(t % 60).toString().padLeft(2, '0')}';
  }
}

/// Aluno visível para o professor (`students` com `coachUids` dele).
class CenterCoachStudent {
  const CenterCoachStudent({
    required this.id,
    required this.name,
    this.isMinor = false,
    this.billingHold = false,
    this.makeupCredits = 0,
    this.status = 'active',
    this.uid = '',
    this.email = '',
    this.phone = '',
    this.guardianName = '',
    this.guardianRelation = '',
    this.guardianPhone = '',
    this.birthDate = '',
    this.createdAt,
  });

  factory CenterCoachStudent.fromMap(String id, Map<String, Object?> m) {
    final g = m['guardian'] is Map ? _map(m['guardian'] as Map) : const {};
    return CenterCoachStudent(
      id: id,
      name: _str(m['name'], 'Aluno'),
      isMinor: m['isMinor'] == true,
      billingHold: m['billingHold'] == true,
      makeupCredits: _int(m['makeupCredits']) ?? 0,
      status: _str(m['status'], 'active'),
      uid: _str(m['uid']),
      email: _str(m['email']),
      phone: _str(m['phone']),
      guardianName: _str(g['name']),
      guardianRelation: _str(g['relation']),
      guardianPhone: _str(g['phone']),
      birthDate: _str(m['birthDate']),
      createdAt: _date(m['createdAt']),
    );
  }

  final String id;
  final String name;
  final bool isMinor;
  final bool billingHold;
  final int makeupCredits;

  /// `active`, `invited`, `inactive` ou `blocked`.
  final String status;

  /// Conta NexaGO vinculada (vazio = só convidado por e-mail).
  final String uid;
  final String email;
  final String phone;
  final String guardianName;
  final String guardianRelation;
  final String guardianPhone;

  /// `YYYY-MM-DD` (vazio se não informado).
  final String birthDate;
  final DateTime? createdAt;
}

/// Aluno que dá para encaixar com crédito de reposição
/// (`listTrainingCenterMakeupCandidates`).
class MakeupCandidate {
  const MakeupCandidate({
    required this.id,
    required this.name,
    required this.makeupCredits,
  });

  final String id;
  final String name;
  final int makeupCredits;
}

/// Matrícula (`enrollments/{id}`) — só o que a gestão do dia precisa.
class CenterCoachEnrollment {
  const CenterCoachEnrollment({
    required this.id,
    required this.studentId,
    required this.classId,
    required this.status,
    this.className = '',
    this.planName = '',
    this.planType = '',
    this.priceCents,
    this.creditsLeft,
    this.startDate = '',
  });

  factory CenterCoachEnrollment.fromMap(String id, Map<String, Object?> m) {
    final c = m['contract'] is Map ? _map(m['contract'] as Map) : const {};
    return CenterCoachEnrollment(
      id: id,
      studentId: _str(m['studentId']),
      classId: _str(m['classId']),
      status: _str(m['status']),
      className: _str(m['className']),
      planName: _str(c['planName']),
      planType: _str(c['planType']),
      priceCents: _int(c['priceCents']),
      creditsLeft: _int(m['creditsLeft']),
      startDate: _str(m['startDate']),
    );
  }

  final String id;
  final String studentId;
  final String classId;
  final String className;
  final String planName;

  /// `monthly`, `package`, `single`… (do contrato da matrícula).
  final String planType;
  final int? priceCents;

  /// Aulas que sobram no pacote (`null` = plano sem contagem).
  final int? creditsLeft;
  final String startDate;

  /// `pending`, `active`, `paused`, `cancelled`, `completed` ou `waitlisted`.
  final String status;

  /// Ocupa vaga e está treinando (pausada não recebe reposição de cancelamento).
  bool get attends => status == 'active' || status == 'pending';

  /// Ocupa vaga (espelha `holdsSeat` do portal: pendente, ativa ou pausada).
  bool get holdsSeat =>
      status == 'active' || status == 'pending' || status == 'paused';
}

/// Cobrança do centro (`invoices/{id}`) — só para quem vê o financeiro.
class CenterCoachInvoice {
  const CenterCoachInvoice({
    required this.id,
    required this.status,
    required this.amountCents,
    required this.dueDate,
    this.approvedAt,
    this.studentId = '',
    this.reference = '',
  });

  factory CenterCoachInvoice.fromMap(String id, Map<String, Object?> m) =>
      CenterCoachInvoice(
        id: id,
        status: _str(m['status'], 'pending'),
        amountCents: _int(m['amountCents']) ?? 0,
        dueDate: _str(m['dueDate']),
        approvedAt: _date(m['approvedAt']),
        studentId: _str(m['studentId']),
        reference: _str(m['reference']),
      );

  final String id;
  final String studentId;

  /// "Mensalidade outubro", "Pacote 8 aulas"…
  final String reference;
  final String status;
  final int amountCents;
  final String dueDate;
  final DateTime? approvedAt;
}

/// Resultado do check-in (`checkInTrainingCenterStudent`).
class CenterCheckinResult {
  const CenterCheckinResult({
    required this.state,
    this.studentId = '',
    this.studentName = '',
    this.sessionId,
    this.className = '',
    this.startTime = '',
    this.coachName = '',
    this.billingHold = false,
    this.makeup = false,
  });

  factory CenterCheckinResult.fromMap(Map<String, Object?> m) =>
      CenterCheckinResult(
        state: _str(m['state'], 'no_session'),
        studentId: _str(m['studentId']),
        studentName: _str(m['studentName'], 'Aluno'),
        sessionId: _str(m['sessionId']).isEmpty ? null : _str(m['sessionId']),
        className: _str(m['className']),
        startTime: _str(m['startTime']),
        coachName: _str(m['coachName']),
        billingHold: m['billingHold'] == true,
        makeup: m['makeup'] == true,
      );

  /// `checked_in`, `already`, `hold`, `no_session` ou `wrong_center`.
  final String state;
  final String studentId;
  final String studentName;
  final String? sessionId;
  final String className;
  final String startTime;
  final String coachName;
  final bool billingHold;
  final bool makeup;

  bool get ok => state == 'checked_in' || state == 'already';
}

// ── regras ───────────────────────────────────────────────────────────────

/// O professor faz a chamada desta aula: é o professor da data, tem a
/// permissão, a aula não foi cancelada, já é o dia (ou passou) e o centro
/// não está suspenso. Espelha `canAttend` do portal e a rule de `sessions`.
bool coachCanTakeAttendance({
  required CenterMembership? member,
  required CenterCoachCenter? center,
  required CenterCoachSession session,
  required String uid,
  required String todayKey,
}) {
  if (member == null || !member.isActive) return false;
  if (center != null && center.isSuspended) return false;
  if (session.isCancelled) return false;
  if (session.date.compareTo(todayKey) > 0) return false;
  if (member.isManager) return true;
  return session.coachUid == uid && member.has('attendance');
}

/// Uma linha da chamada.
class RollCallRow {
  const RollCallRow({
    required this.studentId,
    required this.name,
    this.mark,
    this.makeup = false,
    this.former = false,
    this.hold = false,
    this.rsvp,
    this.excusedByStudent = false,
    this.effect,
  });

  final String studentId;
  final String name;
  final CenterMark? mark;

  /// Encaixado como reposição (não é da turma).
  final bool makeup;

  /// Saiu da turma, mas tem marcação nesta aula.
  final bool former;

  /// Mensalidade em atraso (a recepção resolve).
  final bool hold;

  /// `going` / `not_going` pelo app.
  final String? rsvp;
  final bool excusedByStudent;
  final ({int credit, int makeup})? effect;
}

/// Quem aparece na chamada: a turma, os encaixados de reposição e quem já tem
/// marca (mesmo que tenha saído) — mesma ordem do portal.
List<RollCallRow> buildRollCall({
  required CenterCoachSession session,
  required CenterCoachClass? cls,
  required Map<String, CenterMark> marks,
  required List<String> makeupIds,
  required Map<String, CenterCoachStudent> students,
  Map<String, String> extraNames = const {},
}) {
  final roster = cls?.rosterStudentIds ?? const <String>[];
  final inRoster = roster.toSet();
  final makeups = [
    for (final id in makeupIds)
      if (!inRoster.contains(id)) id,
  ];
  final ids = <(String, bool, bool)>[
    for (final id in roster) (id, false, false),
    for (final id in makeups) (id, true, false),
    for (final id in marks.keys)
      if (!inRoster.contains(id) && !makeups.contains(id)) (id, false, true),
  ];
  return [
    for (final (id, makeup, former) in ids)
      RollCallRow(
        studentId: id,
        name:
            students[id]?.name ??
            extraNames[id] ??
            (makeup ? 'Aluno de reposição' : 'Aluno removido'),
        mark: marks[id],
        makeup: makeup,
        former: former,
        hold: students[id]?.billingHold ?? false,
        rsvp: session.rsvps[id],
        excusedByStudent: session.attendanceByStudent[id] == true,
        effect: session.effects[id],
      ),
  ];
}

class RollCallCounts {
  const RollCallCounts(this.present, this.excused, this.absent, this.unmarked);

  final int present;
  final int excused;
  final int absent;
  final int unmarked;

  int get total => present + excused + absent + unmarked;
}

RollCallCounts rollCallCounts(List<RollCallRow> rows) {
  var p = 0, j = 0, f = 0, u = 0;
  for (final r in rows) {
    switch (r.mark) {
      case CenterMark.present:
        p++;
      case CenterMark.excused:
        j++;
      case CenterMark.absent:
        f++;
      case null:
        u++;
    }
  }
  return RollCallCounts(p, j, f, u);
}

/// O que finalizar faz com os créditos de cada aluno (P5), pelas regras do
/// centro. O servidor é quem aplica; aqui é só a explicação.
String finalizeConsequence(RollCallRow r, CenterCoachPolicies p) {
  if (r.makeup) {
    return r.mark == CenterMark.present
        ? 'Crédito de reposição consumido'
        : 'Reposição não usada · o crédito volta';
  }
  return switch (r.mark) {
    CenterMark.present => 'Aula usada do plano',
    CenterMark.excused =>
      p.excusedAbsenceMakeup
          ? 'Falta justificada · reposição por ${p.makeupValidityDays} dias'
          : 'Falta justificada · sem reposição',
    CenterMark.absent =>
      p.unexcusedAbsenceConsumes
          ? 'Falta não justificada · consome aula/crédito'
          : 'Falta não justificada · não consome',
    null => 'Sem marcação',
  };
}

/// "−1 crédito do pacote", "+1 reposição"… do que o servidor já aplicou.
String effectLabel(({int credit, int makeup})? e) {
  if (e == null) return '';
  final parts = <String>[
    if (e.credit != 0)
      '${e.credit > 0 ? '+' : '−'}${e.credit.abs()} crédito do pacote',
    if (e.makeup != 0) '${e.makeup > 0 ? '+' : '−'}${e.makeup.abs()} reposição',
  ];
  return parts.join(' · ');
}

/// Resposta do aluno pelo app, como etiqueta.
String? rsvpLabel(RollCallRow r) => switch (r.rsvp) {
  'going' => 'Vai · app',
  'not_going' => r.excusedByStudent ? 'Avisou no prazo · app' : 'Não vai · app',
  _ => null,
};

/// Correção válida: mudou a marca e explicou (≥ 3 letras).
String? correctionError(CenterMark? from, CenterMark to, String reason) {
  if (from == to) return 'Escolha uma marcação diferente da atual.';
  if (reason.trim().length < 3) return 'Explique o motivo da correção.';
  return null;
}

/// Linha de auditoria do salvar/finalizar (mesmo texto do portal).
String attendanceAuditDetail(
  CenterCoachSession s,
  RollCallCounts c, {
  required bool finalize,
}) {
  final d = s.date.split('-');
  final dm = d.length == 3 ? '${d[2]}/${d[1]}' : s.date;
  return '${s.className} · $dm ${s.startTime}: chamada '
      '${finalize ? 'finalizada' : 'salva'} '
      '(${c.present} P · ${c.excused} J · ${c.absent} F)';
}

/// Os 7 dias a partir de [fromKey].
List<String> coachWeekKeys(String fromKey) {
  final d = DateTime.tryParse(fromKey);
  if (d == null) return const [];
  return [
    for (var i = 0; i < 7; i++)
      _dateKey(DateTime.utc(d.year, d.month, d.day + i)),
  ];
}

/// [dateKey] ± [days].
String coachShiftDay(String dateKey, int days) {
  final d = DateTime.tryParse(dateKey);
  if (d == null) return dateKey;
  return _dateKey(DateTime.utc(d.year, d.month, d.day + days));
}

/// Presença sobre as aulas finalizadas (P8); `null` sem aula finalizada.
int? classPresencePercent(Iterable<CenterCoachSession> sessions) {
  var present = 0, marked = 0;
  for (final s in sessions) {
    if (!s.isDone) continue;
    for (final m in s.attendance.values) {
      marked++;
      if (m == CenterMark.present) present++;
    }
  }
  return marked == 0 ? null : (present * 100 / marked).round();
}

/// Quem perde a aula cancelada (e ganha reposição, se a regra for
/// automática): matriculados da turma que estão treinando + encaixados.
/// Mesma regra do portal (`classes.actions.ts › cancelSession`).
List<String> cancelAffectedStudents(
  CenterCoachSession s,
  List<CenterCoachEnrollment> enrollments,
) => {
  for (final e in enrollments)
    if (e.classId == s.classId && e.attends) e.studentId,
  ...s.makeupStudentIds,
}.toList();

/// Motivos rápidos do cancelamento (aparecem para os alunos).
const List<String> kCancelReasons = [
  'Chuva',
  'Professor indisponível',
  'Quadra em manutenção',
  'Evento no centro',
];

/// Uma pendência do dia (G1/G3).
class CenterTodayPending {
  const CenterTodayPending(
    this.kind,
    this.title,
    this.subtitle, {
    this.sessionId,
  });

  /// `attendance`, `waitlist`, `overdue`, `cancelled`.
  final String kind;
  final String title;
  final String subtitle;
  final String? sessionId;
}

/// Números e pendências do dia do centro (G1).
class CenterTodaySummary {
  const CenterTodaySummary({
    required this.activeStudents,
    required this.occupancyPercent,
    required this.presencePercent,
    required this.pending,
    this.receivedMonthCents,
    this.overdueCents,
    this.openCents,
  });

  final int activeStudents;
  final int? occupancyPercent;
  final int? presencePercent;
  final List<CenterTodayPending> pending;

  /// Só com financeiro (`view_finance`).
  final int? receivedMonthCents;
  final int? overdueCents;
  final int? openCents;
}

CenterTodaySummary centerTodaySummary({
  required String todayKey,
  required String nowHm,
  required List<CenterCoachSession> sessions,
  required List<CenterCoachClass> classes,
  required List<CenterCoachEnrollment> enrollments,
  required int activeStudents,
  List<CenterCoachInvoice>? invoices,
}) {
  final pending = <CenterTodayPending>[];
  // Chamada não fechada de aula que já acabou (hoje ou nos últimos dias).
  for (final s in sessions) {
    if (s.isCancelled || s.isDone) continue;
    final ended =
        s.date.compareTo(todayKey) < 0 ||
        (s.date == todayKey &&
            s.endTime.isNotEmpty &&
            s.endTime.compareTo(nowHm) <= 0);
    if (!ended) continue;
    pending.add(
      CenterTodayPending(
        'attendance',
        'Chamada não finalizada',
        '${s.className} · ${s.date == todayKey ? 'hoje' : _dm(s.date)} ${s.startTime}'
            '${s.coachName.isEmpty ? '' : ' · ${s.coachName}'}',
        sessionId: s.id,
      ),
    );
  }
  final waitlisted = enrollments.where((e) => e.status == 'waitlisted').length;
  if (waitlisted > 0) {
    pending.add(
      CenterTodayPending(
        'waitlist',
        waitlisted == 1
            ? '1 na lista de espera'
            : '$waitlisted na lista de espera',
        'Ofereça a vaga quando abrir',
      ),
    );
  }
  int? overdueCents, openCents, received;
  if (invoices != null) {
    var overdue = 0, overdueN = 0, open = 0, got = 0;
    final month = todayKey.substring(0, 7);
    for (final i in invoices) {
      if (i.status == 'pending') {
        open += i.amountCents;
        if (i.dueDate.isNotEmpty && i.dueDate.compareTo(todayKey) < 0) {
          overdue += i.amountCents;
          overdueN++;
        }
      } else if (i.status == 'approved' &&
          i.approvedAt != null &&
          _dateKeyOf(i.approvedAt!).startsWith(month)) {
        got += i.amountCents;
      }
    }
    overdueCents = overdue;
    openCents = open;
    received = got;
    if (overdueN > 0) {
      pending.add(
        CenterTodayPending(
          'overdue',
          overdueN == 1 ? '1 cobrança vencida' : '$overdueN cobranças vencidas',
          'Em aberto há mais tempo · confira no Financeiro',
        ),
      );
    }
  }
  for (final s in sessions) {
    if (s.date == todayKey && s.isCancelled) {
      pending.add(
        CenterTodayPending(
          'cancelled',
          'Aula cancelada · ${s.startTime}',
          '${s.className}${s.changeReason.isEmpty ? '' : ' · ${s.changeReason}'}',
          sessionId: s.id,
        ),
      );
    }
  }
  final active = classes.where((c) => c.status == 'active' && c.capacity > 0);
  final cap = active.fold<int>(0, (a, c) => a + c.capacity);
  final taken = active.fold<int>(0, (a, c) => a + c.seatsTaken);
  return CenterTodaySummary(
    activeStudents: activeStudents,
    occupancyPercent: cap == 0 ? null : (taken * 100 / cap).round(),
    presencePercent: classPresencePercent([
      for (final s in sessions)
        if (s.date.compareTo(todayKey) <= 0) s,
    ]),
    pending: pending,
    receivedMonthCents: received,
    overdueCents: overdueCents,
    openCents: openCents,
  );
}

String _dm(String dateKey) {
  final d = dateKey.split('-');
  return d.length == 3 ? '${d[2]}/${d[1]}' : dateKey;
}

String _dateKeyOf(DateTime at) {
  // Parede de São Paulo (UTC−3, sem horário de verão).
  final l = at.toUtc().subtract(const Duration(hours: 3));
  return _dateKey(DateTime.utc(l.year, l.month, l.day));
}

// ── auxiliares ───────────────────────────────────────────────────────────

String _two(int v) => v.toString().padLeft(2, '0');

String _dateKey(DateTime d) => '${d.year}-${_two(d.month)}-${_two(d.day)}';

String _str(Object? v, [String fallback = '']) =>
    v is String && v.trim().isNotEmpty ? v.trim() : fallback;

int? _int(Object? v) => v is num ? v.toInt() : null;

List<String> _strings(Object? v) => v is List
    ? [
        for (final x in v)
          if (x is String && x.isNotEmpty) x,
      ]
    : const [];

Map<String, Object?> _map(Map<dynamic, dynamic> m) =>
    m.map((k, v) => MapEntry('$k', v));

/// Data já convertida pelo repositório (`Timestamp` → `DateTime`).
DateTime? _date(Object? v) => v is DateTime ? v : null;
