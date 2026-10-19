import '../../../../core/formatting/app_date_format.dart';
import 'arena_class.dart';
import 'arena_class_session.dart';

// Regras puras das Aulas no app da arena: status da aula no dia, KPIs,
// semana do seletor, rótulos e o rascunho da chamada. Sem Flutter/Firestore —
// tudo testável com `now` fixo.

/// Onde a aula está no dia, do ponto de vista de quem opera a arena.
enum ArenaClassPhase {
  /// Começou e ainda não terminou ("AGORA").
  live,

  /// Ainda vai começar.
  upcoming,

  /// Terminou pelo relógio ou teve a chamada fechada.
  done,

  /// Cancelada (quadra liberada).
  canceled,
}

/// Duração usada quando o horário gravado é inválido (não deveria acontecer:
/// o backend valida fim > início).
const Duration _fallbackDuration = Duration(hours: 1);

int? _minutesOf(String hm) {
  final parts = hm.split(':');
  if (parts.length < 2) return null;
  final h = int.tryParse(parts[0]);
  final m = int.tryParse(parts[1]);
  if (h == null || m == null) return null;
  return h * 60 + m;
}

/// Início da aula. Prefere o instante gravado pelo backend (`startAt`, já no
/// fuso de São Paulo); sem ele, monta data + hora no relógio do aparelho.
DateTime arenaClassSessionStart(ArenaClassSession s) {
  final startAt = s.startAt;
  if (startAt != null) return startAt;
  final date = DateTime.tryParse(s.date) ?? DateTime(1970);
  final minutes = _minutesOf(s.startTime) ?? 0;
  return DateTime(date.year, date.month, date.day).add(
    Duration(minutes: minutes),
  );
}

/// Fim da aula = início + (fim − início) do horário gravado.
DateTime arenaClassSessionEnd(ArenaClassSession s) {
  final start = _minutesOf(s.startTime);
  final end = _minutesOf(s.endTime);
  final duration = (start != null && end != null && end > start)
      ? Duration(minutes: end - start)
      : _fallbackDuration;
  return arenaClassSessionStart(s).add(duration);
}

ArenaClassPhase arenaClassSessionPhase(ArenaClassSession s, DateTime now) {
  if (s.isCanceled) return ArenaClassPhase.canceled;
  if (s.isCompleted) return ArenaClassPhase.done;
  if (!now.isBefore(arenaClassSessionEnd(s))) return ArenaClassPhase.done;
  if (!now.isBefore(arenaClassSessionStart(s))) return ArenaClassPhase.live;
  return ArenaClassPhase.upcoming;
}

/// Um cartão da lista "Aulas do dia".
class ArenaClassDayItem {
  const ArenaClassDayItem({
    required this.session,
    required this.phase,
    required this.studentCount,
    this.isNext = false,
  });

  final ArenaClassSession session;
  final ArenaClassPhase phase;

  /// Alunos ativos da turma (o contador vive no doc da turma).
  final int studentCount;

  /// A próxima aula de hoje a começar ("PRÓXIMA").
  final bool isNext;

  /// Terminou pelo relógio mas ninguém fechou a chamada.
  bool get attendancePending =>
      phase == ArenaClassPhase.done && session.isScheduled;
}

/// A lista do dia já separada em seções, com os 3 KPIs do topo.
class ArenaClassDayView {
  const ArenaClassDayView({
    required this.active,
    required this.done,
    required this.canceled,
    required this.studentTotal,
    required this.occupancyPercent,
    required this.classCount,
  });

  static const ArenaClassDayView empty = ArenaClassDayView(
    active: [],
    done: [],
    canceled: [],
    studentTotal: 0,
    occupancyPercent: null,
    classCount: 0,
  );

  /// Ao vivo + por começar, em ordem de horário.
  final List<ArenaClassDayItem> active;
  final List<ArenaClassDayItem> done;
  final List<ArenaClassDayItem> canceled;

  /// Soma dos alunos das aulas não canceladas.
  final int studentTotal;

  /// Alunos ÷ vagas das aulas não canceladas; `null` sem vagas.
  final int? occupancyPercent;

  /// Aulas não canceladas.
  final int classCount;

  bool get isEmpty => active.isEmpty && done.isEmpty && canceled.isEmpty;
}

int _compareSessions(ArenaClassSession a, ArenaClassSession b) {
  final byStart =
      arenaClassSessionStart(a).compareTo(arenaClassSessionStart(b));
  if (byStart != 0) return byStart;
  return a.className.toLowerCase().compareTo(b.className.toLowerCase());
}

