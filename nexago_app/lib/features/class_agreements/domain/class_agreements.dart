/// Contratos de aulas da arena (canvas "Contratos de aulas"): o atleta
/// contrata um plano de aulas pelo app escolhendo professor e dias e assina o
/// contrato; o professor assina o contrato que a arena enviou. Os dados vêm
/// das callables de `functions/src/arena-agreements.ts`.
library;

import '../../schedule_plans/domain/schedule_plan_models.dart' show spMap;

List<Map<String, dynamic>> _maps(Object? raw) => raw is List
    ? raw.map(spMap).toList(growable: false)
    : const <Map<String, dynamic>>[];

String _s(Object? v) => v is String ? v.trim() : '';
String? _sn(Object? v) {
  final s = _s(v);
  return s.isEmpty ? null : s;
}

int? _i(Object? v) => v is num ? v.toInt() : null;
double _d(Object? v) => v is num ? v.toDouble() : 0;

DateTime? _dt(Object? v) => v is String ? DateTime.tryParse(v) : null;

// ── opções de contratação ───────────────────────────────────────────────

/// Ciclo do plano mensal, no modelo dos Planos de horário: desconto sobre o
/// mensal; trimestral e semestral têm fidelidade e são pagos mês a mês; anual
/// é à vista.
class ClassPlanCycleOption {
  const ClassPlanCycleOption({
    required this.cycle,
    required this.months,
    required this.monthlyPriceReais,
    required this.totalReais,
    this.prepaidMonths = 1,
    this.discountPercent = 0,
  });

  factory ClassPlanCycleOption.fromMap(Map<String, dynamic> m) =>
      ClassPlanCycleOption(
        cycle: _s(m['cycle']).isEmpty ? 'monthly' : _s(m['cycle']),
        months: _i(m['months']) ?? 1,
        monthlyPriceReais: _d(m['monthlyPriceReais']),
        totalReais: _d(m['totalReais']),
        prepaidMonths: _i(m['prepaidMonths']) ?? 1,
        discountPercent: _i(m['discountPercent']) ?? 0,
      );

  /// `monthly`, `quarterly`, `semiannual` ou `annual`.
  final String cycle;

  /// Fidelidade em meses (1 no mensal).
  final int months;
  final double monthlyPriceReais;

  /// O que sai de uma vez em cada cobrança cheia (anual: 12 meses).
  final double totalReais;

  /// Meses pagos de uma vez: 12 no anual, 1 nos outros.
  final int prepaidMonths;

  /// Desconto sobre o mensal (%), definido pela arena.
  final int discountPercent;

  bool get isPrepaid => prepaidMonths > 1;
}

/// Cobrança do plano: formas aceitas agora e vencimento (fixo ou à escolha).
class ClassPlanBilling {
  const ClassPlanBilling({
    this.methods = const ['onsite'],
    this.dueDayOptions = const [],
    this.dueDay = 5,
  });

  factory ClassPlanBilling.fromMap(Map<String, dynamic> m) {
    final methods = (m['methods'] is List)
        ? (m['methods'] as List).map(_s).where((s) => s.isNotEmpty).toList()
        : const <String>[];
    return ClassPlanBilling(
      methods: methods.isEmpty ? const ['onsite'] : methods,
      dueDayOptions: (m['dueDayOptions'] is List)
          ? (m['dueDayOptions'] as List).whereType<num>().map((n) => n.toInt()).toList()
          : const [],
      dueDay: _i(m['dueDay']) ?? 5,
    );
  }

  /// `pix`, `card`, `onsite`.
  final List<String> methods;
  final List<int> dueDayOptions;
  final int dueDay;
}

/// "Pix", "Cartão", "Na arena".
String paymentFormLabel(String form) => switch (form) {
      'pix' => 'Pix',
      'card' => 'Cartão',
      _ => 'Na arena',
    };

String paymentFormSub(String form) => form == 'onsite' ? 'na recepção' : 'pelo app';

