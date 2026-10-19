import '../../../../core/formatting/app_currency_format.dart';
import 'arena_class.dart';
import 'arena_class_enrollment.dart';
import 'arena_class_logic.dart';
import 'arena_class_session.dart';

// Regras puras da fase 2 de Aulas no app da arena: mensalidades (atraso,
// totais do mês), vaga por dia na matrícula, reposição para encaixar,
// frequência do aluno e textos de WhatsApp. Sem Flutter/Firestore — tudo
// testável com `todayKey` fixo.

const List<String> _monthShort = [
  'jan', 'fev', 'mar', 'abr', 'mai', 'jun', //
  'jul', 'ago', 'set', 'out', 'nov', 'dez',
];

const List<String> _monthLong = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', //
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
];

DateTime? _date(String key) {
  final d = DateTime.tryParse(key);
  return d == null ? null : DateTime(d.year, d.month, d.day);
}

/// Dias entre duas chaves `YYYY-MM-DD` (b − a), por calendário — imune a
/// horário de verão.
int arenaClassDaysBetween(String a, String b) {
  final da = _date(a), db = _date(b);
  if (da == null || db == null) return 0;
  return DateTime.utc(db.year, db.month, db.day)
      .difference(DateTime.utc(da.year, da.month, da.day))
      .inDays;
}

/// "05 nov" de `2026-11-05`.
String arenaClassShortDate(String dateKey) {
  final d = _date(dateKey);
  if (d == null) return dateKey;
  return '${d.day.toString().padLeft(2, '0')} ${_monthShort[d.month - 1]}';
}

/// "05/11" de `2026-11-05`.
String arenaClassDdMm(String dateKey) {
  final d = _date(dateKey);
  if (d == null) return dateKey;
  return '${d.day.toString().padLeft(2, '0')}/'
      '${d.month.toString().padLeft(2, '0')}';
}

/// "outubro" do mês de [dateKey].
String arenaClassMonthName(String dateKey) {
  final d = _date(dateKey);
  return d == null ? '' : _monthLong[d.month - 1];
}

/// "mar 2026" do mês de [dateKey] ("desde mar 2026").
String arenaClassMonthYear(String dateKey) {
  final d = _date(dateKey);
  return d == null ? '' : '${_monthShort[d.month - 1]} ${d.year}';
}

/// `2026-10-01` — primeiro dia do mês de [dateKey].
String arenaClassMonthStart(String dateKey) =>
    dateKey.length >= 7 ? '${dateKey.substring(0, 7)}-01' : dateKey;

// ---------------------------------------------------------------------------
// Planos
// ---------------------------------------------------------------------------

/// "2x por semana · 2 reposições/mês" / "8 aulas · validade 60 dias".
String arenaClassPlanDetail(ArenaClassPlan p) {
  switch (p.kind) {
    case ArenaClassPlanKind.monthly:
      final perWeek = p.classesPerWeek ?? 1;
      final makeups = p.makeupsPerMonth ?? 0;
      final makeupLabel = switch (makeups) {
        0 => 'sem reposição',
        1 => '1 reposição/mês',
        _ => '$makeups reposições/mês',
      };
      return '${perWeek}x por semana · $makeupLabel';
    case ArenaClassPlanKind.package:
      final credits = p.credits ?? 0;
      return '$credits aula${credits == 1 ? '' : 's'} · '
          'validade ${p.validityDays ?? 30} dias';
    case ArenaClassPlanKind.single:
      return 'Aula avulsa';
  }
}

/// "R$ 320/mês" (mensal) ou "R$ 360" (pacote). Centavos só quando há.
String arenaClassPlanPrice(ArenaClassPlan p) {
  final v = p.priceReais;
  final money = v == v.roundToDouble() ? formatBRLWhole(v) : formatBRL(v);
  return p.kind == ArenaClassPlanKind.monthly ? '$money/mês' : money;
}

