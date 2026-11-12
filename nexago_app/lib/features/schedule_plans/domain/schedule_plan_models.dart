// Modelos dos Planos de horário da arena (horário fixo vendido como plano).
//
// Contrato: `docs/superpowers/specs/2026-11-03-arena-planos-de-horario-design.md`.
// Tudo é lido de forma defensiva: campo ausente ou de tipo errado vira um
// padrão sensato (os padrões do spec), para o app não quebrar quando o
// backend ainda não grava um campo novo.

import 'package:cloud_firestore/cloud_firestore.dart' show Timestamp;

// ── Leitura defensiva ────────────────────────────────────────────────────

Map<String, dynamic> spMap(Object? raw) {
  if (raw is Map<String, dynamic>) return raw;
  if (raw is Map) return raw.map((k, v) => MapEntry('$k', v));
  return const <String, dynamic>{};
}

List<Map<String, dynamic>> spMapList(Object? raw) {
  if (raw is! List) return const [];
  return [
    for (final e in raw)
      if (e is Map) spMap(e),
  ];
}

String spStr(Object? raw, [String fallback = '']) {
  if (raw is String) {
    final t = raw.trim();
    return t.isEmpty ? fallback : t;
  }
  if (raw is num) return '$raw';
  return fallback;
}

String? spStrOrNull(Object? raw) {
  final s = spStr(raw);
  return s.isEmpty ? null : s;
}

int spInt(Object? raw, [int fallback = 0]) {
  if (raw is int) return raw;
  if (raw is num) return raw.round();
  if (raw is String) return int.tryParse(raw.trim()) ?? fallback;
  return fallback;
}

double spDouble(Object? raw, [double fallback = 0]) {
  if (raw is num) return raw.toDouble();
  if (raw is String) {
    return double.tryParse(raw.trim().replaceAll(',', '.')) ?? fallback;
  }
  return fallback;
}

double? spDoubleOrNull(Object? raw) {
  if (raw is num) return raw.toDouble();
  if (raw is String) return double.tryParse(raw.trim().replaceAll(',', '.'));
  return null;
}

bool spBool(Object? raw, [bool fallback = false]) {
  if (raw is bool) return raw;
  return fallback;
}

List<String> spStrList(Object? raw) {
  if (raw is! List) return <String>[];
  return [
    for (final e in raw)
      if (e is String && e.trim().isNotEmpty) e.trim(),
  ];
}

List<int> spIntList(Object? raw) {
  if (raw is! List) return <int>[];
  return [
    for (final e in raw)
      if (e is num)
        e.round()
      else if (e is String && int.tryParse(e) != null)
        int.parse(e),
  ];
}

/// Instante vindo do Firestore (Timestamp), da callable (ISO, milissegundos,
/// `{_seconds}`/`{seconds}`) ou já como [DateTime]. `null` se não der.
DateTime? spDateTime(Object? raw) {
  if (raw == null) return null;
  if (raw is DateTime) return raw;
  if (raw is Timestamp) return raw.toDate();
  if (raw is int) return DateTime.fromMillisecondsSinceEpoch(raw);
  if (raw is String) {
    final t = raw.trim();
    if (t.isEmpty) return null;
    return DateTime.tryParse(t)?.toLocal();
  }
  if (raw is Map) {
    final m = spMap(raw);
    final seconds = m['_seconds'] ?? m['seconds'];
    if (seconds is num) {
      final nanos = spInt(m['_nanoseconds'] ?? m['nanoseconds']);
      return DateTime.fromMillisecondsSinceEpoch(
        seconds.toInt() * 1000 + nanos ~/ 1000000,
      );
    }
  }
  return null;
}

/// Data de calendário `YYYY-MM-DD` (sem fuso). Aceita também instantes —
/// fica com o dia local.
DateTime? spDate(Object? raw) {
  if (raw is String) {
    final m = RegExp(r'^(\d{4})-(\d{2})-(\d{2})').firstMatch(raw.trim());
    if (m != null) {
      return DateTime(
        int.parse(m.group(1)!),
        int.parse(m.group(2)!),
        int.parse(m.group(3)!),
      );
    }
  }
  final at = spDateTime(raw);
  return at == null ? null : DateTime(at.year, at.month, at.day);
}

// ── Plano ────────────────────────────────────────────────────────────────

/// Janela de início do plano: o atleta escolhe o início dentro dela e o fim
/// (início + duração) não passa de [endTime].
/// Como o assinante usa o plano. Ausente no doc = fixo (planos de antes).
enum ScheduleBookingMode { fixed, flexible }

ScheduleBookingMode scheduleBookingModeFromKey(String? key) => key == 'flexible'
    ? ScheduleBookingMode.flexible
    : ScheduleBookingMode.fixed;

class SchedulePlanWindow {
  const SchedulePlanWindow({
    required this.weekday,
    required this.startTime,
    required this.endTime,
  });

  /// 1 = segunda … 7 = domingo (igual ao `DateTime.weekday`).
  final int weekday;
  final String startTime;
  final String endTime;

  factory SchedulePlanWindow.fromMap(Map<String, dynamic> m) =>
      SchedulePlanWindow(
        weekday: spInt(m['weekday']),
        startTime: spStr(m['startTime'], '00:00'),
        endTime: spStr(m['endTime'], '00:00'),
      );
}

enum SchedulePlanCycle { monthly, quarterly, annual }

SchedulePlanCycle? schedulePlanCycleFromKey(String? key) => switch (key) {
      'monthly' => SchedulePlanCycle.monthly,
      'quarterly' => SchedulePlanCycle.quarterly,
      'annual' => SchedulePlanCycle.annual,
      _ => null,
    };