/// Linha de apoio do ciclo: "sem fidelidade" / "3 meses de fidelidade" /
/// "à vista · 12 meses".
String cycleSub(ClassPlanCycleOption o) {
  if (o.isPrepaid) return 'à vista · ${o.prepaidMonths} meses';
  if (o.months <= 1) return 'sem fidelidade';
  return '${o.months} meses de fidelidade';
}

/// "Mensal", "Trimestral", "Semestral", "Anual".
String cycleLabel(String cycle) => switch (cycle) {
      'quarterly' => 'Trimestral',
      'semiannual' => 'Semestral',
      'annual' => 'Anual',
      _ => 'Mensal',
    };

/// "/trimestre" etc. para o total do ciclo.
String cyclePeriodSuffix(String cycle) => switch (cycle) {
      'quarterly' => 'por trimestre',
      'semiannual' => 'por semestre',
      'annual' => 'por ano',
      _ => 'por mês',
    };

/// Desconto do ciclo sobre o mensal, em % inteiro (0 sem desconto).
int cycleDiscountPercent(ClassSignupPlan plan, ClassPlanCycleOption option) {
  if (option.discountPercent > 0) return option.discountPercent;
  if (plan.priceReais <= 0 || option.monthlyPriceReais >= plan.priceReais) {
    return 0;
  }
  return ((1 - option.monthlyPriceReais / plan.priceReais) * 100).round();
}

/// O ciclo escolhido, ou o mensal (padrão) se o plano não tem o pedido.
ClassPlanCycleOption? cycleOptionOf(ClassSignupPlan plan, String? cycle) {
  if (plan.cycles.isEmpty) return null;
  for (final c in plan.cycles) {
    if (c.cycle == cycle) return c;
  }
  return plan.cycles.first;
}

class ClassSignupPlan {
  const ClassSignupPlan({
    required this.planId,
    required this.name,
    required this.kind,
    required this.priceReais,
    this.classesPerWeek,
    this.makeupsPerMonth,
    this.credits,
    this.validityDays,
    this.description,
    this.teacherIds = const [],
    this.anyTeacher = false,
    this.mine = false,
    this.cycles = const [],
    this.billing = const ClassPlanBilling(),
  });

  factory ClassSignupPlan.fromMap(Map<String, dynamic> m) => ClassSignupPlan(
        planId: _s(m['planId']),
        name: _s(m['name']),
        kind: _s(m['kind']),
        priceReais: _d(m['priceReais']),
        classesPerWeek: _i(m['classesPerWeek']),
        makeupsPerMonth: _i(m['makeupsPerMonth']),
        credits: _i(m['credits']),
        validityDays: _i(m['validityDays']),
        description: _sn(m['description']),
        teacherIds: (m['teacherIds'] is List)
            ? (m['teacherIds'] as List).map(_s).where((s) => s.isNotEmpty).toList()
            : const [],
        anyTeacher: m['anyTeacher'] == true,
        mine: m['mine'] == true,
        cycles: _maps(m['cycles']).map(ClassPlanCycleOption.fromMap).toList(),
        billing: m['billing'] is Map
            ? ClassPlanBilling.fromMap(spMap(m['billing']))
            : const ClassPlanBilling(methods: ['pix', 'card', 'onsite']),
      );

  final String planId;
  final String name;

  /// `monthly` ou `package`.
  final String kind;
  final double priceReais;
  final int? classesPerWeek;
  final int? makeupsPerMonth;
  final int? credits;
  final int? validityDays;
  final String? description;

  /// Professores com turma ativa neste plano.
  final List<String> teacherIds;

  /// A arena não marcou professores: vale qualquer turma.
  final bool anyTeacher;

  /// O atleta já tem matrícula ativa neste plano.
  final bool mine;

  /// Ciclos de pagamento (só mensal; vazio em pacote ou servidor antigo).
  final List<ClassPlanCycleOption> cycles;

  /// Cobrança do plano (formas e vencimento).
  final ClassPlanBilling billing;

  /// Tem ciclo além do mensal para escolher.
  bool get hasLongCycles => cycles.length > 1;

  /// Há alguma escolha de pagamento a fazer (ciclo, vencimento ou forma).
  bool get hasPaymentChoices =>
      hasLongCycles ||
      billing.dueDayOptions.isNotEmpty ||
      billing.methods.length > 1;

