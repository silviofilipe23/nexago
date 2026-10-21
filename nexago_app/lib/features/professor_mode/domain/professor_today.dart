import '../../athlete/domain/agenda/class_agenda_entry.dart';
import 'arena_professor_notices.dart';
import 'professor_actions_logic.dart' show professorDayLabel;
import 'professor_agenda.dart';
import 'professor_availability.dart';
import 'professor_lesson_plans.dart';
import 'professor_mode_logic.dart' show professorPendingAttendance;
import 'professor_wallet_logic.dart' show professorMonthName;

/// Hoje do modo Professor (J1/J2, `pa-app-hoje.jsx`): a visão unificada das
/// arenas. Tudo sai dos itens da agenda (parede de São Paulo) e das fontes
/// que o app já tem; aqui só se decide o que mostrar.

// ── cabeçalho ────────────────────────────────────────────────────────────

/// "Bom dia" (5h–11h), "Boa tarde" (12h–17h), "Boa noite" (o resto).
String professorGreeting(int hour) {
  if (hour >= 5 && hour < 12) return 'Bom dia';
  if (hour >= 12 && hour < 18) return 'Boa tarde';
  return 'Boa noite';
}

const _weekdays = ['SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB', 'DOM'];
const _months = [
  'JAN',
  'FEV',
  'MAR',
  'ABR',
  'MAI',
  'JUN',
  'JUL',
  'AGO',
  'SET',
  'OUT',
  'NOV',
  'DEZ',
];

/// "TER, 20 OUT · 17:40" de um horário de parede (já em SP).
String professorTodayKicker(DateTime wall) =>
    '${_weekdays[wall.weekday - 1]}, ${wall.day} ${_months[wall.month - 1]} · '
    '${wall.hour.toString().padLeft(2, '0')}:'
    '${wall.minute.toString().padLeft(2, '0')}';

// ── aulas do dia ─────────────────────────────────────────────────────────

/// Quanto antes do início a aula vira "AGORA".
const int kProfessorNowSoonWindowMin = 60;

/// Aulas do dia (sem bloqueio e sem canceladas), por horário.
List<ProfessorAgendaItem> professorTodayLessons(
  List<ProfessorAgendaItem> items,
  String todayKey,
) =>
    [
      for (final i in professorItemsOn(items, todayKey))
        if (!i.isBlock && !i.canceled) i,
    ];

enum ProfessorNowState { live, soon }

/// A aula do cartão "Agora": em andamento ou começando em até
/// [kProfessorNowSoonWindowMin] minutos.
class ProfessorNowSlot {
  const ProfessorNowSlot({
    required this.item,
    required this.state,
    required this.nowMin,
  });

  final ProfessorAgendaItem item;
  final ProfessorNowState state;
  final int nowMin;

  bool get isLive => state == ProfessorNowState.live;

  /// Minutos até começar (0 em andamento).
  int get minutesToStart =>
      isLive ? 0 : (item.startMin - nowMin).clamp(0, 24 * 60);

  /// Fração já dada (0 antes de começar).
  double get progress => isLive && item.durationMin > 0
      ? ((nowMin - item.startMin) / item.durationMin).clamp(0.0, 1.0)
      : 0;

  /// "EM ANDAMENTO" / "AGORA · FALTAM 20 MIN".
  String get label =>
      isLive ? 'EM ANDAMENTO' : 'AGORA · FALTAM $minutesToStart MIN';
}

/// A aula em andamento (a que começou primeiro) ou, sem nenhuma, a próxima
/// que começa dentro da janela. `null` = nada agora (J2).
ProfessorNowSlot? professorNowSlot(
  List<ProfessorAgendaItem> items, {
  required String todayKey,
  required int nowMin,
  int soonWindowMin = kProfessorNowSoonWindowMin,
}) {
  final lessons = professorTodayLessons(items, todayKey);
  for (final i in lessons) {
    if (i.startMin <= nowMin && nowMin < i.endMin) {
      return ProfessorNowSlot(
        item: i,
        state: ProfessorNowState.live,
        nowMin: nowMin,
      );
    }
  }
  for (final i in lessons) {
    final wait = i.startMin - nowMin;
    if (wait > 0 && wait <= soonWindowMin) {
      return ProfessorNowSlot(
        item: i,
        state: ProfessorNowState.soon,
        nowMin: nowMin,
      );
    }
  }
  return null;
}

