import '../../arena/domain/aulas/arena_class.dart';
import '../../arena/domain/aulas/arena_class_logic.dart';
import 'professor_actions.dart';
import 'professor_students.dart';

/// Regras das telas de ação do professor (fase 2): o que oferecer e como
/// rotular. Quem autoriza é a callable — aqui é só a tela não oferecer o que
/// o servidor recusaria.

/// "Hoje" / "Amanhã" / "Qua 21".
String professorDayLabel(String dateKey, String todayKey) {
  if (dateKey == todayKey) return 'Hoje';
  final today = DateTime.tryParse(todayKey);
  final d = DateTime.tryParse(dateKey);
  if (today != null && d != null && d.difference(today).inDays == 1) {
    return 'Amanhã';
  }
  final weekday = arenaClassDateKeyWeekday(dateKey);
  if (weekday == null || d == null) return dateKey;
  return '${arenaClassWeekdayShort(weekday)} ${d.day}';
}

/// "4 VAGAS" / "1 VAGA" / "LOTADA".
String professorSpotsLabel(int free) =>
    free <= 0 ? 'LOTADA' : '$free VAGA${free == 1 ? '' : 'S'}';

/// Planos que servem para [weekdayCount] dias por semana: mensais do mesmo
/// número de aulas primeiro, depois os pacotes (qualquer quantidade).
List<ProfessorPlanOption> professorPlansFor(
  List<ProfessorPlanOption> plans,
  int weekdayCount,
) =>
    [
      for (final p in plans)
        if (p.isMonthly && p.classesPerWeek == weekdayCount) p,
      for (final p in plans)
        if (p.isPackage) p,
    ];

/// Dias sugeridos na turma para o plano: mensal N → os N primeiros dias com
/// vaga; pacote → todos os dias com vaga.
List<int> professorDefaultWeekdays(
  ProfessorActionClass cls,
  ProfessorPlanOption? plan,
) {
  final open = [
    for (final d in cls.weekdays)
      if (cls.freeOn(d) > 0) d
  ];
  if (plan == null || !plan.isMonthly) return open;
  final n = plan.classesPerWeek ?? open.length;
  return open.take(n).toList();
}

/// Por que a matrícula ainda não pode ir (`null` = pode).
String? professorEnrollmentBlocker(
  ProfessorActionClass? cls,
  ProfessorPlanOption? plan,
  List<int> weekdays,
) {
  if (cls == null) return 'Escolha a turma.';
  if (plan == null) return 'Escolha o plano.';
  if (weekdays.isEmpty) return 'Escolha os dias.';
  if (weekdays.any((d) => cls.freeOn(d) <= 0)) {
    return 'A turma está lotada num dos dias escolhidos.';
  }
  if (plan.isMonthly && weekdays.length != plan.classesPerWeek) {
    final n = plan.classesPerWeek ?? 0;
    return 'O plano ${plan.name} tem $n aula${n == 1 ? '' : 's'} por semana — '
        'escolha $n dia${n == 1 ? '' : 's'}.';
  }
  return null;
}

/// "R$ 320,00/mês" (mensal) / "R$ 440,00 · 4 aulas" (pacote).
String professorPlanPriceLabel(
    ProfessorPlanOption p, String Function(num) brl) {
  if (p.isMonthly) return '${brl(p.priceReais)}/mês';
  final n = p.credits;
  return n == null ? brl(p.priceReais) : '${brl(p.priceReais)} · $n aulas';
}

/// Aulas em que dá para encaixar o aluno: com vaga, sem ele já como
/// encaixe; as da mesma turma primeiro, depois por data.
List<ProfessorActionSession> professorMakeupSessions(
  ProfessorActionsContext ctx, {
  required String studentId,
  Set<String> preferClassIds = const {},
  String? until,
}) {
  final list = [
    for (final s in ctx.sessions)
      if (s.free > 0 &&
          s.type == ArenaClassType.turma &&
          (until == null || s.date.compareTo(until) <= 0) &&
          !s.extras.any((e) => e.studentId == studentId))
        s
  ];
  list.sort((a, b) {
    final pa = preferClassIds.contains(a.classId) ? 0 : 1;
    final pb = preferClassIds.contains(b.classId) ? 0 : 1;
    if (pa != pb) return pa - pb;
    final byDate = a.date.compareTo(b.date);
    return byDate != 0 ? byDate : a.startTime.compareTo(b.startTime);
  });
  return list;
}