extension SchedulePlanCycleX on SchedulePlanCycle {
  String get key => switch (this) {
        SchedulePlanCycle.monthly => 'monthly',
        SchedulePlanCycle.quarterly => 'quarterly',
        SchedulePlanCycle.annual => 'annual',
      };

  String get label => switch (this) {
        SchedulePlanCycle.monthly => 'Mensal',
        SchedulePlanCycle.quarterly => 'Trimestral',
        SchedulePlanCycle.annual => 'Anual',
      };
}

class SchedulePlanCycleOption {
  const SchedulePlanCycleOption({
    required this.cycle,
    required this.enabled,
    this.discountPercent = 0,
  });

  final SchedulePlanCycle cycle;
  final bool enabled;
  final double discountPercent;
}

/// Forma de pagamento escolhida pelo atleta (`pix_auto | card | onsite`).
enum SchedulePaymentMethod { pixAuto, card, onsite }

SchedulePaymentMethod? schedulePaymentMethodFromKey(String? key) =>
    switch (key) {
      'pix_auto' => SchedulePaymentMethod.pixAuto,
      'card' => SchedulePaymentMethod.card,
      'onsite' => SchedulePaymentMethod.onsite,
      _ => null,
    };

extension SchedulePaymentMethodX on SchedulePaymentMethod {
  String get key => switch (this) {
        SchedulePaymentMethod.pixAuto => 'pix_auto',
        SchedulePaymentMethod.card => 'card',
        SchedulePaymentMethod.onsite => 'onsite',
      };

  String get label => switch (this) {
        SchedulePaymentMethod.pixAuto => 'Pix',
        SchedulePaymentMethod.card => 'Cartão',
        SchedulePaymentMethod.onsite => 'Na arena',
      };
}

class SchedulePlanRules {
  const SchedulePlanRules({
    this.makeupEnabled = true,
    this.makeupPerMonth = 2,
    this.makeupValidityDays = 30,
    this.makeupNoticeHours = 24,
    this.holiday = 'makeup',
    this.pauseEnabled = true,
    this.pauseMaxDaysPerYear = 30,
    this.splitEnabled = true,
    this.splitMaxPlayers = 4,
    this.weather = true,
  });

  final bool makeupEnabled;
  final int makeupPerMonth;
  final int makeupValidityDays;
  final int makeupNoticeHours;
  final String holiday;
  final bool pauseEnabled;
  final int pauseMaxDaysPerYear;
  final bool splitEnabled;
  final int splitMaxPlayers;
  final bool weather;

  factory SchedulePlanRules.fromMap(Map<String, dynamic> m) {
    final makeup = spMap(m['makeup']);
    final pause = spMap(m['pause']);
    final split = spMap(m['split']);
    return SchedulePlanRules(
      makeupEnabled: spBool(makeup['enabled'], makeup.isNotEmpty || m.isEmpty),
      makeupPerMonth: spInt(makeup['perMonth'], 2),
      makeupValidityDays: spInt(makeup['validityDays'], 30),
      makeupNoticeHours: spInt(makeup['noticeHours'], 24),
      holiday: spStr(m['holiday'], 'makeup'),
      pauseEnabled: spBool(pause['enabled'], pause.isNotEmpty || m.isEmpty),
      pauseMaxDaysPerYear: spInt(pause['maxDaysPerYear'], 30),
      splitEnabled: spBool(split['enabled'], split.isNotEmpty || m.isEmpty),
      splitMaxPlayers: spInt(split['maxPlayers'], 4).clamp(1, 6),
      weather: spBool(m['weather'], true),
    );
  }
}

class SchedulePlan {
  const SchedulePlan({
    required this.id,
    required this.arenaId,
    required this.name,
    this.description,
    this.status = 'active',
    this.bookingMode = ScheduleBookingMode.fixed,
    this.timesPerWeek = 1,
    this.durationMinutes = 60,
    this.windows = const [],
    this.courtIds = const [],
    this.courtNames = const [],
    this.capacity = 0,
    this.occupiedCount = 0,
    this.waitingCount = 0,
    this.monthlyPriceReais = 0,
    this.referenceHourlyReais,
    this.cycles = const [
      SchedulePlanCycleOption(cycle: SchedulePlanCycle.monthly, enabled: true),
    ],
    this.billingMethods = const [SchedulePaymentMethod.onsite],
    this.dueDay = 5,
    this.dueDayOptions = const [],
    this.pixDiscountPercent = 0,
    this.rules = const SchedulePlanRules(),
  });

  final String id;
  final String arenaId;
  final String name;
  final String? description;
  final String status;

  /// Fixo (dias e horário escolhidos ao assinar) ou livre (reserva quando
  /// quiser dentro das janelas, até [timesPerWeek] por semana).
  final ScheduleBookingMode bookingMode;
  final int timesPerWeek;
  final int durationMinutes;
  final List<SchedulePlanWindow> windows;
  final List<String> courtIds;
  final List<String> courtNames;
  final int capacity;
  final int occupiedCount;
  final int waitingCount;
  final double monthlyPriceReais;
  final double? referenceHourlyReais;
  final List<SchedulePlanCycleOption> cycles;
  final List<SchedulePaymentMethod> billingMethods;
  final int dueDay;

  /// Dias de vencimento que o atleta escolhe ao assinar (ex.: 5, 15, 25);
  /// vazio = vale [dueDay].
  final List<int> dueDayOptions;

