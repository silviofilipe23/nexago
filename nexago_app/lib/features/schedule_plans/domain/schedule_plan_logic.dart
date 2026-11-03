// Regras puras das telas do atleta dos Planos de horário (A1–A3).

import 'schedule_plan_models.dart';

const _weekdayShort = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
const _weekdayLong = [
  'Segunda',
  'Terça',
  'Quarta',
  'Quinta',
  'Sexta',
  'Sábado',
  'Domingo',
];
const _monthLong = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
];

/// "Seg" (1) … "Dom" (7).
String scheduleWeekdayShort(int weekday) =>
    weekday >= 1 && weekday <= 7 ? _weekdayShort[weekday - 1] : '';

/// "Segunda" (1) … "Domingo" (7).
String scheduleWeekdayLong(int weekday) =>
    weekday >= 1 && weekday <= 7 ? _weekdayLong[weekday - 1] : '';

String scheduleMonthLong(int month) =>
    month >= 1 && month <= 12 ? _monthLong[month - 1] : '';

/// "Ter e Qui", "Seg, Qua e Sex".
String scheduleWeekdaysList(Iterable<int> weekdays, {bool long = false}) {
  final names = [
    for (final w in (weekdays.toSet().toList()..sort()))
      long ? scheduleWeekdayLong(w) : scheduleWeekdayShort(w),
  ]..removeWhere((s) => s.isEmpty);
  if (names.isEmpty) return '';
  if (names.length == 1) return names.first;
  return '${names.sublist(0, names.length - 1).join(', ')} e ${names.last}';
}

/// 60 → "1h", 90 → "1h30", 45 → "45 min".
String scheduleDurationLabel(int minutes) {
  if (minutes <= 0) return '';
  if (minutes < 60) return '$minutes min';
  final h = minutes ~/ 60;
  final m = minutes % 60;
  return m == 0 ? '${h}h' : '${h}h${m.toString().padLeft(2, '0')}';
}

/// "18:00" → "18h", "18:30" → "18h30".
String scheduleHourLabel(String hhmm) {
  final parts = hhmm.split(':');
  if (parts.length < 2) return hhmm;
  final h = int.tryParse(parts[0]) ?? 0;
  final m = int.tryParse(parts[1]) ?? 0;
  return m == 0 ? '${h}h' : '${h}h${m.toString().padLeft(2, '0')}';
}

/// Minutos desde 00:00 de "HH:MM"; -1 se inválido.
int scheduleMinutesOf(String hhmm) {
  final parts = hhmm.split(':');
  if (parts.length < 2) return -1;
  final h = int.tryParse(parts[0]);
  final m = int.tryParse(parts[1]);
  if (h == null || m == null) return -1;
  return h * 60 + m;
}

String _weekdayRange(List<int> days) {
  final sorted = days.toSet().toList()..sort();
  if (sorted.isEmpty) return '';
  if (sorted.length == 1) return scheduleWeekdayShort(sorted.first);
  final contiguous = sorted.last - sorted.first == sorted.length - 1;
  if (contiguous && sorted.length >= 3) {
    return '${scheduleWeekdayShort(sorted.first)}–${scheduleWeekdayShort(sorted.last)}';
  }
  return sorted.map(scheduleWeekdayShort).join(', ');
}

/// Resumo das janelas do plano: "Seg–Sex, 18h–23h"; janelas com horários
/// diferentes viram grupos separados por " · ".
String scheduleWindowsSummary(List<SchedulePlanWindow> windows) {
  if (windows.isEmpty) return '';
  final groups = <String, List<int>>{};
  for (final w in windows) {
    groups.putIfAbsent('${w.startTime}|${w.endTime}', () => []).add(w.weekday);
  }
  final entries = groups.entries.toList()
    ..sort((a, b) => (a.value..sort()).first.compareTo((b.value..sort()).first));
  return entries.map((e) {
    final [start, end] = e.key.split('|');
    return '${_weekdayRange(e.value)}, '
        '${scheduleHourLabel(start)}–${scheduleHourLabel(end)}';
  }).join(' · ');
}