/// Planos que viram matrícula (mensal e pacote ativos), mensais primeiro e
/// depois pelo valor.
List<ArenaClassPlan> arenaClassEnrollablePlans(List<ArenaClassPlan> plans) {
  final list = plans.where((p) => p.isEnrollable).toList();
  list.sort((a, b) {
    final byKind = a.kind.index.compareTo(b.kind.index);
    if (byKind != 0) return byKind;
    final byWeek = (a.classesPerWeek ?? 0).compareTo(b.classesPerWeek ?? 0);
    if (byWeek != 0) return byWeek;
    return a.priceReais.compareTo(b.priceReais);
  });
  return list;
}

// ---------------------------------------------------------------------------
// Matrícula: horários com vaga por dia da semana
// ---------------------------------------------------------------------------

/// Um horário escolhível na matrícula: turma × dia da semana.
class ArenaClassSlotOption {
  const ArenaClassSlotOption({
    required this.cls,
    required this.weekday,
    required this.taken,
  });

  final ArenaClass cls;

  /// ISO 1=seg … 7=dom.
  final int weekday;

  /// Alunos ativos da turma que fazem esse dia.
  final int taken;

  int get free {
    final f = cls.capacity - taken;
    return f < 0 ? 0 : f;
  }

  bool get isFull => free == 0;

  ArenaClassEnrollmentSlot get slot =>
      ArenaClassEnrollmentSlot(classId: cls.id, weekday: weekday);
}

/// Alunos ativos que ocupam a turma em [weekday], sem contar [excludeId] (o
/// próprio aluno sendo matriculado). Mesma conta de `planEnrollment`.
int arenaClassTakenOn(
  List<ArenaClassStudent> students,
  int weekday, {
  String? excludeId,
}) =>
    arenaClassRegularsOn(students, weekday)
        .where((s) => s.id != excludeId)
        .length;

/// Horários da matrícula: cada dia de cada turma recorrente ativa, com a vaga
/// daquele dia. Ordem: dia da semana, horário, nome.
List<ArenaClassSlotOption> arenaClassSlotOptions({
  required List<ArenaClass> classes,
  required Map<String, List<ArenaClassStudent>> studentsByClass,
  String? excludeStudentId,
}) {
  final options = <ArenaClassSlotOption>[
    for (final c in classes)
      if (c.isActive && !c.isSingle)
        for (final day in c.weekdays)
          ArenaClassSlotOption(
            cls: c,
            weekday: day,
            taken: arenaClassTakenOn(
              studentsByClass[c.id] ?? const [],
              day,
              excludeId: excludeStudentId,
            ),
          ),
  ];
  options.sort((a, b) {
    final byDay = a.weekday.compareTo(b.weekday);
    if (byDay != 0) return byDay;
    final byTime = a.cls.startTime.compareTo(b.cls.startTime);
    if (byTime != 0) return byTime;
    return a.cls.name.toLowerCase().compareTo(b.cls.name.toLowerCase());
  });
  return options;
}

/// Quantos horários o plano pede: o mensal exige exatamente as aulas por
/// semana; o pacote aceita de 1 a 7.
({int min, int max}) arenaClassSlotsRequired(ArenaClassPlan plan) {
  if (plan.kind == ArenaClassPlanKind.monthly) {
    final n = (plan.classesPerWeek ?? 1).clamp(1, 7);
    return (min: n, max: n);
  }
  return (min: 1, max: 7);
}

/// Título do passo 3 ("Escolha 2 horários" / "Escolha os horários").
String arenaClassSlotsTitle(ArenaClassPlan? plan) {
  if (plan == null || plan.kind != ArenaClassPlanKind.monthly) {
    return 'Escolha os horários';
  }
  final n = arenaClassSlotsRequired(plan).min;
  return 'Escolha $n horário${n == 1 ? '' : 's'}';
}