/// Monta a visão do dia a partir das aulas e das turmas (para o nº de alunos).
ArenaClassDayView buildArenaClassDayView({
  required List<ArenaClassSession> sessions,
  required Map<String, ArenaClass> classesById,
  required DateTime now,
}) {
  final sorted = [...sessions]..sort(_compareSessions);
  final todayKey = calendarDateKey(now);
  final active = <ArenaClassDayItem>[];
  final done = <ArenaClassDayItem>[];
  final canceled = <ArenaClassDayItem>[];
  var students = 0;
  var capacity = 0;
  var markedNext = false;

  for (final s in sorted) {
    final phase = arenaClassSessionPhase(s, now);
    // Turma apagada/ilegível: a chamada ainda diz quantos foram marcados.
    final studentCount =
        classesById[s.classId]?.studentCount ?? s.attendance.length;
    final isNext =
        !markedNext && phase == ArenaClassPhase.upcoming && s.date == todayKey;
    if (isNext) markedNext = true;
    final item = ArenaClassDayItem(
      session: s,
      phase: phase,
      studentCount: studentCount,
      isNext: isNext,
    );
    switch (phase) {
      case ArenaClassPhase.live:
      case ArenaClassPhase.upcoming:
        active.add(item);
      case ArenaClassPhase.done:
        done.add(item);
      case ArenaClassPhase.canceled:
        canceled.add(item);
    }
    if (phase != ArenaClassPhase.canceled) {
      students += studentCount;
      capacity += s.capacity;
    }
  }

  return ArenaClassDayView(
    active: active,
    done: done,
    canceled: canceled,
    studentTotal: students,
    occupancyPercent: capacity > 0 ? (students * 100 / capacity).round() : null,
    classCount: active.length + done.length,
  );
}

/// Segunda a domingo da semana de [day] (datas sem hora).
List<DateTime> arenaClassWeekDays(DateTime day) {
  // Aritmética de calendário (não `subtract(Duration)`), imune a horário de
  // verão no fuso do aparelho.
  final mondayDay = day.day - (day.weekday - 1);
  return [
    for (var i = 0; i < 7; i++) DateTime(day.year, day.month, mondayDay + i),
  ];
}

const List<String> _weekdayInitials = ['S', 'T', 'Q', 'Q', 'S', 'S', 'D'];
const List<String> _weekdayShort = [
  'Seg',
  'Ter',
  'Qua',
  'Qui',
  'Sex',
  'Sáb',
  'Dom'
];
const List<String> _monthShort = [
  'jan',
  'fev',
  'mar',
  'abr',
  'mai',
  'jun',
  'jul',
  'ago',
  'set',
  'out',
  'nov',
  'dez',
];

/// Inicial do dia no seletor (S T Q Q S S D).
String arenaClassWeekdayInitial(DateTime day) =>
    _weekdayInitials[day.weekday - 1];

/// "SEG, 19 OUT" — montado à mão: o `DateFormat` pt_BR põe ponto na
/// abreviação ("seg., 19 out.").
String arenaClassDayHeading(DateTime day) =>
    '${_weekdayShort[day.weekday - 1]}, ${day.day.toString().padLeft(2, '0')} '
            '${_monthShort[day.month - 1]}'
        .toUpperCase();

String _ddMm(String dateKey) {
  final parts = dateKey.split('-');
  if (parts.length != 3) return dateKey;
  return '${parts[2]}/${parts[1]}';
}

/// "Seg · Qua · 07:00–08:00" (turma) ou "21/10 · 17:00–18:00" (avulsa).
String arenaClassScheduleLabel(ArenaClass c) {
  final when = c.isSingle
      ? _ddMm(c.startDate)
      : c.weekdays.map((d) => _weekdayShort[d - 1]).join(' · ');
  return '$when · ${c.startTime}–${c.endTime}';
}

/// Datas futuras (a partir de hoje) sem aula porque a quadra estava ocupada.
int arenaClassPendingConflicts(ArenaClass c, String todayKey) =>
    c.conflictDates.where((d) => d.compareTo(todayKey) >= 0).length;

/// Turmas da aba "Turmas": sem as encerradas e sem avulsas que já passaram;
/// ativas antes das pausadas, turmas antes das avulsas, depois pelo primeiro
/// dia da semana e horário.
List<ArenaClass> arenaClassesForList(
    List<ArenaClass> classes, String todayKey) {
  final visible = classes.where((c) {
    if (c.isArchived) return false;
    if (c.isSingle && c.startDate.compareTo(todayKey) < 0) return false;
    return true;
  }).toList();
  int rank(ArenaClass c) => (c.isActive ? 0 : 2) + (c.isSingle ? 1 : 0);
  visible.sort((a, b) {
    final byRank = rank(a).compareTo(rank(b));
    if (byRank != 0) return byRank;
    if (a.isSingle && b.isSingle) {
      final byDate = a.startDate.compareTo(b.startDate);
      if (byDate != 0) return byDate;
    } else if (!a.isSingle && !b.isSingle) {
      final byDay = a.weekdays.first.compareTo(b.weekdays.first);
      if (byDay != 0) return byDay;
    }
    final byTime = a.startTime.compareTo(b.startTime);
    if (byTime != 0) return byTime;
    return a.name.toLowerCase().compareTo(b.name.toLowerCase());
  });
  return visible;
}