  bool get isMonthly => kind == 'monthly';
}

class ClassSignupTeacher {
  const ClassSignupTeacher({
    required this.teacherId,
    required this.name,
    this.photoUrl,
    this.specialty,
  });

  factory ClassSignupTeacher.fromMap(Map<String, dynamic> m) =>
      ClassSignupTeacher(
        teacherId: _s(m['teacherId']),
        name: _s(m['name']).isEmpty ? 'Professor' : _s(m['name']),
        photoUrl: _sn(m['photoUrl']),
        specialty: _sn(m['specialty']),
      );

  final String teacherId;
  final String name;
  final String? photoUrl;
  final String? specialty;
}

class ClassSignupDay {
  const ClassSignupDay({required this.weekday, required this.vacancies});

  final int weekday;
  final int vacancies;
}

class ClassSignupClass {
  const ClassSignupClass({
    required this.classId,
    required this.name,
    required this.teacherId,
    required this.startTime,
    this.endTime = '',
    this.level = '',
    this.sport = '',
    this.capacity = 0,
    this.days = const [],
    this.enrolled = false,
  });

  factory ClassSignupClass.fromMap(Map<String, dynamic> m) => ClassSignupClass(
        classId: _s(m['classId']),
        name: _s(m['name']),
        teacherId: _s(m['teacherId']),
        startTime: _s(m['startTime']),
        endTime: _s(m['endTime']),
        level: _s(m['level']),
        sport: _s(m['sport']),
        capacity: _i(m['capacity']) ?? 0,
        days: _maps(m['days'])
            .map((d) => ClassSignupDay(
                  weekday: _i(d['weekday']) ?? 0,
                  vacancies: _i(d['vacancies']) ?? 0,
                ))
            .where((d) => d.weekday >= 1 && d.weekday <= 7)
            .toList(),
        enrolled: m['enrolled'] == true,
      );

  final String classId;
  final String name;
  final String teacherId;
  final String startTime;
  final String endTime;
  final String level;
  final String sport;
  final int capacity;
  final List<ClassSignupDay> days;

  /// O atleta já está nesta turma por outro plano.
  final bool enrolled;
}

class ClassSignupOptions {
  const ClassSignupOptions({
    required this.arenaId,
    required this.arenaName,
    this.arenaLogoUrl,
    this.onlineBilling = false,
    this.enrollmentFeeReais = 0,
    this.dueDay = 5,
    this.hasCpf = true,
    this.plans = const [],
    this.teachers = const [],
    this.classes = const [],
    this.activePlanCount = 0,
    this.pendingPayment,
  });

  factory ClassSignupOptions.fromMap(Map<String, dynamic> m) {
    final arena = spMap(m['arena']);
    final pending = m['pendingEnrollment'] is Map ? spMap(m['pendingEnrollment']) : null;
    return ClassSignupOptions(
      arenaId: _s(arena['arenaId']),
      arenaName: _s(arena['name']).isEmpty ? 'Arena' : _s(arena['name']),
      arenaLogoUrl: _sn(arena['logoUrl']),
      onlineBilling: m['onlineBilling'] == true,
      enrollmentFeeReais: _d(m['enrollmentFeeReais']),
      dueDay: _i(m['dueDay']) ?? 5,
      hasCpf: m['hasCpf'] != false,
      plans: _maps(m['plans']).map(ClassSignupPlan.fromMap).toList(),
      teachers: _maps(m['teachers']).map(ClassSignupTeacher.fromMap).toList(),
      classes: _maps(m['classes']).map(ClassSignupClass.fromMap).toList(),
      activePlanCount: _i(m['activePlanCount']) ?? 0,
      pendingPayment: pending == null || _s(pending['enrollmentId']).isEmpty
          ? null
          : ClassPendingPayment(
              enrollmentId: _s(pending['enrollmentId']),
              until: _dt(pending['until']),
              paymentForm: _s(pending['paymentForm']) == 'card' ? 'card' : 'pix',
              planName: _s(pending['planName']),
            ),
    );
  }