/// "Seg e Qua · 07:00" — agrupa por turma e horário; turmas diferentes
/// saem separadas por " / " com o nome na frente.
String arenaClassSlotsLabel(
  List<ArenaClassEnrollmentSlot> slots, {
  bool withClassName = false,
}) {
  if (slots.isEmpty) return '—';
  final groups = <String, List<ArenaClassEnrollmentSlot>>{};
  for (final s in slots) {
    groups.putIfAbsent('${s.classId}|${s.startTime}', () => []).add(s);
  }
  final showName = withClassName ||
      groups.values.map((g) => g.first.classId).toSet().length > 1;
  return groups.values.map((g) {
    final days = [...g]..sort((a, b) => a.weekday.compareTo(b.weekday));
    final names = days.map((s) => arenaClassWeekdayShort(s.weekday)).toList();
    final joined = names.length == 1
        ? names.first
        : '${names.sublist(0, names.length - 1).join(', ')} e ${names.last}';
    final time = g.first.startTime.isEmpty ? '' : ' · ${g.first.startTime}';
    return showName ? '${g.first.className} · $joined$time' : '$joined$time';
  }).join(' / ');
}

/// Primeira aula da matrícula: o próximo horário a partir de agora. Hoje só
/// conta se a aula ainda não começou ([nowHm] `HH:mm`; sem ele, hoje vale).
({String date, ArenaClassEnrollmentSlot slot})? arenaClassFirstLesson(
  List<ArenaClassEnrollmentSlot> slots,
  String todayKey, {
  String? nowHm,
}) {
  final today = _date(todayKey);
  if (today == null || slots.isEmpty) return null;
  for (var i = 0; i < 8; i++) {
    final d = DateTime(today.year, today.month, today.day + i);
    final key = '${d.year}-${d.month.toString().padLeft(2, '0')}-'
        '${d.day.toString().padLeft(2, '0')}';
    final ofDay = slots
        .where((s) =>
            s.weekday == d.weekday &&
            (i > 0 || nowHm == null || s.startTime.compareTo(nowHm) > 0))
        .toList()
      ..sort((a, b) => a.startTime.compareTo(b.startTime));
    if (ofDay.isNotEmpty) return (date: key, slot: ofDay.first);
  }
  return null;
}

// ---------------------------------------------------------------------------
// Mensalidades
// ---------------------------------------------------------------------------

/// Abas da tela de Mensalidades.
enum ArenaClassChargesTab { overdue, upcoming, paid }

/// Em aberto e já passou do vencimento (vencer hoje ainda não é atraso).
bool arenaClassChargeIsOverdue(ArenaClassCharge c, String todayKey) =>
    c.isOpen && c.dueDate.isNotEmpty && c.dueDate.compareTo(todayKey) < 0;

/// Dias de atraso (0 quando não está atrasada).
int arenaClassChargeDaysOverdue(ArenaClassCharge c, String todayKey) =>
    arenaClassChargeIsOverdue(c, todayKey)
        ? arenaClassDaysBetween(c.dueDate, todayKey)
        : 0;

/// Linha de status do cartão: "7 dias em atraso", "vence hoje",
/// "vence 05 nov", "pago 12 out · PIX".
String arenaClassChargeStatusLabel(ArenaClassCharge c, String todayKey) {
  if (c.isPaid) {
    final on = c.paidOn;
    return on == null
        ? 'pago · ${c.paymentMethod.label}'
        : 'pago ${arenaClassShortDate(on)} · ${c.paymentMethod.label}';
  }
  if (c.status == 'canceled') return 'cancelada';
  final late = arenaClassChargeDaysOverdue(c, todayKey);
  if (late > 0) return '$late dia${late == 1 ? '' : 's'} em atraso';
  if (c.dueDate == todayKey) return 'vence hoje';
  return 'vence ${arenaClassShortDate(c.dueDate)}';
}

/// Mensalidades do mês separadas por aba, com os totais do topo.
class ArenaClassChargesView {
  const ArenaClassChargesView({
    required this.overdue,
    required this.upcoming,
    required this.paid,
    required this.receivedReais,
    required this.toReceiveReais,
    required this.overdueReais,
  });

  /// Em aberto e vencidas — a que venceu há mais tempo primeiro.
  final List<ArenaClassCharge> overdue;

