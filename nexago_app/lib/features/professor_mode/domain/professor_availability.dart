import 'package:cloud_firestore/cloud_firestore.dart';

import '../../../core/time/nexago_event_timezone.dart';
import 'professor_actions_logic.dart' show professorDayLabel;
import 'professor_agenda.dart';
import 'professor_students.dart';

/// Disponibilidade para particulares (A10) e as particulares pedidas pelo
/// aluno no app. Espelha `functions/src/professor-availability.ts`: a grade
/// é de HORAS DE INÍCIO (6–21) por dia ISO; o servidor calcula os horários
/// livres e grava tudo (só callables).

const int kAvailabilityFirstHour = 6;
const int kAvailabilityLastHour = 21;
final List<int> kAvailabilityHours = List.unmodifiable([
  for (var h = kAvailabilityFirstHour; h <= kAvailabilityLastHour; h++) h,
]);
const List<int> kAvailabilityDurations = [30, 60, 90, 120];
const List<int> kAvailabilityNoticeOptions = [0, 1, 2, 4, 8, 12, 24, 48];
const List<int> kAvailabilityFreeCancelOptions = [0, 2, 6, 12, 24, 48];
const int kAvailabilityHoursMax = 72;
const int kPrivateLessonNoteMax = 300;

/// Janela que o aluno vê ao agendar.
const int kPrivateLessonWindowDays = 14;

/// "30 min", "1h", "1h30", "2h".
String availabilityDurationLabel(int minutes) {
  if (minutes < 60) return '$minutes min';
  final h = minutes ~/ 60;
  final m = minutes % 60;
  return m == 0 ? '${h}h' : '${h}h${m.toString().padLeft(2, '0')}';
}

/// "Sem" (0) ou "4h".
String availabilityHoursLabel(int hours) => hours == 0 ? 'Sem' : '${hours}h';

/// As opções do seletor, com o valor gravado incluído (doc antigo/web).
List<int> availabilityOptionsWith(List<int> options, int current) =>
    ({...options, current}.toList()..sort());

/// `professorAvailability/{uid}`.
class ProfessorAvailability {
  const ProfessorAvailability({
    this.weekly = const {},
    this.durationMin = 60,
    this.minNoticeHours = 4,
    this.freeCancelHours = 12,
    this.autoConfirm = true,
    this.acceptPairs = false,
    this.showOnProfile = true,
    this.published = false,
  });

  /// Sem documento: tudo fechado, 60 min, 4h de antecedência, 12h para
  /// cancelar, aluno agenda direto, sem dupla, no perfil.
  static const ProfessorAvailability defaults = ProfessorAvailability();

  factory ProfessorAvailability.fromMap(Map<String, Object?> map) {
    final raw = map['weekly'];
    final weekly = <int, Set<int>>{};
    if (raw is Map) {
      for (var d = 1; d <= 7; d++) {
        final list = raw['$d'];
        if (list is! List) continue;
        final hours = {
          for (final h in list)
            if (h is num &&
                h.toInt() >= kAvailabilityFirstHour &&
                h.toInt() <= kAvailabilityLastHour)
              h.toInt(),
        };
        if (hours.isNotEmpty) weekly[d] = hours;
      }
    }
    final duration = _int(map['durationMin'], 60);
    return ProfessorAvailability(
      weekly: weekly,
      durationMin: kAvailabilityDurations.contains(duration) ? duration : 60,
      minNoticeHours:
          _int(map['minNoticeHours'], 4).clamp(0, kAvailabilityHoursMax),
      freeCancelHours:
          _int(map['freeCancelHours'], 12).clamp(0, kAvailabilityHoursMax),
      autoConfirm: map['autoConfirm'] != false,
      acceptPairs: map['acceptPairs'] == true,
      showOnProfile: map['showOnProfile'] != false,
      published: map['published'] != false,
    );
  }

  /// Dia ISO (1 = segunda) → horas de início abertas.
  final Map<int, Set<int>> weekly;
  final int durationMin;
  final int minNoticeHours;
  final int freeCancelHours;
  final bool autoConfirm;
  final bool acceptPairs;
  final bool showOnProfile;
  final bool published;

  bool isOpen(int weekday, int hour) =>
      weekly[weekday]?.contains(hour) ?? false;

  int get openCount => weekly.values.fold(0, (sum, h) => sum + h.length);

  ProfessorAvailability toggle(int weekday, int hour) {
    final day = {...?weekly[weekday]};
    if (!day.remove(hour)) day.add(hour);
    return copyWith(weekly: {...weekly, weekday: day});
  }