/// "2x por semana · 1h · Seg–Sex, 18h–23h".
String schedulePlanSubtitle(SchedulePlan plan) {
  return [
    '${plan.timesPerWeek}x por semana',
    scheduleDurationLabel(plan.durationMinutes),
    scheduleWindowsSummary(plan.windows),
  ].where((s) => s.isNotEmpty).join(' · ');
}

/// Desconto do plano contra o avulso: 1 − mensal ÷ (avulso/h × horas ×
/// vezes por semana × 52/12), em % arredondado. `null` sem preço de
/// referência ou quando o plano não sai mais barato.
int? scheduleDiscountVsSinglePercent({
  required double monthlyPriceReais,
  required double? referenceHourlyReais,
  required int durationMinutes,
  required int timesPerWeek,
}) {
  final ref = referenceHourlyReais;
  if (ref == null || ref <= 0 || durationMinutes <= 0 || timesPerWeek <= 0) {
    return null;
  }
  final singleMonthly = ref * (durationMinutes / 60) * timesPerWeek * 52 / 12;
  if (singleMonthly <= 0) return null;
  final off = ((1 - monthlyPriceReais / singleMonthly) * 100).round();
  return off > 0 ? off : null;
}

int? schedulePlanDiscountPercent(SchedulePlan plan) =>
    scheduleDiscountVsSinglePercent(
      monthlyPriceReais: plan.monthlyPriceReais,
      referenceHourlyReais: plan.referenceHourlyReais,
      durationMinutes: plan.durationMinutes,
      timesPerWeek: plan.timesPerWeek,
    );

/// Vagas restantes (assinaturas): capacidade − ocupadas, nunca negativo.
int scheduleSpotsLeft(SchedulePlan plan) {
  final left = plan.capacity - plan.occupiedCount;
  return left < 0 ? 0 : left;
}

enum ScheduleSpotsTone { normal, few, full }

/// "12 vagas", "Últimas 3 vagas" (≤ 6, amarelo), "Lotado · entrar na fila".
(String, ScheduleSpotsTone) scheduleSpotsLabel(int left) {
  if (left <= 0) return ('Lotado · entrar na fila', ScheduleSpotsTone.full);
  if (left == 1) return ('Última vaga', ScheduleSpotsTone.few);
  if (left <= 6) return ('Últimas $left vagas', ScheduleSpotsTone.few);
  return ('$left vagas', ScheduleSpotsTone.normal);
}

double _roundCents(double v) => (v * 100).round() / 100;

/// Mensal do ciclo, com o desconto do ciclo sobre o mensal.
double scheduleCycleMonthlyPrice(
  double monthlyPriceReais,
  SchedulePlanCycleOption option,
) {
  final discount =
      option.cycle == SchedulePlanCycle.monthly ? 0 : option.discountPercent;
  return _roundCents(monthlyPriceReais * (1 - discount / 100));
}

/// Parte de cada um no rateio: mensal ÷ jogadores, em centavos.
double scheduleSharePerPlayer(double monthlyPriceReais, int players) {
  if (players <= 1) return _roundCents(monthlyPriceReais);
  return _roundCents(monthlyPriceReais / players);
}

/// Dias da semana que dá para escolher: os da disponibilidade (ou, sem ela,
/// os das janelas do plano), sem repetição e em ordem.
List<int> scheduleSelectableWeekdays(
  SchedulePlan plan,
  List<SchedulePlanDayAvailability> days,
) {
  final source = days.isNotEmpty
      ? days.map((d) => d.weekday)
      : plan.windows.map((w) => w.weekday);
  return (source.where((w) => w >= 1 && w <= 7).toSet().toList()..sort());
}