  /// Em aberto que ainda vão vencer (inclui hoje) — a mais próxima primeiro.
  final List<ArenaClassCharge> upcoming;

  /// Pagas no mês corrente — a mais recente primeiro.
  final List<ArenaClassCharge> paid;

  /// Soma do que foi registrado como pago neste mês (`paidOn` no mês).
  final double receivedReais;
  final double toReceiveReais;
  final double overdueReais;

  List<ArenaClassCharge> of(ArenaClassChargesTab tab) => switch (tab) {
        ArenaClassChargesTab.overdue => overdue,
        ArenaClassChargesTab.upcoming => upcoming,
        ArenaClassChargesTab.paid => paid,
      };
}

double _sum(Iterable<ArenaClassCharge> list) =>
    list.fold(0.0, (total, c) => total + c.amountReais);

/// [open]: cobranças `status == open` da arena; [paid]: `status == paid`
/// (a query já vem a partir do 1º do mês; aqui o corte é refeito para não
/// depender dela).
ArenaClassChargesView buildArenaClassChargesView({
  required List<ArenaClassCharge> open,
  required List<ArenaClassCharge> paid,
  required String todayKey,
}) {
  final monthStart = arenaClassMonthStart(todayKey);
  final overdue = <ArenaClassCharge>[];
  final upcoming = <ArenaClassCharge>[];
  for (final c in open) {
    if (!c.isOpen) continue;
    (arenaClassChargeIsOverdue(c, todayKey) ? overdue : upcoming).add(c);
  }
  int byDue(ArenaClassCharge a, ArenaClassCharge b) {
    final d = a.dueDate.compareTo(b.dueDate);
    return d != 0 ? d : a.name.toLowerCase().compareTo(b.name.toLowerCase());
  }

  overdue.sort(byDue);
  upcoming.sort(byDue);
  final paidThisMonth = paid
      .where((c) =>
          c.isPaid &&
          (c.paidOn ?? '').compareTo(monthStart) >= 0 &&
          (c.paidOn ?? '').compareTo(todayKey) <= 0)
      .toList()
    ..sort((a, b) => (b.paidOn ?? '').compareTo(a.paidOn ?? ''));
  return ArenaClassChargesView(
    overdue: overdue,
    upcoming: upcoming,
    paid: paidThisMonth,
    receivedReais: _sum(paidThisMonth),
    toReceiveReais: _sum(upcoming),
    overdueReais: _sum(overdue),
  );
}

/// Situação do aluno no topo da página dele.
enum ArenaClassStudentStanding { upToDate, dueToday, overdue, paused, noPlan }

extension ArenaClassStudentStandingX on ArenaClassStudentStanding {
  String get label => switch (this) {
        ArenaClassStudentStanding.upToDate => 'Em dia',
        ArenaClassStudentStanding.dueToday => 'Vence hoje',
        ArenaClassStudentStanding.overdue => 'Atrasado',
        ArenaClassStudentStanding.paused => 'Pausado',
        ArenaClassStudentStanding.noPlan => 'Sem plano',
      };
}

ArenaClassStudentStanding arenaClassStudentStanding({
  required ArenaClassEnrollment? enrollment,
  required List<ArenaClassCharge> charges,
  required String todayKey,
}) {
  // Dívida vem antes de tudo: pausar não perdoa o que venceu.
  if (charges.any((c) => arenaClassChargeIsOverdue(c, todayKey))) {
    return ArenaClassStudentStanding.overdue;
  }
  if (enrollment == null || !enrollment.isCurrent) {
    return ArenaClassStudentStanding.noPlan;
  }
  if (enrollment.isPaused) return ArenaClassStudentStanding.paused;
  if (charges.any((c) => c.isOpen && c.dueDate == todayKey)) {
    return ArenaClassStudentStanding.dueToday;
  }
  return ArenaClassStudentStanding.upToDate;
}

