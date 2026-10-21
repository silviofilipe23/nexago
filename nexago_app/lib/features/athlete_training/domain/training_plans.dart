import '../../arena/domain/aulas/arena_class_logic.dart';

/// T14 · Planos e pagamentos — espelha `getMyTrainingPlans`
/// (`functions/src/arena-class-athlete-plans.ts`): matrícula na turma
/// (cobrada pela ARENA) e carteira do professor independente (cobrada PELO
/// PROFESSOR), lado a lado, e os últimos pagamentos.

class ArenaPlanSlot {
  const ArenaPlanSlot({
    required this.className,
    required this.weekday,
    required this.startTime,
    this.teacherName = '',
  });

  factory ArenaPlanSlot.fromMap(Map<String, Object?> m) => ArenaPlanSlot(
        className: _str(m['className'], 'Turma'),
        weekday: _int(m['weekday']) ?? 0,
        startTime: _str(m['startTime']),
        teacherName: _str(m['teacherName']),
      );

  final String className;

  /// ISO: 1 = segunda … 7 = domingo.
  final int weekday;
  final String startTime;
  final String teacherName;
}

class ArenaTrainingPlan {
  const ArenaTrainingPlan({
    required this.enrollmentId,
    required this.arenaName,
    required this.planName,
    required this.kind,
    required this.priceReais,
    this.classesPerWeek,
    this.creditsLeft,
    this.credits,
    this.expiresOn,
    this.startDate = '',
    this.billedThrough,
    this.dueDay,
    this.paymentMethod = '',
    this.billingMode = 'manual',
    this.slots = const [],
    this.makeupCredits = 0,
  });

  factory ArenaTrainingPlan.fromMap(Map<String, Object?> m) {
    final slots = m['slots'];
    return ArenaTrainingPlan(
      enrollmentId: _str(m['enrollmentId']),
      arenaName: _str(m['arenaName'], 'Arena'),
      planName: _str(m['planName'], 'Plano'),
      kind: _str(m['kind'], 'monthly'),
      priceReais: _double(m['priceReais']) ?? 0,
      classesPerWeek: _int(m['classesPerWeek']),
      creditsLeft: _int(m['creditsLeft']),
      credits: _int(m['credits']),
      expiresOn: _strOrNull(m['expiresOn']),
      startDate: _str(m['startDate']),
      billedThrough: _strOrNull(m['billedThrough']),
      dueDay: _int(m['dueDay']),
      paymentMethod: _str(m['paymentMethod']),
      billingMode: _str(m['billingMode'], 'manual'),
      slots: slots is List
          ? [
              for (final s in slots)
                if (s is Map) ArenaPlanSlot.fromMap(_map(s)),
            ]
          : const [],
      makeupCredits: _int(m['makeupCredits']) ?? 0,
    );
  }

  final String enrollmentId;
  final String arenaName;
  final String planName;

  /// `monthly`, `package` ou `single`.
  final String kind;
  final double priceReais;
  final int? classesPerWeek;
  final int? creditsLeft;
  final int? credits;
  final String? expiresOn;
  final String startDate;
  final String? billedThrough;
  final int? dueDay;
  final String paymentMethod;

  /// `asaas` (fatura online) ou `manual` (paga direto à arena).
  final String billingMode;
  final List<ArenaPlanSlot> slots;
  final int makeupCredits;

  bool get isPackage => kind == 'package';
}

class ProfessorTrainingPlan {
  const ProfessorTrainingPlan({
    required this.professorUid,
    required this.professorName,
    this.professorPhotoUrl,
    this.planName,
    this.kind,
    this.classes,
    this.recurringReais,
    this.recurringDueDay,
    this.recurringDescription,
  });

  factory ProfessorTrainingPlan.fromMap(Map<String, Object?> m) =>
      ProfessorTrainingPlan(
        professorUid: _str(m['professorUid']),
        professorName: _str(m['professorName'], 'Professor'),
        professorPhotoUrl: _strOrNull(m['professorPhotoUrl']),
        planName: _strOrNull(m['planName']),
        kind: _strOrNull(m['kind']),
        classes: _int(m['classes']),
        recurringReais: _double(m['recurringReais']),
        recurringDueDay: _int(m['recurringDueDay']),
        recurringDescription: _strOrNull(m['recurringDescription']),
      );

  final String professorUid;
  final String professorName;
  final String? professorPhotoUrl;
  final String? planName;
  final String? kind;
  final int? classes;
  final double? recurringReais;
  final int? recurringDueDay;
  final String? recurringDescription;
}

class TrainingPayment {
  const TrainingPayment({
    required this.fromProfessor,
    required this.chargeId,
    required this.payee,
    required this.description,
    required this.amountReais,
    required this.paidOn,
    this.method = '',
  });