/// Aulas de hoje que ainda não começaram, sem [except] (a do "Agora").
List<ProfessorAgendaItem> professorNextToday(
  List<ProfessorAgendaItem> items, {
  required String todayKey,
  required int nowMin,
  ProfessorAgendaItem? except,
}) =>
    [
      for (final i in professorTodayLessons(items, todayKey))
        if (i.startMin > nowMin && i.id != except?.id) i,
    ];

/// "EM 40 MIN", "EM 1H20", "EM 2H".
String professorStartsInLabel(int minutes) {
  final m = minutes < 0 ? 0 : minutes;
  if (m < 60) return 'EM $m MIN';
  final h = m ~/ 60;
  final rest = m % 60;
  return rest == 0 ? 'EM ${h}H' : 'EM ${h}H${rest.toString().padLeft(2, '0')}';
}

/// Quadra do item (`null` quando não tem: particular do app, bloqueio).
String? professorItemCourt(ProfessorAgendaItem i) {
  final court = switch (i.kind) {
    ProfessorAgendaKind.session => i.session?.courtName,
    ProfessorAgendaKind.lesson => i.lesson?.courtName,
    ProfessorAgendaKind.ownClass => i.booking?.courtName,
    _ => null,
  };
  return court == null || court.trim().isEmpty ? null : court.trim();
}

/// Alunos da aula: a contagem da turma; particular conta 1 (dupla, 2).
/// `null` quando a turma não informa.
int? professorItemStudentCount(ProfessorAgendaItem i) => switch (i.kind) {
      ProfessorAgendaKind.session => i.session?.studentCount,
      ProfessorAgendaKind.lesson => 1,
      ProfessorAgendaKind.privateLesson =>
        (i.privateLesson?.pair ?? false) ? 2 : 1,
      _ => null,
    };

/// "6 alunos" / "1 aluno" (`null` sem contagem).
String? professorStudentsLabel(ProfessorAgendaItem i) {
  final n = professorItemStudentCount(i);
  if (n == null || n <= 0) return null;
  return '$n aluno${n == 1 ? '' : 's'}';
}

/// "ARENA CFC · QUADRA 2" (particular do app: "PELO APP").
String professorItemWhereLabel(ProfessorAgendaItem i) {
  final court = professorItemCourt(i);
  final arena = i.arenaName ??
      (i.kind == ProfessorAgendaKind.privateLesson ? 'Pelo app' : null);
  return [
    if (arena != null) arena,
    if (court != null) court,
  ].join(' · ').toUpperCase();
}

/// "Turma · 17:00–18:00 · 6 alunos".
String professorItemSummary(ProfessorAgendaItem i) => [
      i.typeLabel,
      '${i.startLabel}–${i.endLabel}',
      if (professorStudentsLabel(i) case final s?) s,
    ].join(' · ');

/// Números do dia: aulas dadas / do dia e alunos somados.
typedef ProfessorTodayStats = ({int done, int total, int students});

ProfessorTodayStats professorTodayStats(
  List<ProfessorAgendaItem> items, {
  required String todayKey,
  required int nowMin,
}) {
  final lessons = professorTodayLessons(items, todayKey);
  var students = 0;
  for (final i in lessons) {
    students += professorItemStudentCount(i) ?? 0;
  }
  return (
    done: lessons.where((i) => i.endMin <= nowMin).length,
    total: lessons.length,
    students: students,
  );
}

/// "06:00 → 21:00" (do início da primeira ao fim da última).
String professorDayRangeLabel(List<ProfessorAgendaItem> lessons) {
  if (lessons.isEmpty) return '';
  var start = lessons.first.startMin, end = lessons.first.endMin;
  for (final i in lessons) {
    if (i.startMin < start) start = i.startMin;
    if (i.endMin > end) end = i.endMin;
  }
  return '${professorMinutesLabel(start)} → ${professorMinutesLabel(end)}';
}

/// Faixa de horas do "Seu dia".
const int kProfessorDayStripStartHour = 6;
const int kProfessorDayStripEndHour = 22;