  /// Desconto (%) na mensalidade paga por Pix online; 0 = sem desconto.
  final int pixDiscountPercent;
  final SchedulePlanRules rules;

  bool get isActive => status == 'active';

  bool get isFlexible => bookingMode == ScheduleBookingMode.flexible;

  /// Ciclos ligados, na ordem mensal → trimestral → anual. Sem nenhum ligado
  /// (doc antigo), o mensal.
  List<SchedulePlanCycleOption> get enabledCycles {
    final on = cycles.where((c) => c.enabled).toList();
    return on.isEmpty
        ? const [
            SchedulePlanCycleOption(
                cycle: SchedulePlanCycle.monthly, enabled: true),
          ]
        : on;
  }

  factory SchedulePlan.fromMap(
    String id,
    Map<String, dynamic> m, {
    String arenaId = '',
  }) {
    final cyclesMap = spMap(m['cycles']);
    final cycles = <SchedulePlanCycleOption>[];
    for (final c in SchedulePlanCycle.values) {
      final raw = spMap(cyclesMap[c.key]);
      final defaultDiscount = switch (c) {
        SchedulePlanCycle.monthly => 0.0,
        SchedulePlanCycle.quarterly => 5.0,
        SchedulePlanCycle.annual => 10.0,
      };
      cycles.add(SchedulePlanCycleOption(
        cycle: c,
        enabled: spBool(
          raw['enabled'],
          // Sem `cycles` gravado, só o mensal.
          cyclesMap.isEmpty && c == SchedulePlanCycle.monthly,
        ),
        discountPercent: c == SchedulePlanCycle.monthly
            ? 0
            : spDouble(raw['discountPercent'], defaultDiscount)
                .clamp(0, 50)
                .toDouble(),
      ));
    }
    final billing = spMap(m['billing']);
    final methods = <SchedulePaymentMethod>[
      for (final k in spStrList(billing['methods']))
        if (schedulePaymentMethodFromKey(k) != null)
          schedulePaymentMethodFromKey(k)!,
    ];
    final ref = spDoubleOrNull(m['referenceHourlyReais']);
    return SchedulePlan(
      id: id.isNotEmpty ? id : spStr(m['planId'] ?? m['id']),
      arenaId: spStr(m['arenaId'], arenaId),
      name: spStr(m['name'], 'Plano'),
      description: spStrOrNull(m['description']),
      status: spStr(m['status'], 'active'),
      bookingMode: scheduleBookingModeFromKey(spStrOrNull(m['bookingMode'])),
      timesPerWeek: spInt(m['timesPerWeek'], 1).clamp(1, 7),
      durationMinutes: spInt(m['durationMinutes'], 60),
      windows: [
        for (final w in spMapList(m['windows'])) SchedulePlanWindow.fromMap(w),
      ]..removeWhere((w) => w.weekday < 1 || w.weekday > 7),
      courtIds: spStrList(m['courtIds']),
      courtNames: spStrList(m['courtNames']),
      capacity: spInt(m['capacity']),
      occupiedCount: spInt(m['occupiedCount']),
      waitingCount: spInt(m['waitingCount']),
      monthlyPriceReais: spDouble(m['monthlyPriceReais']),
      referenceHourlyReais: ref != null && ref > 0 ? ref : null,
      cycles: cycles,
      billingMethods:
          methods.isEmpty ? const [SchedulePaymentMethod.onsite] : methods,
      dueDay: spInt(billing['dueDay'], 5),
      dueDayOptions: _dueDayOptions(billing['dueDayOptions']),
      pixDiscountPercent: spInt(billing['pixDiscountPercent']).clamp(0, 50),
      rules: SchedulePlanRules.fromMap(spMap(m['rules'])),
    );
  }
}

/// Opções de vencimento gravadas: 2+ dias de 1 a 28, em ordem; senão vazio.
List<int> _dueDayOptions(Object? raw) {
  final days = (spIntList(raw).where((d) => d >= 1 && d <= 28).toSet().toList()
    ..sort());
  return days.length >= 2 ? days : const [];
}

// ── Disponibilidade (A2) ────────────────────────────────────────────────

class SchedulePlanTimeOption {
  const SchedulePlanTimeOption({
    required this.startTime,
    required this.endTime,
    this.freeCourts = 0,
    this.waitlistCount = 0,
    this.prime = false,
  });

  final String startTime;
  final String endTime;
  final int freeCourts;
  final int waitlistCount;
  final bool prime;

  factory SchedulePlanTimeOption.fromMap(Map<String, dynamic> m) =>
      SchedulePlanTimeOption(
        startTime: spStr(m['startTime'], '00:00'),
        endTime: spStr(m['endTime'], '00:00'),
        freeCourts: spInt(m['freeCourts']),
        waitlistCount: spInt(m['waitlistCount']),
        prime: spBool(m['prime']),
      );
}

class SchedulePlanDayAvailability {
  const SchedulePlanDayAvailability({
    required this.weekday,
    this.times = const [],
  });

  final int weekday;
  final List<SchedulePlanTimeOption> times;

  factory SchedulePlanDayAvailability.fromMap(Map<String, dynamic> m) =>
      SchedulePlanDayAvailability(
        weekday: spInt(m['weekday']),
        times: [
          for (final t in spMapList(m['times']))
            SchedulePlanTimeOption.fromMap(t),
        ],
      );
}

class SchedulePlanAvailability {
  const SchedulePlanAvailability({
    required this.plan,
    this.primeCapReached = false,
    this.days = const [],
    this.onlineBilling = false,
    this.arenaDefinesCourt = false,
  });