  factory TrainingPayment.fromMap(Map<String, Object?> m) => TrainingPayment(
        fromProfessor: m['source'] == 'professor',
        chargeId: _str(m['chargeId']),
        payee: _str(m['payee']),
        description: _str(m['description'], 'Pagamento'),
        amountReais: _double(m['amountReais']) ?? 0,
        paidOn: _str(m['paidOn']),
        method: _str(m['method']),
      );

  /// `true` = cobrança do professor (tem comprovante no app, B19).
  final bool fromProfessor;
  final String chargeId;
  final String payee;
  final String description;
  final double amountReais;

  /// `YYYY-MM-DD`.
  final String paidOn;
  final String method;
}

class MyTrainingPlans {
  const MyTrainingPlans({
    this.arenaPlans = const [],
    this.professorPlans = const [],
    this.payments = const [],
  });

  factory MyTrainingPlans.fromMap(Map<String, Object?> m) {
    List<T> list<T>(String key, T Function(Map<String, Object?>) of) {
      final raw = m[key];
      return raw is List
          ? [
              for (final e in raw)
                if (e is Map) of(_map(e)),
            ]
          : <T>[];
    }

    return MyTrainingPlans(
      arenaPlans: list('arenaPlans', ArenaTrainingPlan.fromMap),
      professorPlans: list('professorPlans', ProfessorTrainingPlan.fromMap),
      payments: list('payments', TrainingPayment.fromMap),
    );
  }

  final List<ArenaTrainingPlan> arenaPlans;
  final List<ProfessorTrainingPlan> professorPlans;
  final List<TrainingPayment> payments;

  int get activeCount => arenaPlans.length + professorPlans.length;
  bool get isEmpty => activeCount == 0 && payments.isEmpty;
}

// ── rótulos ──────────────────────────────────────────────────────────────

/// "Ter e Qui · 19:00" (horário só quando é o mesmo em todos os dias).
String arenaPlanScheduleLabel(List<ArenaPlanSlot> slots) {
  if (slots.isEmpty) return '';
  final days = <int>[];
  for (final s in slots) {
    if (!days.contains(s.weekday) && s.weekday >= 1) days.add(s.weekday);
  }
  days.sort();
  final names = [for (final d in days) _weekdayName(d)];
  final dayLabel = names.length <= 1
      ? names.join()
      : '${names.sublist(0, names.length - 1).join(', ')} e ${names.last}';
  final times = {for (final s in slots) s.startTime}..remove('');
  return [
    if (dayLabel.isNotEmpty) dayLabel,
    if (times.length == 1) times.first,
  ].join(' · ');
}

/// "Mensal", "Pacote" ou "Avulsa".
String trainingPlanKindLabel(String? kind) => switch (kind) {
      'package' => 'Pacote',
      'single' => 'Avulsa',
      'monthly' => 'Mensal',
      _ => 'Plano',
    };

/// "Pix", "Dinheiro"… do meio combinado com a arena.
String arenaPaymentMethodLabel(String method, String billingMode) {
  if (billingMode == 'asaas') return 'Fatura online (Pix ou cartão)';
  return switch (method) {
    'pix' => 'Pix direto à arena',
    'cash' => 'Dinheiro na arena',
    'card_machine' => 'Maquininha na arena',
    'transfer' => 'Transferência à arena',
    _ => 'Direto à arena',
  };
}

/// "15 out" para `YYYY-MM-DD`.
String trainingPlanShortDate(String dateKey) {
  final d = DateTime.tryParse(dateKey);
  if (d == null) return dateKey;
  const months = [
    'jan', 'fev', 'mar', 'abr', 'mai', 'jun', //
    'jul', 'ago', 'set', 'out', 'nov', 'dez',
  ];
  return '${d.day} ${months[d.month - 1]}';
}

// ── auxiliares ───────────────────────────────────────────────────────────

String _weekdayName(int isoWeekday) {
  final s = arenaClassWeekdayShort(isoWeekday);
  return s.isEmpty ? s : s[0].toUpperCase() + s.substring(1).toLowerCase();
}

String _str(Object? v, [String fallback = '']) =>
    v is String && v.trim().isNotEmpty ? v.trim() : fallback;

String? _strOrNull(Object? v) =>
    v is String && v.trim().isNotEmpty ? v.trim() : null;

int? _int(Object? v) => v is num ? v.toInt() : null;

double? _double(Object? v) => v is num ? v.toDouble() : null;

Map<String, Object?> _map(Map<dynamic, dynamic> m) =>
    m.map((k, v) => MapEntry('$k', v));