  ProfessorAvailability copyWith({
    Map<int, Set<int>>? weekly,
    int? durationMin,
    int? minNoticeHours,
    int? freeCancelHours,
    bool? autoConfirm,
    bool? acceptPairs,
    bool? showOnProfile,
    bool? published,
  }) =>
      ProfessorAvailability(
        weekly: weekly ?? this.weekly,
        durationMin: durationMin ?? this.durationMin,
        minNoticeHours: minNoticeHours ?? this.minNoticeHours,
        freeCancelHours: freeCancelHours ?? this.freeCancelHours,
        autoConfirm: autoConfirm ?? this.autoConfirm,
        acceptPairs: acceptPairs ?? this.acceptPairs,
        showOnProfile: showOnProfile ?? this.showOnProfile,
        published: published ?? this.published,
      );

  /// Payload de `saveProfessorAvailability`: os sete dias sempre presentes,
  /// horas ordenadas.
  Map<String, Object?> toPayload({bool published = true}) => {
        'weekly': {
          for (var d = 1; d <= 7; d++) '$d': ([...?weekly[d]]..sort()),
        },
        'durationMin': durationMin,
        'minNoticeHours': minNoticeHours,
        'freeCancelHours': freeCancelHours,
        'autoConfirm': autoConfirm,
        'acceptPairs': acceptPairs,
        'showOnProfile': showOnProfile,
        'published': published,
      };
}

// ── particulares ─────────────────────────────────────────────────────────

enum PrivateLessonStatus { pending, confirmed, declined, canceled }

PrivateLessonStatus _status(Object? raw) => switch (raw) {
      'confirmed' => PrivateLessonStatus.confirmed,
      'declined' => PrivateLessonStatus.declined,
      'canceled' => PrivateLessonStatus.canceled,
      _ => PrivateLessonStatus.pending,
    };

String privateLessonStatusLabel(PrivateLessonStatus s) => switch (s) {
      PrivateLessonStatus.pending => 'Aguardando confirmação',
      PrivateLessonStatus.confirmed => 'Confirmada',
      PrivateLessonStatus.declined => 'Recusada',
      PrivateLessonStatus.canceled => 'Cancelada',
    };

/// `professorPrivateLessons/{id}` (só functions gravam).
class PrivateLesson {
  const PrivateLesson({
    required this.id,
    required this.professorUid,
    required this.professorName,
    required this.athleteId,
    required this.athleteName,
    required this.startAt,
    required this.endAt,
    required this.durationMin,
    required this.status,
    this.pair = false,
    this.note = '',
    this.canceledBy,
    this.lateCancel = false,
  });

  static PrivateLesson? fromMap(String id, Map<String, Object?> map) {
    final start = _instant(map['startAt']);
    if (start == null) return null;
    final duration = _int(map['durationMin'], 60);
    final end =
        _instant(map['endAt']) ?? start.add(Duration(minutes: duration));
    final canceledBy = map['canceledBy'];
    return PrivateLesson(
      id: id,
      professorUid: _str(map['professorUid']),
      professorName: _str(map['professorName'], 'Professor'),
      athleteId: _str(map['athleteId']),
      athleteName: _str(map['athleteName'], 'Aluno'),
      startAt: start,
      endAt: end,
      durationMin: duration,
      status: _status(map['status']),
      pair: map['pair'] == true,
      note: _str(map['note']),
      canceledBy:
          canceledBy is String && canceledBy.isNotEmpty ? canceledBy : null,
      lateCancel: map['lateCancel'] == true,
    );
  }

  final String id;
  final String professorUid;
  final String professorName;
  final String athleteId;
  final String athleteName;

  /// Instantes (UTC).
  final DateTime startAt;
  final DateTime endAt;
  final int durationMin;
  final PrivateLessonStatus status;
  final bool pair;
  final String note;

  /// `athlete` | `professor`.
  final String? canceledBy;
  final bool lateCancel;

  bool get isActive =>
      status == PrivateLessonStatus.pending ||
      status == PrivateLessonStatus.confirmed;

  /// Dia `YYYY-MM-DD` em São Paulo.
  String get dateKey => nexagoEventDayKey(startAt);

  /// Ainda dá para cancelar (ativa e antes do início).
  bool canCancelAt(DateTime now) => isActive && startAt.isAfter(now);
}

/// "Sofia R." de "Sofia Ramos" (só o nome quando é um só).
String privateLessonShortName(String name) {
  final parts = name.trim().split(RegExp(r'\s+'));
  if (parts.isEmpty || parts.first.isEmpty) return 'Aluno';
  if (parts.length == 1) return parts.first;
  return '${parts.first} ${parts.last.substring(0, 1).toUpperCase()}.';
}