  final SchedulePlan plan;
  final bool primeCapReached;
  final List<SchedulePlanDayAvailability> days;

  /// A arena cobra online (`scheduleSettings/rules.onlineBillingEnabled`):
  /// Pix/cartão viram link mensal. Backend antigo não manda → `false`.
  final bool onlineBilling;

  /// A arena define a quadra (reservas por capacidade): o atleta assina o
  /// horário e não vê quadra. Backend antigo não manda → `false`.
  final bool arenaDefinesCourt;

  factory SchedulePlanAvailability.fromMap(
    Map<String, dynamic> m, {
    required String arenaId,
    required String planId,
  }) {
    final days = [
      for (final d in spMapList(m['days']))
        SchedulePlanDayAvailability.fromMap(d),
    ]..removeWhere((d) => d.weekday < 1 || d.weekday > 7);
    days.sort((a, b) => a.weekday.compareTo(b.weekday));
    return SchedulePlanAvailability(
      plan: SchedulePlan.fromMap(planId, spMap(m['plan']), arenaId: arenaId),
      primeCapReached: spBool(m['primeCapReached']),
      days: days,
      onlineBilling: spBool(m['onlineBilling']),
      arenaDefinesCourt: spBool(m['arenaDefinesCourt']),
    );
  }
}

// ── Assinatura (A3) ─────────────────────────────────────────────────────

/// `pendingPayment`: assinou com Pix/cartão e tem 30 min para pagar a 1ª
/// mensalidade; sem pagamento o horário é liberado.
enum ScheduleSubscriptionStatus {
  active,
  pendingPayment,
  paused,
  suspended,
  canceled,
}

ScheduleSubscriptionStatus scheduleSubscriptionStatusFromKey(String? key) =>
    switch (key) {
      'pending_payment' => ScheduleSubscriptionStatus.pendingPayment,
      'paused' => ScheduleSubscriptionStatus.paused,
      'suspended' => ScheduleSubscriptionStatus.suspended,
      'canceled' => ScheduleSubscriptionStatus.canceled,
      _ => ScheduleSubscriptionStatus.active,
    };

class ScheduleSubscriptionMember {
  const ScheduleSubscriptionMember({
    this.athleteId,
    required this.name,
    this.photoUrl,
    this.shareReais = 0,
    this.isHolder = false,
  });

  final String? athleteId;
  final String name;
  final String? photoUrl;
  final double shareReais;
  final bool isHolder;

  factory ScheduleSubscriptionMember.fromMap(Map<String, dynamic> m) =>
      ScheduleSubscriptionMember(
        athleteId: spStrOrNull(m['athleteId']),
        name: spStr(m['name'], 'Atleta'),
        photoUrl: spStrOrNull(m['photoUrl']),
        shareReais: spDouble(m['shareReais']),
        isHolder: spStr(m['role']) == 'holder',
      );
}

class ScheduleSubscriptionSlot {
  const ScheduleSubscriptionSlot({
    required this.weekday,
    required this.startTime,
    required this.endTime,
    this.courtId = '',
    this.courtName = '',
  });

  final int weekday;
  final String startTime;
  final String endTime;
  final String courtId;
  final String courtName;

  factory ScheduleSubscriptionSlot.fromMap(Map<String, dynamic> m) =>
      ScheduleSubscriptionSlot(
        weekday: spInt(m['weekday']),
        startTime: spStr(m['startTime'], '00:00'),
        endTime: spStr(m['endTime'], '00:00'),
        courtId: spStr(m['courtId']),
        courtName: spStr(m['courtName']),
      );
}

enum ScheduleOccurrenceState { done, today, next, skipped, makeup }

ScheduleOccurrenceState? scheduleOccurrenceStateFromKey(String? key) =>
    switch (key) {
      'done' => ScheduleOccurrenceState.done,
      'today' => ScheduleOccurrenceState.today,
      'next' => ScheduleOccurrenceState.next,
      'skipped' || 'skip' => ScheduleOccurrenceState.skipped,
      'makeup' => ScheduleOccurrenceState.makeup,
      _ => null,
    };

class ScheduleOccurrence {
  const ScheduleOccurrence({
    required this.bookingId,
    required this.date,
    required this.startTime,
    required this.endTime,
    this.courtName = '',
    this.rawState,
  });

  final String bookingId;
  final DateTime date;
  final String startTime;
  final String endTime;
  final String courtName;

  /// Estado que o servidor mandou; `null` = calcular pela data.
  final ScheduleOccurrenceState? rawState;

  factory ScheduleOccurrence.fromMap(Map<String, dynamic> m) =>
      ScheduleOccurrence(
        bookingId: spStr(m['bookingId'] ?? m['id']),
        date: spDate(m['date']) ?? DateTime(1970),
        startTime: spStr(m['startTime'], '00:00'),
        endTime: spStr(m['endTime'], '00:00'),
        courtName: spStr(m['courtName']),
        rawState: scheduleOccurrenceStateFromKey(spStrOrNull(m['status'])),
      );
}

class ScheduleCredit {
  const ScheduleCredit({
    required this.id,
    this.reason = 'skip',
    this.status = 'available',
    this.sourceDate,
    this.expiresOn,
    this.usedDate,
  });

  final String id;

  /// `skip | holiday | arena | manual`.
  final String reason;

  /// `available | used | expired`.
  final String status;
  final DateTime? sourceDate;
  final DateTime? expiresOn;
  final DateTime? usedDate;