/// Uma casa por hora da faixa: a aula que ocupa aquela hora (`null` livre).
List<ProfessorAgendaItem?> professorDayStrip(
  List<ProfessorAgendaItem> lessons, {
  int startHour = kProfessorDayStripStartHour,
  int endHour = kProfessorDayStripEndHour,
}) =>
    [
      for (var h = startHour; h < endHour; h++)
        _firstOrNull(lessons.where(
          (i) => i.startMin < (h + 1) * 60 && i.endMin > h * 60,
        )),
    ];

T? _firstOrNull<T>(Iterable<T> it) => it.isEmpty ? null : it.first;

/// O plano da aula (kind + refId), quando ela pode ter plano.
({LessonPlanKind kind, String refId})? professorItemPlanRef(
  ProfessorAgendaItem i,
) {
  final p = plannableLessonsFrom([i], fromKey: i.date, toKey: i.date);
  if (p.isEmpty) return null;
  return (kind: p.first.kind, refId: p.first.refId);
}

// ── ações do "Agora" ─────────────────────────────────────────────────────

enum ProfessorNowAction { attendance, startLesson, planLesson, details }

/// Botões do cartão "Agora": o principal primeiro. Aula de turma com a
/// chamada liberada abre a chamada; com plano pronto para hoje, "Iniciar
/// aula" (modo aula); sem plano, "Planejar"; sempre dá para abrir o detalhe.
List<ProfessorNowAction> professorNowActions({
  required ProfessorAgendaItem item,
  required String? attendanceCta,
  required LessonPlan? plan,
  required bool canPlan,
}) {
  final out = <ProfessorNowAction>[];
  if (attendanceCta != null) out.add(ProfessorNowAction.attendance);
  if (plan != null && plan.blocks.isNotEmpty) {
    out.add(ProfessorNowAction.startLesson);
  } else if (canPlan && plan == null) {
    out.add(ProfessorNowAction.planLesson);
  }
  out.add(ProfessorNowAction.details);
  return out.take(2).toList();
}

// ── pendências ───────────────────────────────────────────────────────────

enum ProfessorTodayPendingKind {
  attendance,
  privateRequest,
  reschedule,
  messages,
  unplanned,
  review,
  evaluations,
  arenaNotice,
}

/// Uma linha de "Precisa de você": ícone pelo [kind], título, subtítulo e o
/// botão. [targetId] abre direto o item quando há um só (aula, plano,
/// comunicado).
class ProfessorTodayPending {
  const ProfessorTodayPending({
    required this.kind,
    required this.count,
    required this.title,
    required this.subtitle,
    required this.cta,
    this.targetId,
  });

  final ProfessorTodayPendingKind kind;
  final int count;
  final String title;
  final String subtitle;
  final String cta;
  final String? targetId;
}

String _plural(int n, String one, String many) => n == 1 ? one : many;

