import 'package:cloud_firestore/cloud_firestore.dart';

import 'arena_class_parse.dart';

// Aulas — fase 2: planos, regras, matrícula, mensalidades e créditos de
// reposição. Espelha `functions/src/arena-class-billing.ts` e
// `arena-class-ledger.ts`. Cobrança manual: o sistema gera as mensalidades e o
// gestor registra o pagamento recebido direto — nada passa pela plataforma.
// O app só lê; toda escrita é por callable.

/// Tipo do plano. Espelha `PLAN_KINDS`.
enum ArenaClassPlanKind { monthly, package, single }

extension ArenaClassPlanKindX on ArenaClassPlanKind {
  String get id => name;

  static ArenaClassPlanKind fromId(Object? raw) => switch (raw) {
        'monthly' => ArenaClassPlanKind.monthly,
        'package' => ArenaClassPlanKind.package,
        _ => ArenaClassPlanKind.single,
      };
}

/// Forma de pagamento registrada (o dinheiro não passa pela plataforma).
/// Espelha `PAYMENT_METHODS`.
enum ArenaClassPaymentMethod { pix, cash, cardMachine, transfer }

extension ArenaClassPaymentMethodX on ArenaClassPaymentMethod {
  String get id => switch (this) {
        ArenaClassPaymentMethod.pix => 'pix',
        ArenaClassPaymentMethod.cash => 'cash',
        ArenaClassPaymentMethod.cardMachine => 'card_machine',
        ArenaClassPaymentMethod.transfer => 'transfer',
      };

  String get label => switch (this) {
        ArenaClassPaymentMethod.pix => 'PIX',
        ArenaClassPaymentMethod.cash => 'Dinheiro',
        ArenaClassPaymentMethod.cardMachine => 'Maquininha',
        ArenaClassPaymentMethod.transfer => 'Transferência',
      };

  /// Valor desconhecido cai em PIX — mesmo default do backend.
  static ArenaClassPaymentMethod fromId(Object? raw) {
    for (final m in ArenaClassPaymentMethod.values) {
      if (m.id == raw) return m;
    }
    return ArenaClassPaymentMethod.pix;
  }
}

/// Plano em `arenas/{arenaId}/classPlans/{planId}`. A matrícula guarda uma
/// cópia (`plan`) — mudar o valor do plano vale só para as novas.
class ArenaClassPlan {
  const ArenaClassPlan({
    required this.id,
    required this.name,
    required this.kind,
    required this.priceReais,
    this.classesPerWeek,
    this.makeupsPerMonth,
    this.credits,
    this.validityDays,
    this.description,
    this.status = 'active',
  });

  final String id;
  final String name;
  final ArenaClassPlanKind kind;
  final double priceReais;

  /// Mensal: aulas por semana (= horários fixos da matrícula).
  final int? classesPerWeek;

  /// Mensal: créditos de reposição por mês (falta justificada).
  final int? makeupsPerMonth;

  /// Pacote: aulas compradas.
  final int? credits;

  /// Pacote: validade em dias a partir da matrícula.
  final int? validityDays;
  final String? description;

  /// `active` | `archived`.
  final String status;

  bool get isActive => status != 'archived';

  /// Só mensal e pacote viram matrícula; avulsa é catálogo.
  bool get isEnrollable => isActive && kind != ArenaClassPlanKind.single;

  factory ArenaClassPlan.fromFirestore(
    DocumentSnapshot<Map<String, dynamic>> doc,
  ) =>
      ArenaClassPlan.fromMap(doc.id, doc.data() ?? const {});

  factory ArenaClassPlan.fromMap(String id, Map<String, dynamic> data) {
    return ArenaClassPlan(
      id: id,
      name: parseString(data['name'], 'Plano'),
      kind: ArenaClassPlanKindX.fromId(data['kind']),
      priceReais: parseDouble(data['priceReais'], 0),
      classesPerWeek: parseIntOrNull(data['classesPerWeek']),
      makeupsPerMonth: parseIntOrNull(data['makeupsPerMonth']),
      credits: parseIntOrNull(data['credits']),
      validityDays: parseIntOrNull(data['validityDays']),
      description: parseStringOrNull(data['description']),
      status: parseString(data['status'], 'active'),
    );
  }
}

/// Regras da arena em `arenas/{arenaId}/classSettings/rules`. Espelha
/// `DEFAULT_CLASS_RULES` / `parseClassRules`.
class ArenaClassRules {
  const ArenaClassRules({
    this.makeupValidityDays = 30,
    this.excusedGeneratesCredit = true,
    this.arenaCancelGeneratesCredit = true,
    this.defaultDueDay = 5,
    this.enrollmentFeeReais = 0,
  });

  static const ArenaClassRules defaults = ArenaClassRules();

  final int makeupValidityDays;
  final bool excusedGeneratesCredit;
  final bool arenaCancelGeneratesCredit;

  /// Dia de vencimento sugerido na matrícula (1–28).
  final int defaultDueDay;