  factory ScheduleCredit.fromMap(Map<String, dynamic> m) => ScheduleCredit(
        id: spStr(m['id'] ?? m['creditId']),
        reason: spStr(m['reason'], 'skip'),
        status: spStr(m['status'], 'available'),
        sourceDate: spDate(m['sourceDate']),
        expiresOn: spDate(m['expiresOn']),
        usedDate: spDate(m['usedDate']),
      );
}

class ScheduleCharge {
  const ScheduleCharge({
    required this.id,
    this.planName = '',
    this.subscriptionId = '',
    this.cancelReason,
    this.period = '',
    this.coversThrough,
    this.amountReais = 0,
    this.dueDate,
    this.status = 'open',
    this.payerAthleteId,
    this.payerName = '',
    this.billingMode,
    this.asaasState,
    this.invoiceUrl,
    this.paidVia,
    this.onlineBillingType,
    this.autopay,
  });

  final String id;

  /// Nome do plano (vem no doc da mensalidade; a lista de Meu plano não usa).
  final String planName;
  final String subscriptionId;

  /// `payment_expired`: o prazo de 30 min da assinatura venceu sem pagamento.
  final String? cancelReason;
  final String period;

  /// Último mês coberto (`AAAA-MM`): o anual à vista cobre 12 numa cobrança.
  /// `null` = só [period].
  final String? coversThrough;

  /// Cobre mais de um mês (anual à vista).
  bool get coversManyMonths =>
      coversThrough != null && coversThrough!.compareTo(period) > 0;

  final double amountReais;
  final DateTime? dueDate;

  /// `open | paid | canceled`.
  final String status;
  final String? payerAthleteId;
  final String payerName;

  /// `null` (a decidir; também mensalidade antiga) | `manual` | `asaas`.
  final String? billingMode;

  /// Espelho do grupo Asaas (`asaas.state`): `pending | creating | open |
  /// paid | voiding | void | failed | needs_cpf`.
  final String? asaasState;

  /// Fatura já gerada (`asaas.invoiceUrl`).
  final String? invoiceUrl;

  /// `asaas` quando paga online; manual não grava.
  final String? paidVia;

  /// `PIX | CREDIT_CARD | …` (só paga online).
  final String? onlineBillingType;

  /// Débito automático no cartão (`null` = mensalidade sem `autopay`).
  final ScheduleChargeAutopay? autopay;

  bool get isOpen => status == 'open';
  bool get isPaid => status == 'paid';

  /// Cobrada por link (Pix ou cartão) — o atleta paga no app.
  bool get isOnline => billingMode == 'asaas';

  bool get isPaidOnline => isPaid && paidVia == 'asaas';

  factory ScheduleCharge.fromMap(Map<String, dynamic> m) {
    final asaas = spMap(m['asaas']);
    return ScheduleCharge(
      id: spStr(m['id'] ?? m['chargeId']),
      planName: spStr(m['planName']),
      subscriptionId: spStr(m['subscriptionId']),
      cancelReason: spStrOrNull(m['cancelReason']),
      period: spStr(m['period']),
      coversThrough: spStrOrNull(m['coversThrough']),
      amountReais: spDouble(m['amountReais']),
      dueDate: spDate(m['dueDate']),
      status: spStr(m['status'], 'open'),
      payerAthleteId: spStrOrNull(m['payerAthleteId']),
      payerName: spStr(m['payerName']),
      billingMode: spStrOrNull(m['billingMode']),
      asaasState: spStrOrNull(asaas['state']),
      invoiceUrl: spStrOrNull(asaas['invoiceUrl']),
      paidVia: spStrOrNull(m['paidVia']),
      onlineBillingType: spStrOrNull(m['onlineBillingType'])?.toUpperCase(),
      autopay: m['autopay'] is Map
          ? ScheduleChargeAutopay.fromMap(spMap(m['autopay']))
          : null,
    );
  }
}

/// Espelho do débito automático da mensalidade (`autopay`):
/// `scheduled | retry | charging | paid | failed | skipped`.
class ScheduleChargeAutopay {
  const ScheduleChargeAutopay({
    required this.state,
    this.scheduledFor,
    this.attempts = 0,
    this.brand = '',
    this.last4 = '',
    this.chargedReais,
  });

  final String state;

  /// Dia do próximo débito (`AAAA-MM-DD`).
  final String? scheduledFor;
  final int attempts;
  final String brand;
  final String last4;
  final double? chargedReais;

  factory ScheduleChargeAutopay.fromMap(Map<String, dynamic> m) =>
      ScheduleChargeAutopay(
        state: spStr(m['state']),
        scheduledFor: spStrOrNull(m['scheduledFor']),
        attempts: spInt(m['attempts']),
        brand: spStr(m['brand']),
        last4: spStr(m['last4']),
        chargedReais:
            m['chargedReais'] == null ? null : spDouble(m['chargedReais']),
      );
}

/// Autorização do atleta para debitar o cartão nesta assinatura.
class ScheduleAutopayConsent {
  const ScheduleAutopayConsent({
    required this.enabled,
    this.brand = '',
    this.last4 = '',
  });

  final bool enabled;
  final String brand;
  final String last4;

  factory ScheduleAutopayConsent.fromMap(Map<String, dynamic> m) =>
      ScheduleAutopayConsent(
        enabled: m['enabled'] == true,
        brand: spStr(m['brand']),
        last4: spStr(m['last4']),
      );
}

/// Taxas do cartão e a próxima mensalidade a debitar (para o texto de
/// autorização e para "próxima: dd/mm, R$ X").
class ScheduleAutopayPreview {
  const ScheduleAutopayPreview({
    this.brand,
    this.last4,
    this.cardFeePercent = 0,
    this.cardProcessingPercent = 0,
    this.cardFixedReais = 0,
    this.next,
  });