/// Horário que vale para todos os dias escolhidos: quadras livres é o MENOR
/// dos dias (a mesma quadra precisa estar livre em todos), fila é a MAIOR e
/// nobre é se algum dia for nobre.
class ScheduleCombinedTime {
  const ScheduleCombinedTime({
    required this.startTime,
    required this.endTime,
    required this.freeCourts,
    required this.waitlistCount,
    required this.prime,
  });

  final String startTime;
  final String endTime;
  final int freeCourts;
  final int waitlistCount;
  final bool prime;

  /// Livre para assinar: tem quadra e não esbarra no limite do nobre.
  bool bookable({required bool primeCapReached}) =>
      freeCourts > 0 && !(prime && primeCapReached);
}

/// Horários presentes em TODOS os [weekdays], em ordem de início.
List<ScheduleCombinedTime> scheduleTimesForWeekdays(
  List<SchedulePlanDayAvailability> days,
  Iterable<int> weekdays,
) {
  final chosen = weekdays.toSet();
  if (chosen.isEmpty) return const [];
  final byDay = {for (final d in days) d.weekday: d};
  if (!chosen.every(byDay.containsKey)) return const [];
  final perDay = [
    for (final w in chosen)
      {for (final t in byDay[w]!.times) t.startTime: t},
  ];
  final starts = perDay.first.keys
      .where((s) => perDay.every((m) => m.containsKey(s)))
      .toList()
    ..sort((a, b) => scheduleMinutesOf(a).compareTo(scheduleMinutesOf(b)));
  return [
    for (final s in starts)
      () {
        final options = perDay.map((m) => m[s]!).toList();
        return ScheduleCombinedTime(
          startTime: s,
          endTime: options.first.endTime,
          freeCourts: options
              .map((o) => o.freeCourts)
              .reduce((a, b) => a < b ? a : b)
              .clamp(0, 1 << 30),
          waitlistCount: options
              .map((o) => o.waitlistCount)
              .reduce((a, b) => a > b ? a : b),
          prime: options.any((o) => o.prime),
        );
      }(),
  ];
}

/// "1 quadra", "3 quadras".
String scheduleFreeCourtsLabel(int n) => n == 1 ? '1 quadra' : '$n quadras';

// ── Meu plano (A3) ──────────────────────────────────────────────────────

DateTime _day(DateTime d) => DateTime(d.year, d.month, d.day);

/// Estado da ocorrência: o do servidor; sem ele, pela data (passada = feita,
/// hoje, futura = próxima).
ScheduleOccurrenceState scheduleOccurrenceState(
  ScheduleOccurrence o,
  DateTime now,
) {
  final raw = o.rawState;
  if (raw != null) return raw;
  final today = _day(now);
  final day = _day(o.date);
  if (day.isBefore(today)) return ScheduleOccurrenceState.done;
  if (day == today) return ScheduleOccurrenceState.today;
  return ScheduleOccurrenceState.next;
}

/// Início da ocorrência no fuso local.
DateTime scheduleOccurrenceStart(ScheduleOccurrence o) {
  final m = scheduleMinutesOf(o.startTime);
  return DateTime(o.date.year, o.date.month, o.date.day)
      .add(Duration(minutes: m < 0 ? 0 : m));
}

/// Próxima ocorrência para o destaque: a de hoje ou a próxima que não foi
/// desmarcada (reposição conta). `null` sem nenhuma.
ScheduleOccurrence? scheduleHeroOccurrence(
  List<ScheduleOccurrence> occurrences,
  DateTime now,
) {
  final today = _day(now);
  for (final o in occurrences) {
    final state = scheduleOccurrenceState(o, now);
    if (_day(o.date).isBefore(today)) continue;
    if (state == ScheduleOccurrenceState.today ||
        state == ScheduleOccurrenceState.next ||
        state == ScheduleOccurrenceState.makeup) {
      return o;
    }
  }
  return null;
}