  /// Taxa de matrícula (0 = sem taxa).
  final double enrollmentFeeReais;

  factory ArenaClassRules.fromMap(Map<String, dynamic>? data) {
    final d = data ?? const <String, dynamic>{};
    int intIn(Object? v, int fallback, int min, int max) =>
        v is num && v == v.toInt() && v >= min && v <= max
            ? v.toInt()
            : fallback;
    bool boolOr(Object? v, bool fallback) => v is bool ? v : fallback;
    final fee = d['enrollmentFeeReais'];
    return ArenaClassRules(
      makeupValidityDays: intIn(d['makeupValidityDays'], 30, 1, 365),
      excusedGeneratesCredit: boolOr(d['excusedGeneratesCredit'], true),
      arenaCancelGeneratesCredit: boolOr(d['arenaCancelGeneratesCredit'], true),
      defaultDueDay: intIn(d['defaultDueDay'], 5, 1, 28),
      enrollmentFeeReais: fee is num && fee >= 0 ? fee.toDouble() : 0,
    );
  }
}

/// Horário fixo da matrícula: turma × dia da semana.
class ArenaClassEnrollmentSlot {
  const ArenaClassEnrollmentSlot({
    required this.classId,
    required this.weekday,
    this.className = '',
    this.startTime = '',
    this.teacherId = '',
  });

  final String classId;

  /// ISO 1=seg … 7=dom.
  final int weekday;
  final String className;
  final String startTime;
  final String teacherId;

  Map<String, Object> toPayload() => {'classId': classId, 'weekday': weekday};

  static List<ArenaClassEnrollmentSlot> parseList(Object? raw) {
    if (raw is! List) return const [];
    return [
      for (final s in raw)
        if (s is Map && s['classId'] is String && s['weekday'] is num)
          ArenaClassEnrollmentSlot(
            classId: s['classId'] as String,
            weekday: (s['weekday'] as num).toInt(),
            className: parseString(s['className'], 'Turma'),
            startTime: parseHm(s['startTime']),
            teacherId: parseString(s['teacherId'], ''),
          ),
    ];
  }

  @override
  bool operator ==(Object other) =>
      other is ArenaClassEnrollmentSlot &&
      other.classId == classId &&
      other.weekday == weekday;

  @override
  int get hashCode => Object.hash(classId, weekday);
}

/// Matrícula em `arenaClassEnrollments/{id}` — aluno + plano + horários.
class ArenaClassEnrollment {
  const ArenaClassEnrollment({
    required this.id,
    required this.arenaId,
    required this.studentId,
    this.athleteId,
    required this.name,
    this.phone,
    this.photoUrl,
    required this.plan,
    required this.slots,
    required this.status,
    required this.dueDay,
    required this.paymentMethod,
    required this.startDate,
    this.creditsLeft,
    this.expiresOn,
    this.createdAt,
  });

  final String id;
  final String arenaId;

  /// = id do doc em `classStudents` (uid do atleta ou id gerado).
  final String studentId;
  final String? athleteId;
  final String name;
  final String? phone;
  final String? photoUrl;

  /// Cópia do plano na época da matrícula.
  final ArenaClassPlan plan;
  final List<ArenaClassEnrollmentSlot> slots;

  /// `active` | `paused` | `canceled` | `ended` (pacote acabou/venceu).
  final String status;
  final int dueDay;
  final ArenaClassPaymentMethod paymentMethod;

  /// `YYYY-MM-DD`.
  final String startDate;

  /// Pacote: aulas que ainda restam.
  final int? creditsLeft;

  /// Pacote: `YYYY-MM-DD` em que o pacote vence.
  final String? expiresOn;
  final DateTime? createdAt;

  bool get isActive => status == 'active';
  bool get isPaused => status == 'paused';

  /// Ativa ou pausada — ainda dá para mexer.
  bool get isCurrent => isActive || isPaused;

  factory ArenaClassEnrollment.fromFirestore(
    DocumentSnapshot<Map<String, dynamic>> doc,
  ) =>
      ArenaClassEnrollment.fromMap(doc.id, doc.data() ?? const {});

  factory ArenaClassEnrollment.fromMap(String id, Map<String, dynamic> data) {
    final rawPlan = data['plan'];
    final planMap = rawPlan is Map
        ? Map<String, dynamic>.from(rawPlan)
        : const <String, dynamic>{};
    return ArenaClassEnrollment(
      id: id,
      arenaId: parseString(data['arenaId'], ''),
      studentId: parseString(data['studentId'], ''),
      athleteId: parseStringOrNull(data['athleteId']),
      name: parseString(data['name'], 'Aluno'),
      phone: parseStringOrNull(data['phone']),
      photoUrl: parseStringOrNull(data['photoUrl']),
      plan: ArenaClassPlan.fromMap(
        parseString(planMap['planId'], ''),
        planMap,
      ),
      slots: ArenaClassEnrollmentSlot.parseList(data['slots']),
      status: parseString(data['status'], 'active'),
      dueDay: parseInt(data['dueDay'], 5),
      paymentMethod: ArenaClassPaymentMethodX.fromId(data['paymentMethod']),
      startDate: parseString(data['startDate'], ''),
      creditsLeft: parseIntOrNull(data['creditsLeft']),
      expiresOn: parseStringOrNull(data['expiresOn']),
      createdAt: parseTimestamp(data['createdAt']),
    );
  }
}