/// Turmas para onde dá para mover o aluno: as outras turmas dele na arena
/// com dias suficientes para o plano.
List<ProfessorActionClass> professorMoveTargets(
  ProfessorActionsContext ctx, {
  required String fromClassId,
  required int weekdayCount,
}) =>
    [
      for (final c in ctx.classes)
        if (c.classId != fromClassId && c.weekdays.length >= weekdayCount) c
    ];

/// Pacote com aula sobrando (para a aula avulsa usar) — `null` sem pacote.
ProfessorStudentPlan? professorUsablePackage(ProfessorStudent s) {
  for (final p in s.plans) {
    if (p.isPackage && !p.paused && (p.creditsLeft ?? 0) > 0) return p;
  }
  return null;
}

/// Horários oferecidos na aula avulsa (a arena confirma a quadra na hora).
const List<String> kProfessorLessonStartTimes = [
  '06:00',
  '07:00',
  '08:00',
  '09:00',
  '10:00',
  '11:00',
  '12:00',
  '13:00',
  '14:00',
  '15:00',
  '16:00',
  '17:00',
  '18:00',
  '19:00',
  '20:00',
  '21:00',
];

/// "07:00" + 90 → "08:30" (até 24:00).
String professorAddMinutes(String time, int minutes) {
  final parts = time.split(':');
  final h = int.tryParse(parts.first) ?? 0;
  final m = parts.length > 1 ? int.tryParse(parts[1]) ?? 0 : 0;
  final total = (h * 60 + m + minutes).clamp(0, 24 * 60);
  final hh = (total ~/ 60).toString().padLeft(2, '0');
  final mm = (total % 60).toString().padLeft(2, '0');
  return '$hh:$mm';
}

/// Próximos [days] dias (`YYYY-MM-DD`) a partir de hoje.
List<String> professorNextDays(String todayKey, int days) {
  final today = DateTime.tryParse(todayKey);
  if (today == null) return const [];
  return [
    for (var i = 0; i < days; i++)
      () {
        final d = DateTime(today.year, today.month, today.day + i);
        return '${d.year}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';
      }()
  ];
}

/// Modelos do comunicado (B13).
enum ProfessorNoticeTemplate { rain, delay, courtChange, free }

extension ProfessorNoticeTemplateX on ProfessorNoticeTemplate {
  String get label => switch (this) {
        ProfessorNoticeTemplate.rain => 'Chuva · aula cancelada',
        ProfessorNoticeTemplate.delay => 'Atraso',
        ProfessorNoticeTemplate.courtChange => 'Troca de quadra',
        ProfessorNoticeTemplate.free => 'Livre',
      };

  String get text => switch (this) {
        ProfessorNoticeTemplate.rain =>
          'Pessoal, por causa da chuva a aula está cancelada.',
        ProfessorNoticeTemplate.delay =>
          'Pessoal, vou atrasar uns 15 minutos. Podem aquecer!',
        ProfessorNoticeTemplate.courtChange =>
          'Pessoal, hoje a aula vai ser em outra quadra. Me procurem na recepção.',
        ProfessorNoticeTemplate.free => '',
      };

  /// Modelo que já liga "Cancelar as aulas".
  bool get cancels => this == ProfessorNoticeTemplate.rain;

  /// Motivo do cancelamento (`CANCEL_REASON_LABELS` do servidor).
  String get cancelReason =>
      this == ProfessorNoticeTemplate.rain ? 'rain' : 'other';
}

/// Aulas do aviso: as de hoje e amanhã.
List<ProfessorActionSession> professorNoticeSessions(
  ProfessorActionsContext ctx,
) {
  final days = professorNextDays(ctx.todayKey, 2).toSet();
  return [
    for (final s in ctx.sessions)
      if (days.contains(s.date)) s
  ];
}

/// Quantos alunos o aviso alcança (turma do dia + encaixes).
int professorNoticeReach(
  List<ProfessorActionSession> sessions,
  Set<String> selected,
) =>
    sessions
        .where((s) => selected.contains(s.sessionId))
        .fold(0, (sum, s) => sum + s.taken);
