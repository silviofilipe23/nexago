import '../../../core/time/nexago_event_timezone.dart';
import '../../arena/domain/aulas/arena_class_logic.dart';
import '../../athlete/domain/agenda/class_agenda_entry.dart';
import '../../professor_mode/domain/professor_availability.dart';
import '../../professor_mode/domain/professor_lesson_plans.dart';

/// Treinos do atleta (canvas "NexaGO Atleta — Treinos"): junta as aulas da
/// arena em que ele é ALUNO (`getMyClassAgenda`) e as particulares com os
/// professores (`professorPrivateLessons`) numa linha do tempo só.
///
/// Tudo aqui é puro — os providers só entregam as listas.

enum TrainingSource { arenaClass, privateLesson }

/// Situação do treino do ponto de vista do aluno.
enum TrainingState {
  /// Aula marcada (turma) ou particular confirmada.
  scheduled,

  /// Particular pedida, aguardando o professor.
  awaitingProfessor,
  canceled,
  present,
  absent,

  /// Falta avisada (justificada na chamada).
  excused,

  /// Passou sem chamada registrada (ou particular confirmada que já passou).
  done,
}

class TrainingSession {
  const TrainingSession({
    required this.id,
    required this.source,
    required this.title,
    required this.professorName,
    required this.dateKey,
    required this.startTime,
    required this.startAt,
    required this.endAt,
    required this.state,
    this.professorUid = '',
    this.arenaName = '',
    this.courtName = '',
    this.isMakeup = false,
    this.isTrial = false,
    this.classEntry,
    this.privateLesson,
  });

  /// `sessionId` da aula ou id da particular.
  final String id;
  final TrainingSource source;
  final String title;
  final String professorName;

  /// Só a particular traz o uid do professor (a agenda da arena traz o nome).
  final String professorUid;
  final String arenaName;
  final String courtName;

  /// `YYYY-MM-DD` no calendário de São Paulo.
  final String dateKey;

  /// `HH:mm` (parede de São Paulo).
  final String startTime;
  final DateTime startAt;
  final DateTime endAt;
  final TrainingState state;
  final bool isMakeup;
  final bool isTrial;
  final ClassAgendaEntry? classEntry;
  final PrivateLesson? privateLesson;

  bool get isPrivate => source == TrainingSource.privateLesson;
  bool get isCanceled => state == TrainingState.canceled;

  /// Contou como treino feito (presença ou aula que passou sem chamada).
  bool get attended =>
      state == TrainingState.present || state == TrainingState.done;

  /// Onde: "Arena CFC · Quadra 2".
  String get placeLabel =>
      [arenaName, courtName].where((s) => s.trim().isNotEmpty).join(' · ');

  /// O plano/feedback publicado pelo professor para este treino.
  LessonPlanKind get planKind =>
      isPrivate ? LessonPlanKind.privateLesson : LessonPlanKind.session;
}

// ── mapeamento ───────────────────────────────────────────────────────────

/// Aula da arena como treino — `null` quando o atleta DÁ a aula ou quando a
/// data não dá para ler.
TrainingSession? trainingFromClass(ClassAgendaEntry e, DateTime now) {
  if (e.isTeacher) return null;
  final start = e.startAt ?? _wallInstant(e.date, e.startTime);
  if (start == null) return null;
  final end = _wallInstant(e.date, e.endTime);
  final endAt = end != null && end.isAfter(start)
      ? end
      : start.add(const Duration(hours: 1));
  final past = !endAt.isAfter(now);
  final TrainingState state;
  if (e.isCanceled) {
    state = TrainingState.canceled;
  } else {
    state = switch (e.myMark) {
      'present' => TrainingState.present,
      'absent' => TrainingState.absent,
      'excused' => TrainingState.excused,
      _ => past || e.status == 'completed'
          ? TrainingState.done
          : TrainingState.scheduled,
    };
  }
  return TrainingSession(
    id: e.sessionId,
    source: TrainingSource.arenaClass,
    title: e.className,
    professorName: e.teacherName.trim(),
    arenaName: e.arenaName,
    courtName: e.courtName,
    dateKey: e.date,
    startTime: e.startTime,
    startAt: start,
    endAt: endAt,
    state: state,
    isMakeup: e.kind == 'makeup',
    isTrial: e.kind == 'trial',
    classEntry: e,
  );
}