  /// Plano contratado pelo app esperando o 1º pagamento (qualquer arena).
  final ClassPendingPayment? pendingPayment;

  final String arenaId;
  final String arenaName;
  final String? arenaLogoUrl;
  final bool onlineBilling;
  final double enrollmentFeeReais;
  final int dueDay;
  final bool hasCpf;
  final List<ClassSignupPlan> plans;
  final List<ClassSignupTeacher> teachers;
  final List<ClassSignupClass> classes;

  /// Planos de aula ativos do atleta nesta arena.
  final int activePlanCount;

  ClassSignupPlan? plan(String? id) {
    for (final p in plans) {
      if (p.planId == id) return p;
    }
    return null;
  }

  ClassSignupTeacher? teacher(String? id) {
    for (final t in teachers) {
      if (t.teacherId == id) return t;
    }
    return null;
  }

  ClassSignupClass? classById(String id) {
    for (final c in classes) {
      if (c.classId == id) return c;
    }
    return null;
  }
}

// ── escolha dos horários ────────────────────────────────────────────────

/// Um horário da semana: turma × dia.
class ClassSlotChoice {
  const ClassSlotChoice({required this.classId, required this.weekday});

  final String classId;
  final int weekday;

  String get key => '$classId:$weekday';

  Map<String, Object> toMap() => {'classId': classId, 'weekday': weekday};

  @override
  bool operator ==(Object other) =>
      other is ClassSlotChoice &&
      other.classId == classId &&
      other.weekday == weekday;

  @override
  int get hashCode => Object.hash(classId, weekday);
}

/// Linha da lista de horários: turma, dia, vagas.
class ClassSlotOption {
  const ClassSlotOption({
    required this.choice,
    required this.klass,
    required this.vacancies,
    required this.teacherName,
  });

  final ClassSlotChoice choice;
  final ClassSignupClass klass;
  final int vacancies;
  final String teacherName;

  bool get full => vacancies <= 0;
  bool get selectable => !full && !klass.enrolled;
}

/// Horários que o atleta precisa escolher: o "aulas por semana" do plano
/// mensal; pacote = 1 a 7 (`null`).
int? requiredSlotCount(ClassSignupPlan plan) =>
    plan.isMonthly ? ((plan.classesPerWeek ?? 1).clamp(1, 7)) : null;

/// Professores para o passo "Professor": os do plano, na ordem da arena.
List<ClassSignupTeacher> teachersForPlan(
  ClassSignupOptions options,
  ClassSignupPlan plan,
) =>
    options.teachers.where((t) => plan.teacherIds.contains(t.teacherId)).toList();

/// Com um professor só, o passo "Professor" é pulado.
bool skipTeacherStep(ClassSignupOptions options, ClassSignupPlan plan) =>
    teachersForPlan(options, plan).length <= 1;

/// Horários do plano: turmas dos professores do plano ([teacherId] `null` =
/// todos), por dia e hora.
List<ClassSlotOption> slotOptions(
  ClassSignupOptions options,
  ClassSignupPlan plan, {
  String? teacherId,
}) {
  final allowed = teacherId == null ? plan.teacherIds.toSet() : {teacherId};
  final out = <ClassSlotOption>[];
  for (final c in options.classes) {
    if (!allowed.contains(c.teacherId)) continue;
    final teacherName = options.teacher(c.teacherId)?.name ?? 'Professor';
    for (final d in c.days) {
      out.add(ClassSlotOption(
        choice: ClassSlotChoice(classId: c.classId, weekday: d.weekday),
        klass: c,
        vacancies: d.vacancies,
        teacherName: teacherName,
      ));
    }
  }
  out.sort((a, b) {
    final byDay = a.choice.weekday.compareTo(b.choice.weekday);
    return byDay != 0 ? byDay : a.klass.startTime.compareTo(b.klass.startTime);
  });
  return out;
}