/// Primeiro nome ("Carla Dias" → "Carla").
String arenaClassFirstName(String name) {
  final parts = name.trim().split(RegExp(r'\s+'));
  return parts.isEmpty || parts.first.isEmpty ? name : parts.first;
}

/// Mensagem do "Cobrar" (WhatsApp). Cobrança manual: diz como pagar na
/// arena, sem link.
String arenaClassChargeReminderMessage(
  ArenaClassCharge c, {
  required String todayKey,
  String? arenaName,
}) {
  final who = arenaClassFirstName(c.name);
  final amount = formatBRL(c.amountReais);
  final when = arenaClassChargeIsOverdue(c, todayKey)
      ? 'que venceu em ${arenaClassDdMm(c.dueDate)}'
      : c.dueDate == todayKey
          ? 'que vence hoje'
          : 'que vence em ${arenaClassDdMm(c.dueDate)}';
  final from = arenaName == null || arenaName.trim().isEmpty
      ? ''
      : ' — ${arenaName.trim()}';
  return 'Olá, $who! Tudo bem? Passando para lembrar da cobrança '
      '"${c.description}" ($amount), $when. Pode pagar por '
      '${c.paymentMethod.label} ou direto na recepção. Obrigado!$from';
}

/// Mensagem do "Cobrar no WhatsApp" logo depois da matrícula.
String arenaClassEnrollmentChargeMessage({
  required String studentName,
  required String planName,
  required double totalReais,
  required ArenaClassPaymentMethod method,
  String? arenaName,
}) {
  final from = arenaName == null || arenaName.trim().isEmpty
      ? ''
      : ' — ${arenaName.trim()}';
  return 'Olá, ${arenaClassFirstName(studentName)}! Sua matrícula no plano '
      '$planName está feita. O valor de hoje é ${formatBRL(totalReais)} — '
      'pode pagar por ${method.label} ou direto na recepção. Até a aula!$from';
}

// ---------------------------------------------------------------------------
// Reposição: créditos para encaixar na aula
// ---------------------------------------------------------------------------

/// Aluno com crédito que pode ser encaixado nesta aula.
class ArenaClassMakeupOption {
  const ArenaClassMakeupOption({
    required this.credit,
    required this.creditCount,
  });

  /// O crédito que vai ser usado — o que vence primeiro.
  final ArenaClassCredit credit;

  /// Créditos disponíveis do aluno que ainda valem nesta aula.
  final int creditCount;

  String get studentId => credit.studentId;
  String get name => credit.name;
}

/// Créditos disponíveis que dá para usar nesta aula: um por aluno (o que
/// vence primeiro), sem quem já está na aula e sem crédito que vence antes
/// dela (o backend recusa). Ordem: vence antes, depois nome.
List<ArenaClassMakeupOption> arenaClassMakeupOptions({
  required List<ArenaClassCredit> credits,
  required ArenaClassSession session,
  required Set<String> inSession,
}) {
  final byStudent = <String, List<ArenaClassCredit>>{};
  for (final c in credits) {
    if (!c.isAvailable || inSession.contains(c.studentId)) continue;
    if (c.expiresOn.compareTo(session.date) < 0) continue;
    byStudent.putIfAbsent(c.studentId, () => []).add(c);
  }
  final options = [
    for (final list in byStudent.values)
      ArenaClassMakeupOption(
        credit:
            (list..sort((a, b) => a.expiresOn.compareTo(b.expiresOn))).first,
        creditCount: list.length,
      ),
  ];
  options.sort((a, b) {
    final byExpiry = a.credit.expiresOn.compareTo(b.credit.expiresOn);
    if (byExpiry != 0) return byExpiry;
    return a.name.toLowerCase().compareTo(b.name.toLowerCase());
  });
  return options;
}

/// "1 crédito · expira 13 nov · Iniciante A".
String arenaClassMakeupSubtitle(
  ArenaClassMakeupOption o, {
  String? sourceClassName,
}) {
  final n = o.creditCount;
  final from = sourceClassName == null || sourceClassName.isEmpty
      ? ''
      : ' · $sourceClassName';
  return '$n crédito${n == 1 ? '' : 's'} · expira '
      '${arenaClassShortDate(o.credit.expiresOn)}$from';
}