/// Particular como treino. Recusada vira cancelada (não aconteceu).
TrainingSession trainingFromPrivateLesson(PrivateLesson l, DateTime now) {
  final past = !l.endAt.isAfter(now);
  final state = switch (l.status) {
    PrivateLessonStatus.confirmed =>
      past ? TrainingState.done : TrainingState.scheduled,
    PrivateLessonStatus.pending =>
      past ? TrainingState.canceled : TrainingState.awaitingProfessor,
    PrivateLessonStatus.declined ||
    PrivateLessonStatus.canceled =>
      TrainingState.canceled,
  };
  final local = toNexagoEventLocal(l.startAt);
  return TrainingSession(
    id: l.id,
    source: TrainingSource.privateLesson,
    title: l.pair ? 'Particular em dupla' : 'Particular',
    professorName: l.professorName,
    professorUid: l.professorUid,
    dateKey: nexagoEventDayKey(l.startAt),
    startTime: '${_two(local.hour)}:${_two(local.minute)}',
    startAt: l.startAt,
    endAt: l.endAt,
    state: state,
    privateLesson: l,
  );
}

/// Junta as duas fontes (sem repetir aula vinda de duas janelas da agenda),
/// em ordem cronológica.
List<TrainingSession> buildTrainings({
  required Iterable<ClassAgendaEntry> classes,
  required Iterable<PrivateLesson> privateLessons,
  required DateTime now,
}) {
  final byId = <String, TrainingSession>{};
  for (final c in classes) {
    final t = trainingFromClass(c, now);
    if (t != null) byId['c:${t.id}'] = t;
  }
  for (final l in privateLessons) {
    final t = trainingFromPrivateLesson(l, now);
    byId['p:${t.id}'] = t;
  }
  return byId.values.toList()..sort((a, b) => a.startAt.compareTo(b.startAt));
}

// ── recortes ─────────────────────────────────────────────────────────────

/// Próximos (ainda não terminaram), do mais cedo ao mais tarde. Cancelados
/// ficam de fora — não há o que fazer com eles.
List<TrainingSession> upcomingTrainings(
  List<TrainingSession> all,
  DateTime now,
) =>
    [
      for (final t in all)
        if (t.endAt.isAfter(now) && !t.isCanceled) t,
    ];

/// Histórico (já terminaram), do mais recente ao mais antigo.
List<TrainingSession> pastTrainings(List<TrainingSession> all, DateTime now) =>
    [
      for (final t in all)
        if (!t.endAt.isAfter(now)) t,
    ]..sort((a, b) => b.startAt.compareTo(a.startAt));

/// O próximo treino (o primeiro que não terminou) ou `null`.
TrainingSession? nextTraining(List<TrainingSession> all, DateTime now) {
  final up = upcomingTrainings(all, now);
  return up.isEmpty ? null : up.first;
}

/// Primeiros nomes dos professores, na ordem em que aparecem (chips de
/// filtro). Sem nome não entra.
List<String> trainingProfessorFirstNames(Iterable<TrainingSession> list) {
  final seen = <String>{};
  final out = <String>[];
  for (final t in list) {
    final first = trainingFirstName(t.professorName);
    if (first.isNotEmpty && seen.add(first)) out.add(first);
  }
  return out;
}

String trainingFirstName(String name) {
  final parts = name.trim().split(RegExp(r'\s+'));
  return parts.isEmpty ? '' : parts.first;
}

/// O treino é do professor do filtro (primeiro nome); `null` = todos.
bool trainingMatchesProfessor(TrainingSession t, String? firstName) =>
    firstName == null || trainingFirstName(t.professorName) == firstName;

// ── números ──────────────────────────────────────────────────────────────

class TrainingMonthStats {
  const TrainingMonthStats({
    required this.present,
    required this.excused,
    required this.absent,
    required this.attended,
  });