/// Ocorrências que ainda dá para desmarcar ("Não vou nesta semana"): de hoje
/// em diante, que ainda não começaram e não foram desmarcadas.
List<ScheduleOccurrence> scheduleSkippableOccurrences(
  List<ScheduleOccurrence> occurrences,
  DateTime now,
) {
  return [
    for (final o in occurrences)
      if ((scheduleOccurrenceState(o, now) == ScheduleOccurrenceState.today ||
              scheduleOccurrenceState(o, now) ==
                  ScheduleOccurrenceState.next) &&
          scheduleOccurrenceStart(o).isAfter(now))
        o,
  ];
}

/// Aviso em cima da hora: falta menos que [noticeHours] para começar (o
/// servidor cancela sem crédito).
bool scheduleIsLateNotice(
  ScheduleOccurrence o,
  DateTime now, {
  required int noticeHours,
}) {
  final start = scheduleOccurrenceStart(o);
  return start.difference(now) < Duration(hours: noticeHours);
}

/// Créditos de reposição ainda usáveis, o que vence primeiro na frente.
List<ScheduleCredit> scheduleAvailableCredits(
  List<ScheduleCredit> credits,
  DateTime now,
) {
  final today = _day(now);
  final list = credits
      .where((c) =>
          c.status == 'available' &&
          (c.expiresOn == null || !c.expiresOn!.isBefore(today)))
      .toList()
    ..sort((a, b) {
      final ae = a.expiresOn, be = b.expiresOn;
      if (ae == null && be == null) return 0;
      if (ae == null) return 1;
      if (be == null) return -1;
      return ae.compareTo(be);
    });
  return list;
}

/// Dias de pausa que sobram no ano corrente. O uso gravado de outro ano não
/// conta (o limite é por ano civil).
int schedulePauseDaysLeft(ScheduleSubscription sub, DateTime now) {
  final max = sub.rules.pauseMaxDaysPerYear;
  final used = sub.pauseDaysUsedYear == '${now.year}' ? sub.pauseDaysUsed : 0;
  final left = max - used;
  return left < 0 ? 0 : left;
}

/// Quem está vendo é o titular (só ele troca horário e pausa).
bool scheduleIsHolder(ScheduleSubscription sub, String uid) {
  if (uid.isEmpty) return false;
  if (sub.holderAthleteId != null) return sub.holderAthleteId == uid;
  return sub.members.any((m) => m.isHolder && m.athleteId == uid);
}

/// O titular pode cancelar: plano vivo e ainda sem data de saída.
bool scheduleCanCancel(ScheduleSubscription sub, String uid) =>
    scheduleIsHolder(sub, uid) &&
    sub.endsOn == null &&
    sub.status != ScheduleSubscriptionStatus.canceled;

/// Prévia do 1º dia sem o plano quando o titular cancela (o servidor decide,
/// `athleteExitDate`): fim do mês corrente, do último mês pago ou do mês em
/// que a fidelidade termina — o que vier depois.
DateTime scheduleAthleteExitDate(ScheduleSubscription sub, DateTime now) {
  var last = DateTime(now.year, now.month);
  for (final c in sub.charges.where((c) => c.isPaid)) {
    final parts = c.period.split('-');
    final y = parts.length == 2 ? int.tryParse(parts[0]) : null;
    final m = parts.length == 2 ? int.tryParse(parts[1]) : null;
    if (y == null || m == null) continue;
    final month = DateTime(y, m);
    if (month.isAfter(last)) last = month;
  }
  final commitment = sub.commitmentEndsOn;
  if (commitment != null && _day(commitment).isAfter(_day(now))) {
    final lastDay =
        DateTime(commitment.year, commitment.month, commitment.day - 1);
    final month = DateTime(lastDay.year, lastDay.month);
    if (month.isAfter(last)) last = month;
  }
  return DateTime(last.year, last.month + 1);
}

/// Parte do atleta na mensalidade (rateio); sem o membro, o mensal inteiro.
double scheduleMyShare(ScheduleSubscription sub, String uid) {
  for (final m in sub.members) {
    if (m.athleteId == uid && m.shareReais > 0) return m.shareReais;
  }
  if (sub.members.length > 1) {
    return scheduleSharePerPlayer(sub.monthlyPriceReais, sub.members.length);
  }
  return sub.monthlyPriceReais;
}