/// "09:00" (parede SP).
String privateLessonTimeLabel(DateTime instant) {
  final l = toNexagoEventLocal(instant);
  return '${l.hour.toString().padLeft(2, '0')}:'
      '${l.minute.toString().padLeft(2, '0')}';
}

/// "Hoje · 09:00", "Qui 22 · 18:00".
String privateLessonWhenLabel(DateTime startAt, String todayKey) =>
    '${professorDayLabel(nexagoEventDayKey(startAt), todayKey)} · '
    '${privateLessonTimeLabel(startAt)}';

/// Aluno cancelando uma confirmada dentro do prazo sem custo (o servidor
/// marca `lateCancel` com a mesma conta).
bool privateLessonIsLateCancel(
  PrivateLesson l, {
  required DateTime now,
  required int freeCancelHours,
}) =>
    l.status == PrivateLessonStatus.confirmed &&
    l.startAt.difference(now) < Duration(hours: freeCancelHours);

/// "Cancelamento sem custo até 12h antes".
String privateLessonCancelPolicy(int freeCancelHours) => freeCancelHours <= 0
    ? 'Cancelamento sem custo até o início da aula'
    : 'Cancelamento sem custo até ${freeCancelHours}h antes';

/// Próximas (início depois de agora, mais cedo primeiro) e anteriores (mais
/// recente primeiro).
({List<PrivateLesson> upcoming, List<PrivateLesson> past}) splitPrivateLessons(
  List<PrivateLesson> list,
  DateTime now,
) {
  final upcoming = [
    for (final l in list)
      if (l.startAt.isAfter(now)) l,
  ]..sort((a, b) => a.startAt.compareTo(b.startAt));
  final past = [
    for (final l in list)
      if (!l.startAt.isAfter(now)) l,
  ]..sort((a, b) => b.startAt.compareTo(a.startAt));
  return (upcoming: upcoming, past: past);
}

// ── horários livres (aluno) ──────────────────────────────────────────────

class OpenSlot {
  const OpenSlot({required this.startAt, required this.endAt});

  final DateTime startAt;
  final DateTime endAt;

  String get dateKey => nexagoEventDayKey(startAt);
  String get timeLabel => privateLessonTimeLabel(startAt);
}

/// Retorno de `getProfessorOpenSlots`.
class ProfessorOpenSlots {
  const ProfessorOpenSlots({
    this.durationMin = 60,
    this.acceptPairs = false,
    this.autoConfirm = false,
    this.freeCancelHours = 0,
    this.slots = const [],
  });

  factory ProfessorOpenSlots.fromMap(Map<String, Object?> map) {
    final raw = map['slots'];
    final slots = <OpenSlot>[];
    if (raw is List) {
      for (final s in raw) {
        if (s is! Map) continue;
        final start = DateTime.tryParse('${s['startAt']}');
        final end = DateTime.tryParse('${s['endAt']}');
        if (start == null || end == null) continue;
        slots.add(OpenSlot(startAt: start.toUtc(), endAt: end.toUtc()));
      }
    }
    slots.sort((a, b) => a.startAt.compareTo(b.startAt));
    return ProfessorOpenSlots(
      durationMin: _int(map['durationMin'], 60),
      acceptPairs: map['acceptPairs'] == true,
      autoConfirm: map['autoConfirm'] == true,
      freeCancelHours: _int(map['freeCancelHours'], 0),
      slots: slots,
    );
  }

  final int durationMin;
  final bool acceptPairs;
  final bool autoConfirm;
  final int freeCancelHours;
  final List<OpenSlot> slots;
}

typedef OpenSlotDay = ({String dateKey, List<OpenSlot> slots});

/// Horários por dia (SP), na ordem.
List<OpenSlotDay> groupOpenSlotsByDay(List<OpenSlot> slots) {
  final out = <OpenSlotDay>[];
  for (final s in [...slots]..sort((a, b) => a.startAt.compareTo(b.startAt))) {
    final key = s.dateKey;
    if (out.isNotEmpty && out.last.dateKey == key) {
      out.last.slots.add(s);
    } else {
      out.add((dateKey: key, slots: [s]));
    }
  }
  return out;
}

/// Pedido do aluno (`requestPrivateLesson`).
class PrivateLessonRequest {
  const PrivateLessonRequest({
    required this.professorUid,
    required this.startAt,
    this.pair = false,
    this.note = '',
  });

  final String professorUid;
  final DateTime startAt;
  final bool pair;
  final String note;