/// Liga/desliga um horário. Cheio (o plano mensal pede N) não adiciona.
List<ClassSlotChoice> toggleSlot(
  List<ClassSlotChoice> picked,
  ClassSlotChoice slot,
  ClassSignupPlan plan,
) {
  if (picked.contains(slot)) {
    return picked.where((s) => s != slot).toList();
  }
  final max = requiredSlotCount(plan) ?? 7;
  if (picked.length >= max) return picked;
  return [...picked, slot];
}

bool slotsComplete(List<ClassSlotChoice> picked, ClassSignupPlan plan) {
  final n = requiredSlotCount(plan);
  return n == null ? picked.isNotEmpty : picked.length == n;
}

const _weekdayShort = ['SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB', 'DOM'];

/// 1 = segunda … 7 = domingo.
String weekdayShort(int weekday) =>
    weekday >= 1 && weekday <= 7 ? _weekdayShort[weekday - 1] : '?';

/// "2 aulas por semana" / "Pacote de 10 aulas · 60 dias".
String planRuleLine(ClassSignupPlan plan) {
  if (plan.isMonthly) {
    final n = plan.classesPerWeek ?? 1;
    return '$n aula${n == 1 ? '' : 's'} por semana';
  }
  return 'Pacote de ${plan.credits ?? 0} aulas · ${plan.validityDays ?? 0} dias';
}

String planPriceSuffix(ClassSignupPlan plan) =>
    plan.isMonthly ? 'por mês' : 'à vista';

/// "Escolha 2 aulas por semana" / "Escolha seus horários".
String slotsTitle(ClassSignupPlan plan) {
  final n = requiredSlotCount(plan);
  if (n == null) return 'Escolha seus horários';
  return 'Escolha $n aula${n == 1 ? '' : 's'} por semana';
}

String vacanciesLabel(ClassSlotOption o) {
  if (o.klass.enrolled) return 'você já está nesta turma';
  if (o.full) return 'lotada';
  return o.vacancies == 1 ? '1 vaga' : '${o.vacancies} vagas';
}

// ── prévia e resultado ──────────────────────────────────────────────────

typedef AgreementRow = ({String label, String value});

List<AgreementRow> _rows(Object? raw) => _maps(raw)
    .map((m) => (label: _s(m['label']), value: _s(m['value'])))
    .where((r) => r.label.isNotEmpty)
    .toList();

class ClassCharge {
  const ClassCharge({
    required this.description,
    required this.amountReais,
    required this.dueDate,
  });

  final String description;
  final double amountReais;

  /// `YYYY-MM-DD`.
  final String dueDate;
}

List<ClassCharge> _charges(Object? raw) => _maps(raw)
    .map((m) => ClassCharge(
          description: _s(m['description']),
          amountReais: _d(m['amountReais']),
          dueDate: _s(m['dueDate']),
        ))
    .toList();

class ClassEnrollmentPreview {
  const ClassEnrollmentPreview({
    required this.title,
    required this.body,
    required this.sha256,
    this.templateVersion = 0,
    this.essentials = const [],
    this.charges = const [],
    this.totalReais = 0,
    this.online = false,
    this.needsCpf = false,
    this.cycle = 'monthly',
    this.dueDay,
    this.paymentForm,
    this.commitmentEndsOn,
    this.startDate = '',
    this.endDate = '',
  });

  factory ClassEnrollmentPreview.fromMap(Map<String, dynamic> m) {
    final a = spMap(m['agreement']);
    return ClassEnrollmentPreview(
      title: _s(a['title']),
      body: _s(a['body']),
      sha256: _s(a['sha256']),
      templateVersion: _i(a['templateVersion']) ?? 0,
      essentials: _rows(a['essentials']),
      charges: _charges(m['charges']),
      totalReais: _d(m['totalReais']),
      online: m['online'] == true,
      needsCpf: m['needsCpf'] == true,
      cycle: _s(m['cycle']).isEmpty ? 'monthly' : _s(m['cycle']),
      dueDay: _i(m['dueDay']),
      paymentForm: _sn(m['paymentForm']),
      commitmentEndsOn: _sn(m['commitmentEndsOn']),
      startDate: _s(m['startDate']),
      endDate: _s(m['endDate']),
    );
  }