/// Próxima mensalidade em aberto do atleta (a de vencimento mais cedo).
ScheduleCharge? scheduleNextOpenCharge(
  List<ScheduleCharge> charges,
  String uid,
) {
  final open = charges
      .where((c) =>
          c.isOpen &&
          (c.payerAthleteId == null || uid.isEmpty || c.payerAthleteId == uid))
      .toList()
    ..sort((a, b) {
      final ad = a.dueDate, bd = b.dueDate;
      if (ad == null && bd == null) return a.period.compareTo(b.period);
      if (ad == null) return 1;
      if (bd == null) return -1;
      return ad.compareTo(bd);
    });
  return open.isEmpty ? null : open.first;
}

/// Dias de atraso da mensalidade (0 = em dia).
int scheduleOverdueDays(ScheduleCharge charge, DateTime now) {
  final due = charge.dueDate;
  if (due == null || !charge.isOpen) return 0;
  final diff = _day(now).difference(_day(due)).inDays;
  return diff > 0 ? diff : 0;
}

// ── Cobrança online (link mensal Pix ou cartão) ─────────────────────────

/// Mensalidade que o atleta paga pelo app ("Pagar" → fatura).
bool scheduleCanPayOnline(ScheduleCharge charge) =>
    charge.isOpen && charge.isOnline;

/// Selo da mensalidade paga online: "Pago · Pix", "Pago · Cartão" ou
/// "Pago online" (outra forma do Asaas). `null` se não foi paga online.
String? schedulePaidOnlineLabel(ScheduleCharge charge) {
  if (!charge.isPaidOnline) return null;
  return switch (charge.onlineBillingType) {
    'PIX' => 'Pago · Pix',
    'CREDIT_CARD' || 'DEBIT_CARD' => 'Pago · Cartão',
    _ => 'Pago online',
  };
}

/// Última mensalidade paga do atleta (a de vencimento mais tarde; sem data,
/// o período decide).
ScheduleCharge? scheduleLastPaidCharge(
  List<ScheduleCharge> charges,
  String uid,
) {
  final paid = charges
      .where((c) =>
          c.isPaid &&
          (c.payerAthleteId == null || uid.isEmpty || c.payerAthleteId == uid))
      .toList()
    ..sort((a, b) {
      final ad = a.dueDate, bd = b.dueDate;
      if (ad != null && bd != null && ad != bd) return ad.compareTo(bd);
      return a.period.compareTo(b.period);
    });
  return paid.isEmpty ? null : paid.last;
}

/// Forma de pagamento ao lado da mensalidade: online → "Pix ou cartão";
/// manual decidido → "Pague na arena"; senão (a decidir, antiga, sem
/// mensalidade) a forma escolhida na assinatura.
String scheduleChargeMethodLabel(
  SchedulePaymentMethod method,
  ScheduleCharge? charge,
) {
  if (charge != null && charge.isOnline) return 'Pix ou cartão';
  if (charge != null && charge.billingMode == 'manual') {
    return 'Pague na arena';
  }
  return method.label;
}

/// Nota sob as formas de pagamento na assinatura (A2).
String scheduleMethodNote(
  SchedulePaymentMethod method, {
  required bool onlineBilling,
}) {
  if (method == SchedulePaymentMethod.onsite) {
    return 'Você paga direto na arena, que dá baixa a cada mês.';
  }
  return onlineBilling
      ? 'Pix ou cartão: ao assinar você já paga a 1ª mensalidade. Depois, '
          'todo mês o link de pagamento chega no app.'
      : 'Combine o pagamento com a arena, que dá baixa a cada mês.';
}