  final int present;
  final int excused;
  final int absent;

  /// Treinos feitos no mês (presença + aula sem chamada que passou).
  final int attended;

  /// Presença sobre as aulas com chamada; `null` sem chamada no mês.
  int? get presencePercent {
    final marked = present + excused + absent;
    return marked == 0 ? null : (present * 100 / marked).round();
  }
}

/// Números do mês de [now] (calendário de São Paulo), só do que já passou.
TrainingMonthStats trainingMonthStats(
  List<TrainingSession> all,
  DateTime now,
) {
  final month = nexagoEventDayKey(now).substring(0, 7);
  var present = 0, excused = 0, absent = 0, attended = 0;
  for (final t in pastTrainings(all, now)) {
    if (!t.dateKey.startsWith(month)) continue;
    switch (t.state) {
      case TrainingState.present:
        present++;
        attended++;
      case TrainingState.done:
        attended++;
      case TrainingState.excused:
        excused++;
      case TrainingState.absent:
        absent++;
      case TrainingState.scheduled ||
            TrainingState.awaitingProfessor ||
            TrainingState.canceled:
        break;
    }
  }
  return TrainingMonthStats(
    present: present,
    excused: excused,
    absent: absent,
    attended: attended,
  );
}

/// Treinos seguidos sem faltar: do mais recente para trás até a primeira
/// falta (avisada ou não). Cancelado não quebra nem conta.
int trainingCurrentStreak(List<TrainingSession> all, DateTime now) {
  var streak = 0;
  for (final t in pastTrainings(all, now)) {
    if (t.attended) {
      streak++;
    } else if (t.state == TrainingState.absent ||
        t.state == TrainingState.excused) {
      break;
    }
  }
  return streak;
}

/// Maior sequência de treinos sem faltar na janela.
int trainingBestStreak(List<TrainingSession> all, DateTime now) {
  var best = 0, run = 0;
  for (final t in pastTrainings(all, now).reversed) {
    if (t.attended) {
      run++;
      if (run > best) best = run;
    } else if (t.state == TrainingState.absent ||
        t.state == TrainingState.excused) {
      run = 0;
    }
  }
  return best;
}

class TrainingMonthBar {
  const TrainingMonthBar({
    required this.monthKey,
    required this.label,
    required this.attended,
    required this.planned,
  });

  /// `YYYY-MM`.
  final String monthKey;

  /// "OUT".
  final String label;
  final int attended;

  /// Aulas que não foram canceladas no mês (feitas, faltas e as que ainda
  /// vão acontecer).
  final int planned;
}

/// Uma barra por mês, dos [months] meses até o de [now] (o último é o atual).
List<TrainingMonthBar> trainingMonthlyFrequency(
  List<TrainingSession> all,
  DateTime now, {
  int months = 6,
}) {
  final today = toNexagoEventLocal(now);
  final keys = [
    for (var i = months - 1; i >= 0; i--)
      _monthKey(DateTime(today.year, today.month - i)),
  ];
  final attended = {for (final k in keys) k: 0};
  final planned = {for (final k in keys) k: 0};
  for (final t in all) {
    if (t.dateKey.length < 7 || t.isCanceled) continue;
    final k = t.dateKey.substring(0, 7);
    if (!planned.containsKey(k)) continue;
    planned[k] = planned[k]! + 1;
    if (t.attended && !t.endAt.isAfter(now)) attended[k] = attended[k]! + 1;
  }
  return [
    for (final k in keys)
      TrainingMonthBar(
        monthKey: k,
        label: _monthShort[int.parse(k.substring(5)) - 1],
        attended: attended[k]!,
        planned: planned[k]!,
      ),
  ];
}

// ── feedbacks ────────────────────────────────────────────────────────────

/// Feedback novo: chegou há menos de [kTrainingFeedbackNewDays] dias e o
/// aluno ainda não deu estrelas (avaliar é o "li" do feedback).
const int kTrainingFeedbackNewDays = 7;

