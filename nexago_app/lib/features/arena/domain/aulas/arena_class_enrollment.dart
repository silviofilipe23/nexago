import 'package:cloud_firestore/cloud_firestore.dart';

import 'arena_class_parse.dart';

// Aulas — fase 2: planos, regras, matrícula, mensalidades e créditos de
// reposição. Espelha `functions/src/arena-class-billing.ts` e
// `arena-class-ledger.ts`. Cobrança manual: o sistema gera as mensalidades e o
// gestor registra o pagamento recebido direto — nada passa pela plataforma.
// Cobrança online (regra `onlineBillingEnabled`): cada mensalidade vira uma
// fatura Asaas (PIX ou cartão) e a mensalidade guarda o espelho `asaas`.
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

/// Como a mensalidade é cobrada. Espelha `ClassBillingMode`. Fica fora de
/// `paymentMethod` de propósito: build antigo leria valor desconhecido como
/// PIX.
enum ArenaClassBillingMode { manual, asaas }

extension ArenaClassBillingModeX on ArenaClassBillingMode {
  String get id => name;

  /// Ausente/desconhecido = manual (doc anterior à cobrança online).
  static ArenaClassBillingMode fromId(Object? raw) => raw == 'asaas'
      ? ArenaClassBillingMode.asaas
      : ArenaClassBillingMode.manual;
}

/// Situação da fatura online. Espelha `ClassAsaasState` (`void` vira
/// [voided] — palavra reservada em Dart).
enum ArenaClassAsaasState {
  pending,
  creating,
  open,
  paid,
  voiding,
  voided,
  failed,
  needsCpf,
}

extension ArenaClassAsaasStateX on ArenaClassAsaasState {
  /// Desconhecido cai em `pending` — mesmo default do portal.
  static ArenaClassAsaasState fromId(Object? raw) => switch (raw) {
        'creating' => ArenaClassAsaasState.creating,
        'open' => ArenaClassAsaasState.open,
        'paid' => ArenaClassAsaasState.paid,
        'voiding' => ArenaClassAsaasState.voiding,
        'void' => ArenaClassAsaasState.voided,
        'failed' => ArenaClassAsaasState.failed,
        'needs_cpf' => ArenaClassAsaasState.needsCpf,
        _ => ArenaClassAsaasState.pending,
      };

  /// Ainda existe (ou vai existir) um pagamento vivo no Asaas. Espelha
  /// `LIVE_ASAAS_STATES`.
  bool get isLive => switch (this) {
        ArenaClassAsaasState.pending ||
        ArenaClassAsaasState.creating ||
        ArenaClassAsaasState.open ||
        ArenaClassAsaasState.failed =>
          true,
        _ => false,
      };
}

/// Espelho da fatura online na mensalidade (`asaas`). O grupo de pagamento
/// (`arenaClassAsaasPayments`) é só do servidor.
class ArenaClassChargeAsaas {
  const ArenaClassChargeAsaas({
    required this.groupId,
    required this.state,
    this.invoiceUrl,
    this.status,
  });

  final String groupId;
  final ArenaClassAsaasState state;

  /// Fatura hospedada (o aluno escolhe PIX ou cartão).
  final String? invoiceUrl;

  /// Status cru do Asaas (`PENDING`, `OVERDUE`, `RECEIVED`…).
  final String? status;

  /// `null` sem mapa ou sem `groupId` (mensalidade manual).
  static ArenaClassChargeAsaas? fromMap(Object? raw) {
    if (raw is! Map) return null;
    final groupId = parseStringOrNull(raw['groupId']);
    if (groupId == null) return null;
    return ArenaClassChargeAsaas(
      groupId: groupId,
      state: ArenaClassAsaasStateX.fromId(raw['state']),
      invoiceUrl: parseStringOrNull(raw['invoiceUrl']),
      status: parseStringOrNull(raw['status']),
    );
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
    this.onlineBillingEnabled = false,
  });

  static const ArenaClassRules defaults = ArenaClassRules();

  final int makeupValidityDays;
  final bool excusedGeneratesCredit;
  final bool arenaCancelGeneratesCredit;

  /// Dia de vencimento sugerido na matrícula (1–28).
  final int defaultDueDay;

  /// Taxa de matrícula (0 = sem taxa).
  final double enrollmentFeeReais;

  /// Mensalidade cobrada online pelo Asaas (PIX ou cartão na fatura).
  /// Desligada por padrão; o app só lê (a tela de Regras é do portal).
  final bool onlineBillingEnabled;

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
      onlineBillingEnabled: d['onlineBillingEnabled'] == true,
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
    this.billingMode = ArenaClassBillingMode.manual,
    this.cpfMasked,
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
  final ArenaClassBillingMode billingMode;

  /// CPF do pagador mascarado (`***.456.789-**`), só na cobrança online.
  final String? cpfMasked;

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
      billingMode: ArenaClassBillingModeX.fromId(data['billingMode']),
      cpfMasked: parseStringOrNull(data['cpfMasked']),
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
    this.billingMode = ArenaClassBillingMode.manual,
    this.asaas,
    this.paidVia,
    this.onlineBillingType,
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

  /// `YYYY-MM-DD` em que o gestor registrou o recebimento (ou o Asaas
  /// confirmou).
  final String? paidOn;
  final ArenaClassPaymentMethod paymentMethod;
  final ArenaClassBillingMode billingMode;

  /// Espelho da fatura online (`null` na cobrança manual).
  final ArenaClassChargeAsaas? asaas;

  /// `asaas` = pago pela fatura online; `manual` = baixa do gestor.
  final String? paidVia;

  /// `PIX` | `CREDIT_CARD` — como o aluno pagou a fatura online.
  final String? onlineBillingType;

  bool get isOpen => status == 'open';
  bool get isPaid => status == 'paid';
  bool get isOnline => billingMode == ArenaClassBillingMode.asaas;
  bool get isPaidOnline => isPaid && paidVia == 'asaas';

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
      billingMode: ArenaClassBillingModeX.fromId(data['billingMode']),
      asaas: ArenaClassChargeAsaas.fromMap(data['asaas']),
      paidVia: switch (data['paidVia']) {
        'asaas' => 'asaas',
        'manual' => 'manual',
        _ => null,
      },
      onlineBillingType: switch (data['onlineBillingType']) {
        'PIX' => 'PIX',
        'CREDIT_CARD' => 'CREDIT_CARD',
        _ => null,
      },
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