/// Mensalidade que o titular paga para confirmar a assinatura aguardando
/// pagamento (a 1ª dele, em aberto).
ScheduleCharge? schedulePendingFirstCharge(
  ScheduleSubscription sub,
  String uid,
) {
  if (sub.status != ScheduleSubscriptionStatus.pendingPayment) return null;
  return scheduleNextOpenCharge(sub.charges, uid);
}

/// Assinatura do titular [uid] aguardando pagamento. Enquanto existir, ele não
/// assina outro plano (o servidor recusa): paga ou desiste antes.
ScheduleSubscription? scheduleMyPendingPayment(
  List<ScheduleSubscription> subs,
  String uid,
) {
  for (final s in subs) {
    if (s.status == ScheduleSubscriptionStatus.pendingPayment &&
        s.holderAthleteId == uid) {
      return s;
    }
  }
  return null;
}

/// "14:32" do prazo de pagamento.
String scheduleClock(DateTime d) {
  final local = d.toLocal();
  return '${local.hour.toString().padLeft(2, '0')}:'
      '${local.minute.toString().padLeft(2, '0')}';
}

/// Frases sob a faixa do mês para as desmarcadas: "Dia 10 você avisou que
/// não vai. Ganhou 1 reposição."
List<String> scheduleSkippedExplanations(
  ScheduleSubscription sub,
  DateTime now,
) {
  final lines = <String>[];
  for (final o in sub.occurrences) {
    if (scheduleOccurrenceState(o, now) != ScheduleOccurrenceState.skipped) {
      continue;
    }
    ScheduleCredit? credit;
    for (final c in sub.credits) {
      final src = c.sourceDate;
      if (src != null && _day(src) == _day(o.date)) {
        credit = c;
        break;
      }
    }
    final day = 'Dia ${o.date.day.toString().padLeft(2, '0')}';
    if (credit == null) {
      lines.add('$day ficou sem jogo, sem reposição.');
    } else if (credit.reason == 'holiday') {
      lines.add('$day é feriado. Ganhou 1 reposição.');
    } else if (credit.reason == 'skip') {
      lines.add('$day você avisou que não vai. Ganhou 1 reposição.');
    } else {
      lines.add('$day a arena cancelou. Ganhou 1 reposição.');
    }
  }
  return lines;
}

/// "dd/mm".
String scheduleDayMonth(DateTime d) =>
    '${d.day.toString().padLeft(2, '0')}/${d.month.toString().padLeft(2, '0')}';

/// Mensagem do resultado de "Não vou nesta semana".
String scheduleSkipResultMessage(
  ScheduleSkipResult result, {
  required int noticeHours,
}) {
  return switch (result.reason) {
    ScheduleSkipReason.granted =>
      'Pronto, você não vai nesta semana. Ganhou 1 reposição.',
    ScheduleSkipReason.lateNotice =>
      'Horário liberado. Como o aviso veio com menos de ${noticeHours}h, '
          'não gera reposição.',
    ScheduleSkipReason.monthlyLimit =>
      'Horário liberado. Você já usou o limite de reposições do mês.',
    ScheduleSkipReason.disabled =>
      'Horário liberado. Este plano não tem reposição.',
  };
}

/// Fim de um horário que começa em [start] e dura [durationMinutes]: "HH:MM".
String scheduleEndTime(String start, int durationMinutes) {
  final m = scheduleMinutesOf(start);
  if (m < 0) return start;
  final end = (m + durationMinutes) % (24 * 60);
  return '${(end ~/ 60).toString().padLeft(2, '0')}:'
      '${(end % 60).toString().padLeft(2, '0')}';
}

/// Escolha de dias com limite: toca num marcado = desmarca; com o limite
/// cheio, o mais antigo sai para o novo entrar (com 1 dia, troca direto).
List<int> scheduleToggleWeekday(List<int> current, int weekday, int limit) {
  if (current.contains(weekday)) {
    return [...current]..remove(weekday);
  }
  final next = [...current, weekday];
  while (limit > 0 && next.length > limit) {
    next.removeAt(0);
  }
  return next;
}