  final String title;
  final String body;
  final String sha256;
  final int templateVersion;
  final List<AgreementRow> essentials;
  final List<ClassCharge> charges;
  final double totalReais;

  /// A arena cobra online (Pix ou cartão pelo app).
  final bool online;

  /// Online sem CPF salvo: pedir antes de assinar.
  final bool needsCpf;

  /// Ciclo de pagamento da matrícula.
  final String cycle;
  final int? dueDay;

  /// `pix`, `card` ou `onsite`.
  final String? paymentForm;

  /// Fim da fidelidade, `YYYY-MM-DD`.
  final String? commitmentEndsOn;
  final String startDate;
  final String endDate;
}

/// Pagar ao assinar: a vaga fica segurada até [until].
class ClassPendingPayment {
  const ClassPendingPayment({
    required this.enrollmentId,
    this.until,
    this.amountReais = 0,
    this.paymentForm = 'pix',
    this.planName = '',
  });

  final String enrollmentId;
  final DateTime? until;
  final double amountReais;

  /// `pix` ou `card`.
  final String paymentForm;
  final String planName;
}

class ClassEnrollmentResult {
  const ClassEnrollmentResult({
    required this.enrollmentId,
    required this.agreementId,
    this.online = false,
    this.charges = const [],
    this.signedAt,
    this.pendingPayment,
  });

  factory ClassEnrollmentResult.fromMap(Map<String, dynamic> m) {
    final enrollmentId = _s(m['enrollmentId']);
    final p = m['pendingPayment'] is Map ? spMap(m['pendingPayment']) : null;
    return ClassEnrollmentResult(
      enrollmentId: enrollmentId,
      agreementId: _s(m['agreementId']),
      online: m['online'] == true,
      charges: _charges(m['charges']),
      signedAt: _dt(m['signedAt']),
      pendingPayment: p == null
          ? null
          : ClassPendingPayment(
              enrollmentId: enrollmentId,
              until: _dt(p['until']),
              amountReais: _d(p['amountReais']),
              paymentForm: _s(p['paymentForm']) == 'card' ? 'card' : 'pix',
            ),
    );
  }

  /// Pix/cartão pelo app: pagar agora para confirmar; `null` = já ativa.
  final ClassPendingPayment? pendingPayment;

  final String enrollmentId;
  final String agreementId;
  final bool online;
  final List<ClassCharge> charges;
  final DateTime? signedAt;
}

/// Tela de pagamento: `preparing` (fatura sendo criada), `ready`, `paid`,
/// `expired` (prazo acabou, vaga devolvida) ou `failed`.
class ClassEnrollmentPayment {
  const ClassEnrollmentPayment({
    required this.state,
    this.amountReais = 0,
    this.description = '',
    this.until,
    this.pixCode,
    this.pixImageBase64,
    this.invoiceUrl,
    this.planName = '',
  });

  factory ClassEnrollmentPayment.fromMap(Map<String, dynamic> m) {
    final pix = m['pix'] is Map ? spMap(m['pix']) : const <String, dynamic>{};
    return ClassEnrollmentPayment(
      state: _s(m['state']).isEmpty ? 'preparing' : _s(m['state']),
      amountReais: _d(m['amountReais']),
      description: _s(m['description']),
      until: _dt(m['pendingPaymentUntil']),
      pixCode: _sn(pix['qrCode']),
      pixImageBase64: _sn(pix['qrCodeBase64']),
      invoiceUrl: _sn(m['invoiceUrl']),
      planName: _s(m['planName']),
    );
  }

  final String state;
  final double amountReais;
  final String description;
  final DateTime? until;
  final String? pixCode;
  final String? pixImageBase64;
  final String? invoiceUrl;
  final String planName;

  bool get isPaid => state == 'paid';
  bool get isOver => state == 'expired' || state == 'failed';
}

/// "28:41" até o fim do prazo (zero quando passou).
String countdownLabel(DateTime? until, DateTime now) {
  if (until == null) return '';
  final left = until.difference(now);
  if (left.isNegative) return '00:00';
  final m = left.inMinutes;
  final s = left.inSeconds % 60;
  return '${m.toString().padLeft(2, '0')}:${s.toString().padLeft(2, '0')}';
}