/// Mensalidade/cobrança em `arenaClassCharges/{id}`.
class ArenaClassCharge {
  const ArenaClassCharge({
    required this.id,
    required this.arenaId,
    required this.enrollmentId,
    required this.studentId,
    this.athleteId,
    required this.name,
    this.phone,
    required this.description,
    this.period,
    required this.amountReais,
    required this.dueDate,
    required this.status,
    this.paidOn,
    required this.paymentMethod,
  });

  final String id;
  final String arenaId;
  final String enrollmentId;
  final String studentId;
  final String? athleteId;
  final String name;
  final String? phone;

  /// "Mensal 2x/semana · nov/2026", "Taxa de matrícula"…
  final String description;

  /// `AAAA-MM` da mensal; `null` em pacote/taxa.
  final String? period;
  final double amountReais;

  /// `YYYY-MM-DD`.
  final String dueDate;

  /// `open` | `paid` | `canceled`.
  final String status;

  /// `YYYY-MM-DD` em que o gestor registrou o recebimento.
  final String? paidOn;
  final ArenaClassPaymentMethod paymentMethod;

  bool get isOpen => status == 'open';
  bool get isPaid => status == 'paid';

  factory ArenaClassCharge.fromFirestore(
    DocumentSnapshot<Map<String, dynamic>> doc,
  ) =>
      ArenaClassCharge.fromMap(doc.id, doc.data() ?? const {});

  factory ArenaClassCharge.fromMap(String id, Map<String, dynamic> data) {
    return ArenaClassCharge(
      id: id,
      arenaId: parseString(data['arenaId'], ''),
      enrollmentId: parseString(data['enrollmentId'], ''),
      studentId: parseString(data['studentId'], ''),
      athleteId: parseStringOrNull(data['athleteId']),
      name: parseString(data['name'], 'Aluno'),
      phone: parseStringOrNull(data['phone']),
      description: parseString(data['description'], 'Mensalidade'),
      period: parseStringOrNull(data['period']),
      amountReais: parseDouble(data['amountReais'], 0),
      dueDate: parseString(data['dueDate'], ''),
      status: parseString(data['status'], 'open'),
      paidOn: parseStringOrNull(data['paidOn']),
      paymentMethod: ArenaClassPaymentMethodX.fromId(data['paymentMethod']),
    );
  }
}

/// Por que o crédito de reposição nasceu.
enum ArenaClassCreditReason { excused, arenaCanceled }

/// Crédito de reposição em `arenaClassCredits/{aula}_{aluno}`.
class ArenaClassCredit {
  const ArenaClassCredit({
    required this.id,
    required this.arenaId,
    required this.studentId,
    this.athleteId,
    required this.name,
    this.enrollmentId,
    required this.classId,
    required this.reason,
    required this.sourceSessionId,
    required this.sourceDate,
    required this.status,
    required this.expiresOn,
    this.usedSessionId,
  });

  final String id;
  final String arenaId;
  final String studentId;
  final String? athleteId;
  final String name;
  final String? enrollmentId;

  /// Turma da aula perdida.
  final String classId;
  final ArenaClassCreditReason reason;
  final String sourceSessionId;

  /// `YYYY-MM-DD` da aula perdida.
  final String sourceDate;

  /// `available` | `used` | `expired`.
  final String status;

  /// `YYYY-MM-DD` — último dia em que dá para repor.
  final String expiresOn;
  final String? usedSessionId;

  bool get isAvailable => status == 'available';

  factory ArenaClassCredit.fromFirestore(
    DocumentSnapshot<Map<String, dynamic>> doc,
  ) =>
      ArenaClassCredit.fromMap(doc.id, doc.data() ?? const {});

  factory ArenaClassCredit.fromMap(String id, Map<String, dynamic> data) {
    return ArenaClassCredit(
      id: id,
      arenaId: parseString(data['arenaId'], ''),
      studentId: parseString(data['studentId'], ''),
      athleteId: parseStringOrNull(data['athleteId']),
      name: parseString(data['name'], 'Aluno'),
      enrollmentId: parseStringOrNull(data['enrollmentId']),
      classId: parseString(data['classId'], ''),
      reason: data['reason'] == 'arena_canceled'
          ? ArenaClassCreditReason.arenaCanceled
          : ArenaClassCreditReason.excused,
      sourceSessionId: parseString(data['sourceSessionId'], ''),
      sourceDate: parseString(data['sourceDate'], ''),
      status: parseString(data['status'], 'available'),
      expiresOn: parseString(data['expiresOn'], ''),
      usedSessionId: parseStringOrNull(data['usedSessionId']),
    );
  }
}