  final String? brand;
  final String? last4;
  final double cardFeePercent;
  final double cardProcessingPercent;
  final double cardFixedReais;
  final ({
    String chargeId,
    String dueDate,
    double amountReais,
    double cardFeeReais,
    double chargedReais,
  })? next;

  factory ScheduleAutopayPreview.fromMap(Map<String, dynamic> m) {
    final n = m['next'] is Map ? spMap(m['next']) : null;
    return ScheduleAutopayPreview(
      brand: spStrOrNull(m['brand']),
      last4: spStrOrNull(m['last4']),
      cardFeePercent: spDouble(m['cardFeePercent']),
      cardProcessingPercent: spDouble(m['cardProcessingPercent']),
      cardFixedReais: spDouble(m['cardFixedReais']),
      next: n == null
          ? null
          : (
              chargeId: spStr(n['chargeId']),
              dueDate: spStr(n['dueDate']),
              amountReais: spDouble(n['amountReais']),
              cardFeeReais: spDouble(n['cardFeeReais']),
              chargedReais: spDouble(n['chargedReais']),
            ),
    );
  }
}

class ScheduleSubscription {
  const ScheduleSubscription({
    required this.id,
    required this.arenaId,
    this.arenaName = '',
    required this.planId,
    this.planName = '',
    this.timesPerWeek = 1,
    this.durationMinutes = 60,
    this.bookingMode = ScheduleBookingMode.fixed,
    this.windows = const [],
    this.weekUsage,
    this.rules = const SchedulePlanRules(),
    this.holderAthleteId,
    this.holderName = '',
    this.memberAthleteIds = const [],
    this.members = const [],
    this.slots = const [],
    this.cycle = SchedulePlanCycle.monthly,
    this.monthlyPriceReais = 0,
    this.commitmentEndsOn,
    this.paymentMethod = SchedulePaymentMethod.onsite,
    this.dueDay = 5,
    this.status = ScheduleSubscriptionStatus.active,
    this.endsOn,
    this.pausedUntil,
    this.pendingPaymentUntil,
    this.pauseDaysUsedYear,
    this.pauseDaysUsed = 0,
    this.makeupBalance = 0,
    this.occurrences = const [],
    this.credits = const [],
    this.charges = const [],
    this.autopay = const {},
    this.prepaidMonths = 1,
    this.pixDiscountPercent = 0,
  });

  /// Desconto (%) do plano no Pix online (as próximas faturas de Pix saem com ele).
  final int pixDiscountPercent;

  final String id;
  final String arenaId;
  final String arenaName;

  /// Mensalidades pagas de uma vez (anual à vista = 12; antigas e mensal = 1).
  final int prepaidMonths;

  bool get paysUpfront => prepaidMonths > 1;
  final String planId;
  final String planName;
  final int timesPerWeek;
  final int durationMinutes;

  /// Livre: o atleta reserva pelo fluxo normal dentro de [windows]; as
  /// [occurrences] são as reservas que o plano cobriu.
  final ScheduleBookingMode bookingMode;
  final List<SchedulePlanWindow> windows;

  /// Usos da semana corrente (só no livre).
  final ScheduleWeekUsage? weekUsage;
  final SchedulePlanRules rules;
  final String? holderAthleteId;
  final String holderName;
  final List<String> memberAthleteIds;
  final List<ScheduleSubscriptionMember> members;
  final List<ScheduleSubscriptionSlot> slots;
  final SchedulePlanCycle cycle;
  final double monthlyPriceReais;
  final DateTime? commitmentEndsOn;
  final SchedulePaymentMethod paymentMethod;
  final int dueDay;
  final ScheduleSubscriptionStatus status;
  final DateTime? endsOn;
  final DateTime? pausedUntil;

  /// Prazo para pagar a 1ª mensalidade (só em `pendingPayment`).
  final DateTime? pendingPaymentUntil;

  /// Ano (`YYYY`) a que [pauseDaysUsed] se refere.
  final String? pauseDaysUsedYear;
  final int pauseDaysUsed;
  final int makeupBalance;
  final List<ScheduleOccurrence> occurrences;
  final List<ScheduleCredit> credits;
  final List<ScheduleCharge> charges;

  /// Autorizações de débito automático por atleta (o servidor devolve só a do
  /// próprio atleta).
  final Map<String, ScheduleAutopayConsent> autopay;

  ScheduleAutopayConsent? autopayFor(String uid) => autopay[uid];

  bool get isFlexible => bookingMode == ScheduleBookingMode.flexible;