// ── cancelamento ────────────────────────────────────────────────────────

const cancelReasons = <({String id, String label})>[
  (id: 'routine', label: 'Mudança de rotina ou horário'),
  (id: 'price', label: 'Valor do plano'),
  (id: 'health', label: 'Lesão ou saúde'),
  (id: 'moved', label: 'Mudei de cidade'),
  (id: 'other', label: 'Outro motivo'),
];

/// Como fica o cancelamento: última aula, fidelidade e multa (conta do servidor).
class ClassCancellationQuote {
  const ClassCancellationQuote({
    required this.kind,
    required this.endsOn,
    this.requestedOn = '',
    this.noticeDays = 0,
    this.commitmentEndsOn,
    this.remainingMonths = 0,
    this.monthlyPriceReais = 0,
    this.penaltyKind = 'none',
    this.penaltyPercent,
    this.penaltyReais = 0,
    this.penaltyDueDate,
    this.planName = '',
    this.penaltyChargeId,
    this.penaltyOnline = false,
  });

  factory ClassCancellationQuote.fromMap(Map<String, dynamic> m) {
    final p = m['penalty'] is Map ? spMap(m['penalty']) : const <String, dynamic>{};
    return ClassCancellationQuote(
      kind: _s(m['kind']).isEmpty ? 'monthly' : _s(m['kind']),
      endsOn: _s(m['endsOn']),
      requestedOn: _s(m['requestedOn']),
      noticeDays: _i(m['noticeDays']) ?? 0,
      commitmentEndsOn: _sn(m['commitmentEndsOn']),
      remainingMonths: _i(m['remainingMonths']) ?? 0,
      monthlyPriceReais: _d(m['monthlyPriceReais']),
      penaltyKind: _s(p['kind']).isEmpty ? 'none' : _s(p['kind']),
      penaltyPercent: _i(p['percent']),
      penaltyReais: _d(p['amountReais']),
      penaltyDueDate: _sn(m['penaltyDueDate']),
      planName: _s(m['planName']),
      penaltyChargeId: _sn(m['penaltyChargeId']),
      penaltyOnline: m['penaltyOnline'] == true,
    );
  }

  /// `monthly`, `commitment`, `prepaid` ou `package`.
  final String kind;
  final String endsOn;
  final String requestedOn;
  final int noticeDays;
  final String? commitmentEndsOn;
  final int remainingMonths;
  final double monthlyPriceReais;
  final String penaltyKind;
  final int? penaltyPercent;
  final double penaltyReais;
  final String? penaltyDueDate;
  final String planName;
  final String? penaltyChargeId;
  final bool penaltyOnline;

  bool get hasPenalty => penaltyReais > 0;
  bool get isPrepaid => kind == 'prepaid';

  /// "2 × R$ 234,00 × 50%" (a conta da multa) ou "valor fixo".
  String penaltyFormula(String Function(num) brl) {
    if (penaltyKind == 'fixed') return 'valor fixo do plano';
    return '$remainingMonths × ${brl(monthlyPriceReais)} × ${penaltyPercent ?? 0}%';
  }
}

// ── contratos ───────────────────────────────────────────────────────────

enum ClassAgreementStatus { pending, signed, ended, canceled }

ClassAgreementStatus _status(Object? raw) => switch (_s(raw)) {
      'pending' => ClassAgreementStatus.pending,
      'signed' => ClassAgreementStatus.signed,
      'canceled' => ClassAgreementStatus.canceled,
      _ => ClassAgreementStatus.ended,
    };

class ClassAgreementEvidence {
  const ClassAgreementEvidence({
    this.platform = '',
    this.appVersion = '',
    this.ip = '',
    this.readSeconds = 0,
  });

  final String platform;
  final String appVersion;

  /// Já mascarado pelo servidor.
  final String ip;
  final int readSeconds;
}