/// Créditos disponíveis e válidos hoje, o que vence antes primeiro.
List<ArenaClassCredit> arenaClassValidCredits(
  List<ArenaClassCredit> credits,
  String todayKey,
) =>
    credits
        .where((c) => c.isAvailable && c.expiresOn.compareTo(todayKey) >= 0)
        .toList()
      ..sort((a, b) => a.expiresOn.compareTo(b.expiresOn));

// ---------------------------------------------------------------------------
// Frequência do aluno
// ---------------------------------------------------------------------------

/// Uma aula do aluno no histórico.
class ArenaClassStudentLesson {
  const ArenaClassStudentLesson({required this.session, required this.mark});

  final ArenaClassSession session;

  /// `null` = chamada sem marca para o aluno.
  final AttendanceMark? mark;
}

/// Frequência das últimas semanas.
class ArenaClassStudentFrequency {
  const ArenaClassStudentFrequency({required this.lessons});

  /// Aulas do aluno em ordem cronológica (mais antiga primeiro).
  final List<ArenaClassStudentLesson> lessons;

  int get present =>
      lessons.where((l) => l.mark == AttendanceMark.present).length;

  int get marked => lessons.where((l) => l.mark != null).length;

  /// Presentes ÷ aulas com marca; `null` sem nenhuma marca.
  int? get percent => marked == 0 ? null : (present * 100 / marked).round();

  /// As mais recentes primeiro.
  List<ArenaClassStudentLesson> recent(int n) =>
      lessons.reversed.take(n).toList();
}

/// Aulas que contam para o aluno: as das turmas dele, nos dias dele, que já
/// aconteceram (até [todayKey]) a partir de [fromKey], sem as canceladas.
/// [weekdaysByClass]: turma → dias do aluno (`null` = todos).
ArenaClassStudentFrequency buildArenaClassStudentFrequency({
  required String studentId,
  required List<ArenaClassSession> sessions,
  required Map<String, List<int>?> weekdaysByClass,
  required String fromKey,
  required String todayKey,
}) {
  final lessons = <ArenaClassStudentLesson>[];
  for (final s in sessions) {
    if (s.isCanceled) continue;
    if (s.date.compareTo(fromKey) < 0 || s.date.compareTo(todayKey) > 0) {
      continue;
    }
    if (!weekdaysByClass.containsKey(s.classId)) continue;
    final days = weekdaysByClass[s.classId];
    final weekday = arenaClassDateKeyWeekday(s.date);
    final attends = days == null || days.isEmpty || days.contains(weekday);
    final mark = s.attendance[studentId];
    // Marca vale mesmo fora do dia (veio de outra configuração de horário).
    if (!attends && mark == null) continue;
    // Aula de hoje sem chamada ainda não é histórico.
    if (s.date == todayKey && mark == null && !s.isCompleted) continue;
    lessons.add(ArenaClassStudentLesson(session: s, mark: mark));
  }
  lessons.sort((a, b) {
    final byDate = a.session.date.compareTo(b.session.date);
    if (byDate != 0) return byDate;
    return a.session.startTime.compareTo(b.session.startTime);
  });
  return ArenaClassStudentFrequency(lessons: lessons);
}

/// "Presente", "Falta", "Avisou falta", "Sem chamada".
String arenaClassLessonLabel(AttendanceMark? mark) => switch (mark) {
      AttendanceMark.present => 'Presente',
      AttendanceMark.absent => 'Falta',
      AttendanceMark.excused => 'Avisou falta',
      null => 'Sem marca',
    };

/// "Qua 14 out" de `2026-10-14`.
String arenaClassWeekdayDate(String dateKey) {
  final weekday = arenaClassDateKeyWeekday(dateKey);
  if (weekday == null) return dateKey;
  return '${arenaClassWeekdayShort(weekday)} ${arenaClassShortDate(dateKey)}';
}