  factory ScheduleSubscription.fromMap(Map<String, dynamic> m, {String? id}) {
    final snapshot = spMap(m['planSnapshot']);
    final pauseUsed = spMap(m['pauseDaysUsed']);
    final occurrences = [
      for (final o in spMapList(m['occurrences']))
        ScheduleOccurrence.fromMap(o),
    ]..sort((a, b) {
        final byDate = a.date.compareTo(b.date);
        return byDate != 0 ? byDate : a.startTime.compareTo(b.startTime);
      });
    final slots = [
      for (final s in spMapList(m['slots']))
        ScheduleSubscriptionSlot.fromMap(s),
    ]..sort((a, b) => a.weekday.compareTo(b.weekday));
    return ScheduleSubscription(
      id: id ?? spStr(m['id'] ?? m['subscriptionId']),
      arenaId: spStr(m['arenaId']),
      arenaName: spStr(m['arenaName']),
      planId: spStr(m['planId']),
      planName: spStr(m['planName'], 'Plano de horário'),
      timesPerWeek:
          spInt(snapshot['timesPerWeek'], slots.isEmpty ? 1 : slots.length),
      durationMinutes: spInt(snapshot['durationMinutes'], 60),
      bookingMode:
          scheduleBookingModeFromKey(spStrOrNull(snapshot['bookingMode'])),
      windows: [
        for (final w in spMapList(snapshot['windows']))
          SchedulePlanWindow.fromMap(w),
      ]..removeWhere((w) => w.weekday < 1 || w.weekday > 7),
      weekUsage: m['weekUsage'] is Map
          ? ScheduleWeekUsage.fromMap(spMap(m['weekUsage']))
          : null,
      rules: SchedulePlanRules.fromMap(spMap(snapshot['rules'])),
      holderAthleteId: spStrOrNull(m['holderAthleteId']),
      holderName: spStr(m['holderName']),
      memberAthleteIds: spStrList(m['memberAthleteIds']),
      members: [
        for (final mm in spMapList(m['members']))
          ScheduleSubscriptionMember.fromMap(mm),
      ],
      slots: slots,
      cycle: schedulePlanCycleFromKey(spStrOrNull(m['cycle'])) ??
          SchedulePlanCycle.monthly,
      monthlyPriceReais: spDouble(m['monthlyPriceReais']),
      commitmentEndsOn: spDate(m['commitmentEndsOn']),
      prepaidMonths: spInt(m['prepaidMonths'], 1),
      pixDiscountPercent: spInt(m['pixDiscountPercent']).clamp(0, 50),
      paymentMethod:
          schedulePaymentMethodFromKey(spStrOrNull(m['paymentMethod'])) ??
              SchedulePaymentMethod.onsite,
      dueDay: spInt(m['dueDay'] ?? snapshot['dueDay'], 5),
      status: scheduleSubscriptionStatusFromKey(spStrOrNull(m['status'])),
      endsOn: spDate(m['endsOn']),
      pausedUntil: spDate(m['pausedUntil']),
      pendingPaymentUntil: spDateTime(m['pendingPaymentUntil']),
      pauseDaysUsedYear: spStrOrNull(pauseUsed['year']),
      pauseDaysUsed: spInt(pauseUsed['days']),
      makeupBalance: spInt(m['makeupBalance']),
      occurrences: occurrences,
      credits: [
        for (final c in spMapList(m['credits'])) ScheduleCredit.fromMap(c),
      ],
      charges: [
        for (final c in spMapList(m['charges'])) ScheduleCharge.fromMap(c),
      ],
      autopay: {
        for (final e in spMap(m['autopay']).entries)
          if (e.value is Map)
            e.key: ScheduleAutopayConsent.fromMap(spMap(e.value)),
      },
    );
  }
}

/// Usos do plano livre na semana corrente (seg a dom).
class ScheduleWeekUsage {
  const ScheduleWeekUsage({
    required this.used,
    required this.timesPerWeek,
    this.weekStart,
    this.weekEnd,
  });

  final int used;
  final int timesPerWeek;
  final DateTime? weekStart;
  final DateTime? weekEnd;

  int get left => (timesPerWeek - used).clamp(0, timesPerWeek);

  factory ScheduleWeekUsage.fromMap(Map<String, dynamic> m) =>
      ScheduleWeekUsage(
        used: spInt(m['used']),
        timesPerWeek: spInt(m['timesPerWeek']),
        weekStart: spDate(m['weekStart']),
        weekEnd: spDate(m['weekEnd']),
      );
}

/// Entrada da lista de espera com vaga oferecida ao atleta.
class ScheduleWaitlistOffer {
  const ScheduleWaitlistOffer({
    required this.entryId,
    required this.arenaId,
    required this.planId,
    this.planName = '',
    this.arenaName = '',
    this.weekdays = const [],
    this.startTime = '',
    this.courtName = '',
    this.expiresAt,
    this.status = 'offered',
  });

  final String entryId;
  final String arenaId;
  final String planId;
  final String planName;
  final String arenaName;
  final List<int> weekdays;
  final String startTime;
  final String courtName;
  final DateTime? expiresAt;
  final String status;

  bool get isOffered => status == 'offered';

  factory ScheduleWaitlistOffer.fromMap(Map<String, dynamic> m, {String? id}) {
    final offer = spMap(m['offer']);
    return ScheduleWaitlistOffer(
      entryId: id ?? spStr(m['id'] ?? m['entryId']),
      arenaId: spStr(m['arenaId']),
      planId: spStr(m['planId']),
      planName: spStr(m['planName'], 'Plano de horário'),
      arenaName: spStr(m['arenaName']),
      weekdays: (spIntList(m['weekdays'])..sort()),
      startTime: spStr(m['startTime']),
      courtName: spStr(offer['courtName']),
      expiresAt: spDateTime(offer['expiresAt']),
      status: spStr(m['status'], 'offered'),
    );
  }
}

class MyScheduleSubscriptions {
  const MyScheduleSubscriptions({
    this.subscriptions = const [],
    this.offers = const [],
  });

  final List<ScheduleSubscription> subscriptions;
  final List<ScheduleWaitlistOffer> offers;

  bool get isEmpty => subscriptions.isEmpty && offers.isEmpty;

  factory MyScheduleSubscriptions.fromMap(Map<String, dynamic> m) =>
      MyScheduleSubscriptions(
        subscriptions: [
          for (final s in spMapList(m['subscriptions']))
            ScheduleSubscription.fromMap(s),
        ],
        offers: [
          for (final o in spMapList(m['offers']))
            ScheduleWaitlistOffer.fromMap(o),
        ]..removeWhere((o) => !o.isOffered),
      );
}