/// As pendências com contagem — fonte com zero não vira linha. Ordem: o que
/// tem gente esperando primeiro (chamada, pedidos, mensagens), depois o
/// trabalho do professor (plano, registro, avaliação, comunicado).
List<ProfessorTodayPending> professorTodayPendings({
  required String todayKey,
  List<ClassAgendaEntry> sessions = const [],
  List<PrivateLesson> privateRequests = const [],
  List<PrivateLesson> reschedules = const [],
  int unreadMessages = 0,
  List<PlannableLesson> unplanned = const [],
  List<LessonPlan> toReview = const [],
  int evaluationsPending = 0,
  String evaluationPeriod = '',
  List<ArenaProfessorNotice> unreadNotices = const [],
}) {
  final out = <ProfessorTodayPending>[];

  final attendance = professorPendingAttendance(sessions, todayKey);
  if (attendance.isNotEmpty) {
    final first = attendance.first;
    final n = attendance.length;
    out.add(ProfessorTodayPending(
      kind: ProfessorTodayPendingKind.attendance,
      count: n,
      title: n == 1
          ? 'Chamada pendente · ${first.className}'
          : '$n chamadas pendentes',
      subtitle: '${professorDayLabel(first.date, todayKey)} · '
          '${first.startTime} · ${first.arenaName}',
      cta: 'Fazer',
      targetId: first.sessionId,
    ));
  }

  if (privateRequests.isNotEmpty) {
    final first = privateRequests.first;
    final n = privateRequests.length;
    out.add(ProfessorTodayPending(
      kind: ProfessorTodayPendingKind.privateRequest,
      count: n,
      title: n == 1
          ? '${privateLessonShortName(first.athleteName)} pediu uma particular'
          : '$n pedidos de particular',
      subtitle: [
        if (n > 1) 'O mais próximo',
        rescheduleSlotLabel(first.startAt),
        if (first.pair) 'em dupla',
      ].join(' · '),
      cta: 'Responder',
      targetId: first.id,
    ));
  }

  if (reschedules.isNotEmpty) {
    final first = reschedules.first;
    final n = reschedules.length;
    final to = first.pendingReschedule?.startAt;
    out.add(ProfessorTodayPending(
      kind: ProfessorTodayPendingKind.reschedule,
      count: n,
      title: n == 1
          ? '${privateLessonShortName(first.athleteName)} pediu para remarcar'
          : '$n pedidos de remarcação',
      subtitle: [
        rescheduleSlotLabel(first.startAt),
        if (to != null) rescheduleSlotLabel(to),
      ].join(' → '),
      cta: 'Ver',
      targetId: first.id,
    ));
  }

  if (unreadMessages > 0) {
    out.add(ProfessorTodayPending(
      kind: ProfessorTodayPendingKind.messages,
      count: unreadMessages,
      title: _plural(
        unreadMessages,
        '1 mensagem não lida',
        '$unreadMessages mensagens não lidas',
      ),
      subtitle: 'Conversas com seus alunos',
      cta: 'Abrir',
    ));
  }

  if (unplanned.isNotEmpty) {
    final n = unplanned.length;
    final first = unplanned.first;
    out.add(ProfessorTodayPending(
      kind: ProfessorTodayPendingKind.unplanned,
      count: n,
      title: _plural(n, '1 aula hoje sem plano', '$n aulas hoje sem plano'),
      subtitle: n == 1
          ? '${first.startLabel} · ${first.title}'
          : 'A próxima: ${first.startLabel} · ${first.title}',
      cta: 'Planejar',
      targetId: first.refId,
    ));
  }

  if (toReview.isNotEmpty) {
    final n = toReview.length;
    final first = toReview.first;
    out.add(ProfessorTodayPending(
      kind: ProfessorTodayPendingKind.review,
      count: n,
      title: _plural(n, '1 aula para registrar', '$n aulas para registrar'),
      subtitle: '${professorDayLabel(first.date, todayKey)} · ${first.title}',
      cta: 'Registrar',
      targetId: first.id,
    ));
  }

  if (evaluationsPending > 0) {
    final n = evaluationsPending;
    out.add(ProfessorTodayPending(
      kind: ProfessorTodayPendingKind.evaluations,
      count: n,
      title: _plural(n, '1 aluno para avaliar', '$n alunos para avaliar'),
      subtitle: evaluationPeriod.length >= 7
          ? 'Avaliação de ${professorMonthName(evaluationPeriod)}'
          : 'Avaliação do mês',
      cta: 'Avaliar',
    ));
  }

  if (unreadNotices.isNotEmpty) {
    final n = unreadNotices.length;
    final first = unreadNotices.first;
    out.add(ProfessorTodayPending(
      kind: ProfessorTodayPendingKind.arenaNotice,
      count: n,
      title: n == 1
          ? 'Comunicado da ${first.arenaName}'
          : '$n comunicados da gestão',
      subtitle: first.title.isEmpty ? first.kind.label : first.title,
      cta: 'Ler',
      targetId: first.id,
    ));
  }

  return out;
}

/// Pedidos de remarcação feitos pelo aluno, esperando o professor.
List<PrivateLesson> professorRescheduleRequests(
  List<PrivateLesson> lessons,
  DateTime now,
) =>
    [
      for (final l in lessons)
        if (l.pendingReschedule case final r?
            when r.requestedBy == l.athleteId && l.canRescheduleAt(now))
          l,
    ];

/// Aulas de hoje que ainda não acabaram e não têm plano.
List<PlannableLesson> professorUnplannedToday(
  List<ProfessorAgendaItem> items, {
  required String todayKey,
  required int nowMin,
  required List<LessonPlan> plans,
  required String uid,
}) {
  final ids = {for (final p in plans) p.id};
  return [
    for (final l in plannableLessonsFrom(
      items,
      fromKey: todayKey,
      toKey: todayKey,
    ))
      if (l.endMin > nowMin && !ids.contains(l.planId(uid))) l,
  ];
}