class ClassAgreement {
  const ClassAgreement({
    required this.agreementId,
    required this.audience,
    required this.arenaId,
    required this.arenaName,
    required this.status,
    this.number = '',
    this.title = '',
    this.planName,
    this.essentials = const [],
    this.startDate,
    this.endDate,
    this.sentAt,
    this.signedAt,
    this.partyName = '',
    this.body = '',
    this.sha256 = '',
    this.templateVersion = 0,
    this.evidence,
  });

  factory ClassAgreement.fromMap(Map<String, dynamic> m) {
    final ev = m['evidence'] is Map ? spMap(m['evidence']) : null;
    return ClassAgreement(
      agreementId: _s(m['agreementId']),
      audience: _s(m['audience']).isEmpty ? 'student' : _s(m['audience']),
      arenaId: _s(m['arenaId']),
      arenaName: _s(m['arenaName']).isEmpty ? 'Arena' : _s(m['arenaName']),
      status: _status(m['status']),
      number: _s(m['number']),
      title: _s(m['title']),
      planName: _sn(m['planName']),
      essentials: _rows(m['essentials']),
      startDate: _sn(m['startDate']),
      endDate: _sn(m['endDate']),
      sentAt: _dt(m['sentAt']),
      signedAt: _dt(m['signedAt']),
      partyName: _s(m['partyName']),
      body: _s(m['body']),
      sha256: _s(m['sha256']),
      templateVersion: _i(m['templateVersion']) ?? 0,
      evidence: ev == null
          ? null
          : ClassAgreementEvidence(
              platform: _s(ev['platform']),
              appVersion: _s(ev['appVersion']),
              ip: _s(ev['ip']),
              readSeconds: _i(ev['readSeconds']) ?? 0,
            ),
    );
  }

  final String agreementId;

  /// `student` (aluno) ou `professor`.
  final String audience;
  final String arenaId;
  final String arenaName;
  final ClassAgreementStatus status;
  final String number;
  final String title;
  final String? planName;
  final List<AgreementRow> essentials;
  final String? startDate;
  final String? endDate;
  final DateTime? sentAt;
  final DateTime? signedAt;
  final String partyName;

  /// Só no detalhe.
  final String body;
  final String sha256;
  final int templateVersion;
  final ClassAgreementEvidence? evidence;

  bool get isProfessor => audience == 'professor';
  bool get isPending => status == ClassAgreementStatus.pending;

  /// Vigente: pendente ou assinado.
  bool get isCurrent =>
      status == ClassAgreementStatus.pending ||
      status == ClassAgreementStatus.signed;

  /// "Vôlei de Praia 2x" / "Contrato de professor".
  String get headline => isProfessor
      ? 'Contrato de professor'
      : (planName?.isNotEmpty == true ? planName! : title);
}

List<ClassAgreement> parseAgreements(Object? raw) =>
    _maps(spMap(raw)['agreements']).map(ClassAgreement.fromMap).toList();

/// Contratos por arena, na ordem em que chegaram (o servidor manda o mais
/// recente primeiro). Pendentes do professor vêm antes, à parte.
List<({String arenaId, String arenaName, List<ClassAgreement> items})>
    groupAgreementsByArena(Iterable<ClassAgreement> list) {
  final order = <String>[];
  final byArena = <String, List<ClassAgreement>>{};
  final names = <String, String>{};
  for (final a in list) {
    if (!byArena.containsKey(a.arenaId)) order.add(a.arenaId);
    byArena.putIfAbsent(a.arenaId, () => []).add(a);
    names[a.arenaId] = a.arenaName;
  }
  return [
    for (final id in order)
      (arenaId: id, arenaName: names[id]!, items: byArena[id]!),
  ];
}

/// `YYYY-MM-DD` → `dd/mm/aaaa`.
String brDateKey(String? key) {
  final m = RegExp(r'^(\d{4})-(\d{2})-(\d{2})$').firstMatch(key ?? '');
  if (m == null) return '';
  return '${m[3]}/${m[2]}/${m[1]}';
}

/// "9f3a…c27e" — impressão do texto para o comprovante.
String agreementShortHash(String sha) =>
    sha.length < 12 ? sha : '${sha.substring(0, 4)}…${sha.substring(sha.length - 4)}';