// ── Respostas das callables ──────────────────────────────────────────────

/// `skipArenaScheduleOccurrence` → `{creditId|null, reason}`.
enum ScheduleSkipReason { granted, lateNotice, monthlyLimit, disabled }

class ScheduleSkipResult {
  const ScheduleSkipResult({this.creditId, required this.reason});

  final String? creditId;
  final ScheduleSkipReason reason;

  factory ScheduleSkipResult.fromMap(Map<String, dynamic> m) {
    final creditId = spStrOrNull(m['creditId']);
    final reason = switch (spStr(m['reason'])) {
      'granted' => ScheduleSkipReason.granted,
      'late_notice' => ScheduleSkipReason.lateNotice,
      'monthly_limit' => ScheduleSkipReason.monthlyLimit,
      'disabled' => ScheduleSkipReason.disabled,
      _ => creditId != null
          ? ScheduleSkipReason.granted
          : ScheduleSkipReason.disabled,
    };
    return ScheduleSkipResult(creditId: creditId, reason: reason);
  }
}

class ScheduleMakeupOption {
  const ScheduleMakeupOption({
    required this.courtId,
    required this.courtName,
    required this.startTime,
    required this.endTime,
  });

  final String courtId;
  final String courtName;
  final String startTime;
  final String endTime;

  factory ScheduleMakeupOption.fromMap(Map<String, dynamic> m) =>
      ScheduleMakeupOption(
        courtId: spStr(m['courtId']),
        courtName: spStr(m['courtName'], 'Quadra'),
        startTime: spStr(m['startTime'], '00:00'),
        endTime: spStr(m['endTime'], '00:00'),
      );
}

/// `subscribeArenaSchedulePlan` → `{subscriptionId, courtName, firstCharge}`.
class ScheduleSubscribeResult {
  const ScheduleSubscribeResult({
    required this.subscriptionId,
    this.courtName = '',
    this.firstChargeId,
    this.firstChargeReais,
    this.firstChargeDueDate,
    this.firstChargeMonths = 1,
    this.pendingPayment = false,
    this.paymentDeadline,
  });

  final String subscriptionId;
  final String courtName;

  /// Mensalidades na 1ª cobrança (anual à vista = 12).
  final int firstChargeMonths;

  /// Assinou com Pix/cartão: só vira assinante pagando até [paymentDeadline].
  final bool pendingPayment;
  final DateTime? paymentDeadline;

  /// Mensalidade do atleta na 1ª cobrança (o app leva direto ao pagamento).
  final String? firstChargeId;
  final double? firstChargeReais;
  final DateTime? firstChargeDueDate;

  factory ScheduleSubscribeResult.fromMap(Map<String, dynamic> m) {
    final first = m['firstCharge'];
    final firstMap = spMap(first);
    return ScheduleSubscribeResult(
      subscriptionId: spStr(m['subscriptionId']),
      courtName: spStr(m['courtName']),
      firstChargeId: spStr(firstMap['chargeId']).isEmpty
          ? null
          : spStr(firstMap['chargeId']),
      firstChargeReais: first is num
          ? first.toDouble()
          : spDoubleOrNull(firstMap['amountReais']),
      firstChargeDueDate: spDate(firstMap['dueDate']),
      firstChargeMonths: spInt(firstMap['months'], 1),
      pendingPayment: spStr(m['status']) == 'pending_payment',
      paymentDeadline: spDateTime(m['paymentDeadline']),
    );
  }
}

/// Tela de pagamento da mensalidade: link da fatura (cartão, no checkout do
/// Asaas) e, no Pix, o QR da mesma cobrança.
class ScheduleCheckout {
  const ScheduleCheckout({
    required this.invoiceUrl,
    this.amountReais = 0,
    this.qrCode,
    this.qrCodeBase64,
    this.chargedReais,
    this.cardFeeReais = 0,
    this.pixAmountReais,
    this.pixDiscountPercent = 0,
  });

  final String invoiceUrl;

  /// Valor do plano (o cartão parte dele).
  final double amountReais;

  /// Fatura com desconto no Pix: o que o Pix cobra. `null` = sem desconto.
  final double? pixAmountReais;
  final int pixDiscountPercent;

  /// O que o QR do Pix cobra.
  double get pixReais => pixAmountReais ?? amountReais;

  /// Cartão: o que vai para o cartão (plano + taxas do cartão). Ausente
  /// (Pix, servidor antigo) = [amountReais].
  final double? chargedReais;

  /// Taxas do cartão (processamento e antecipação), já dentro de [chargedReais].
  final double cardFeeReais;

  /// Pix copia-e-cola.
  final String? qrCode;
  final String? qrCodeBase64;

  bool get hasPix => (qrCode ?? '').isNotEmpty;

  factory ScheduleCheckout.fromMap(Map<String, dynamic> m) => ScheduleCheckout(
        invoiceUrl: spStr(m['invoiceUrl']),
        amountReais: spDouble(m['amountReais']),
        qrCode: spStrOrNull(m['qrCode']),
        qrCodeBase64: spStrOrNull(m['qrCodeBase64']),
        chargedReais: spDoubleOrNull(m['chargedReais']),
        cardFeeReais: spDouble(m['cardFeeReais']),
        pixAmountReais: spDoubleOrNull(m['pixAmountReais']),
        pixDiscountPercent: spInt(m['pixDiscountPercent']),
      );
}