/// Visões com feedback do professor, do mais recente ao mais antigo.
List<LessonPlanView> trainingFeedbacks(Iterable<LessonPlanView> views) {
  final out = [
    for (final v in views)
      if (v.feedback != null && v.feedback!.text.trim().isNotEmpty) v,
  ];
  out.sort((a, b) => _feedbackOrder(b).compareTo(_feedbackOrder(a)));
  return out;
}

bool trainingFeedbackIsNew(LessonPlanView v, DateTime now) {
  final sent = v.feedback?.sentAt;
  if (sent == null || v.ratingStars != null) return false;
  return now.difference(sent) < const Duration(days: kTrainingFeedbackNewDays);
}

int trainingNewFeedbackCount(Iterable<LessonPlanView> views, DateTime now) =>
    trainingFeedbacks(views).where((v) => trainingFeedbackIsNew(v, now)).length;

/// O feedback mais recente com tarefa para casa.
LessonPlanView? latestTrainingHomework(Iterable<LessonPlanView> views) {
  for (final v in trainingFeedbacks(views)) {
    if (v.feedback?.homework != null) return v;
  }
  return null;
}

// ── rótulos ──────────────────────────────────────────────────────────────

/// "Hoje", "Amanhã" ou "QUI 23" para [dateKey] em relação a [todayKey].
String trainingRelativeDay(String dateKey, String todayKey) {
  final d = DateTime.tryParse(dateKey);
  final today = DateTime.tryParse(todayKey);
  if (d == null || today == null) return dateKey;
  final diff = DateTime.utc(d.year, d.month, d.day)
      .difference(DateTime.utc(today.year, today.month, today.day))
      .inDays;
  if (diff == 0) return 'Hoje';
  if (diff == 1) return 'Amanhã';
  return trainingWeekdayDay(dateKey);
}

/// "QUI 23".
String trainingWeekdayDay(String dateKey) {
  final w = arenaClassDateKeyWeekday(dateKey);
  final d = DateTime.tryParse(dateKey);
  if (w == null || d == null) return dateKey;
  return '${arenaClassWeekdayShort(w)} ${d.day}'.toUpperCase();
}

/// Rótulo curto do estado (pílula mono).
String trainingStateLabel(TrainingSession t) => switch (t.state) {
      TrainingState.scheduled => t.isPrivate ? 'CONFIRMADA' : 'AGENDADA',
      TrainingState.awaitingProfessor => 'AGUARDANDO',
      TrainingState.canceled => 'CANCELADA',
      TrainingState.present => 'PRESENTE',
      TrainingState.absent => 'FALTA',
      TrainingState.excused => 'FALTA AVISADA',
      TrainingState.done => 'REALIZADA',
    };

/// "Turma", "Particular", "Reposição" ou "Experimental".
String trainingTypeLabel(TrainingSession t) {
  if (t.isPrivate) return 'Particular';
  if (t.isMakeup) return 'Reposição';
  if (t.isTrial) return 'Experimental';
  return switch (t.classEntry?.classType) {
    'particular' => 'Particular',
    'dupla' => 'Dupla',
    'experimental' => 'Experimental',
    _ => 'Turma',
  };
}

// ── auxiliares ───────────────────────────────────────────────────────────

const List<String> _monthShort = [
  'JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', //
  'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ',
];

String _two(int v) => v.toString().padLeft(2, '0');

String _monthKey(DateTime d) => '${d.year}-${_two(d.month)}';

DateTime _feedbackOrder(LessonPlanView v) =>
    v.feedback?.sentAt ??
    DateTime.tryParse(v.date) ??
    DateTime.fromMillisecondsSinceEpoch(0);

/// `YYYY-MM-DD` + `HH:mm` na parede de São Paulo → instante UTC.
DateTime? _wallInstant(String dateKey, String time) {
  final d = DateTime.tryParse(dateKey);
  final parts = time.split(':');
  if (d == null || parts.length < 2) return null;
  final h = int.tryParse(parts[0]);
  final m = int.tryParse(parts[1]);
  if (h == null || m == null) return null;
  return nexagoEventDateTime(
    year: d.year,
    month: d.month,
    day: d.day,
    hour: h,
    minute: m,
  );
}