  Map<String, Object?> toPayload() {
    final n = note.trim();
    return {
      'professorUid': professorUid,
      'startAt': startAt.toUtc().toIso8601String(),
      'pair': pair,
      if (n.isNotEmpty)
        'note': n.length > kPrivateLessonNoteMax
            ? n.substring(0, kPrivateLessonNoteMax)
            : n,
    };
  }
}

typedef PrivateLessonRequestResult = ({
  String lessonId,
  PrivateLessonStatus status
});

// ── grade A10 ────────────────────────────────────────────────────────────

enum AvailabilityCellState { closed, open, fixedClass, booked, blocked }

String availabilityCellStateLabel(AvailabilityCellState s) => switch (s) {
      AvailabilityCellState.closed => 'Fechado',
      AvailabilityCellState.open => 'Livre p/ particular',
      AvailabilityCellState.fixedClass => 'Turma fixa',
      AvailabilityCellState.booked => 'Particular agendada',
      AvailabilityCellState.blocked => 'Bloqueado',
    };

class AvailabilityCell {
  const AvailabilityCell({
    required this.hour,
    required this.state,
    required this.label,
  });

  final int hour;
  final AvailabilityCellState state;

  /// "Livre", "Fechado", nome da turma, "Sofia R." ou o motivo do bloqueio.
  final String label;

  /// Turma, particular e bloqueio são só leitura.
  bool get toggleable =>
      state == AvailabilityCellState.open ||
      state == AvailabilityCellState.closed;

  String get hourLabel => '${hour.toString().padLeft(2, '0')}:00';
}

/// Células de um dia da grade: a hora aberta/fechada da semana-modelo e, por
/// cima (só leitura), o que já ocupa a data [dateKey] desta semana —
/// bloqueio, particular (pendente ou confirmada) e turma fixa, nessa ordem.
List<AvailabilityCell> availabilityDayCells({
  required ProfessorAvailability availability,
  required int weekday,
  required String dateKey,
  List<ProfessorClassSummary> classes = const [],
  List<PrivateLesson> lessons = const [],
  List<ProfessorBlock> blocks = const [],
}) {
  final blockSegments = [
    for (final b in blocks)
      for (final s in professorBlockSegments(b))
        if (s.date == dateKey) s,
  ];
  final dayLessons = [
    for (final l in lessons)
      if (l.isActive && l.dateKey == dateKey) l,
  ];
  final dayClasses = [
    for (final c in classes)
      if (c.weekdays.contains(weekday) && c.status != 'archived') c,
  ];
  bool hits(int from, int to, int h) => from < (h + 1) * 60 && h * 60 < to;
  int wallMin(DateTime instant) {
    final l = toNexagoEventLocal(instant);
    return l.hour * 60 + l.minute;
  }

  return [
    for (final h in kAvailabilityHours)
      () {
        for (final s in blockSegments) {
          if (hits(s.startMin, s.endMin, h)) {
            return AvailabilityCell(
              hour: h,
              state: AvailabilityCellState.blocked,
              label: s.title,
            );
          }
        }
        for (final l in dayLessons) {
          final start = wallMin(l.startAt);
          var end = wallMin(l.endAt);
          if (end <= start) end = start + l.durationMin;
          if (hits(start, end, h)) {
            return AvailabilityCell(
              hour: h,
              state: AvailabilityCellState.booked,
              label: privateLessonShortName(l.athleteName),
            );
          }
        }
        for (final c in dayClasses) {
          final start = professorParseMinutes(c.startTime);
          if (start == null) continue;
          final rawEnd = professorParseMinutes(c.endTime) ?? start + 60;
          if (hits(start, rawEnd > start ? rawEnd : start + 60, h)) {
            return AvailabilityCell(
              hour: h,
              state: AvailabilityCellState.fixedClass,
              label: c.name,
            );
          }
        }
        final open = availability.isOpen(weekday, h);
        return AvailabilityCell(
          hour: h,
          state:
              open ? AvailabilityCellState.open : AvailabilityCellState.closed,
          label: open ? 'Livre' : 'Fechado',
        );
      }(),
  ];
}

// ── helpers ──────────────────────────────────────────────────────────────

String _str(Object? v, [String fallback = '']) {
  final s = v is String ? v.trim() : '';
  return s.isEmpty ? fallback : s;
}

int _int(Object? v, int fallback) => v is num ? v.toInt() : fallback;

DateTime? _instant(Object? v) => switch (v) {
      Timestamp t => t.toDate().toUtc(),
      DateTime d => d.toUtc(),
      String s => DateTime.tryParse(s)?.toUtc(),
      _ => null,
    };