/// A chamada abre no dia da aula (mesma trava do backend) e não existe em
/// aula cancelada.
bool arenaClassAttendanceOpen(ArenaClassSession s, String todayKey) =>
    !s.isCanceled && s.date.compareTo(todayKey) <= 0;

/// Prévia do push que o backend manda aos alunos com conta ao cancelar —
/// mesma frase de `cancelClassSessionCore`.
String arenaClassCancelPushBody(
  ArenaClassSession s,
  ArenaClassCancelReason reason,
) {
  final label = reason.pushLabel;
  return 'A aula ${s.className} de ${_ddMm(s.date)} às ${s.startTime} foi '
      'cancelada pela arena${label.isEmpty ? '' : ' ($label)'}.';
}

/// Iniciais para o avatar ("Felipe Rocha" → "FR").
String arenaClassInitials(String name) {
  final parts =
      name.trim().split(RegExp(r'\s+')).where((p) => p.isNotEmpty).toList();
  if (parts.isEmpty) return '?';
  if (parts.length == 1) return parts.first.substring(0, 1).toUpperCase();
  return '${parts.first[0]}${parts.last[0]}'.toUpperCase();
}

/// Alunos da chamada: os ativos da turma e os que saíram mas já têm marca
/// nesta aula (a chamada não perde histórico). Ordem alfabética.
List<ArenaClassStudent> arenaClassAttendanceRoster(
  List<ArenaClassStudent> students,
  Map<String, AttendanceMark> attendance,
) {
  final roster = students
      .where((s) => s.isActive || attendance.containsKey(s.id))
      .toList()
    ..sort((a, b) => a.name.toLowerCase().compareTo(b.name.toLowerCase()));
  return roster;
}

/// Contagem da chamada.
class AttendanceSummary {
  const AttendanceSummary({
    required this.present,
    required this.absent,
    required this.excused,
    required this.unmarked,
  });

  final int present;
  final int absent;
  final int excused;
  final int unmarked;

  int get total => present + absent + excused + unmarked;
}

/// Rascunho local da chamada: o gestor marca à vontade e só grava ao fechar.
/// Imutável — cada mudança devolve um novo rascunho.
class ArenaClassAttendanceDraft {
  const ArenaClassAttendanceDraft(this.marks);

  /// studentId (todos do roster) → marca; `null` = sem marca.
  final Map<String, AttendanceMark?> marks;

  factory ArenaClassAttendanceDraft.fromSession(
    Iterable<String> rosterIds,
    Map<String, AttendanceMark> attendance,
  ) =>
      ArenaClassAttendanceDraft({
        for (final id in rosterIds) id: attendance[id],
      });

  ArenaClassAttendanceDraft withMark(String studentId, AttendanceMark? mark) =>
      ArenaClassAttendanceDraft({...marks, studentId: mark});

  /// "Todos presentes": marca presente só quem está sem marca — falta e
  /// aviso já anotados não são apagados.
  ArenaClassAttendanceDraft withUnmarkedPresent() => ArenaClassAttendanceDraft({
        for (final e in marks.entries) e.key: e.value ?? AttendanceMark.present,
      });

  bool get hasAnyMark => marks.values.any((m) => m != null);

  AttendanceSummary get summary {
    var present = 0, absent = 0, excused = 0, unmarked = 0;
    for (final m in marks.values) {
      switch (m) {
        case AttendanceMark.present:
          present++;
        case AttendanceMark.absent:
          absent++;
        case AttendanceMark.excused:
          excused++;
        case null:
          unmarked++;
      }
    }
    return AttendanceSummary(
      present: present,
      absent: absent,
      excused: excused,
      unmarked: unmarked,
    );
  }

  /// Difere do que está gravado na aula?
  bool differsFrom(Map<String, AttendanceMark> saved) {
    for (final e in marks.entries) {
      if (saved[e.key] != e.value) return true;
    }
    return false;
  }

  /// Payload de `saveArenaClassAttendance.marks` — `null` apaga a marca.
  Map<String, String?> toPayload() => {
        for (final e in marks.entries) e.key: e.value?.id,
      };
}
