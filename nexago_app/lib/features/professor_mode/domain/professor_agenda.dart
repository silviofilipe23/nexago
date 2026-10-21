import 'package:cloud_firestore/cloud_firestore.dart';

import '../../../core/time/nexago_event_timezone.dart';
import '../../arena/domain/aulas/arena_class.dart';
import '../../athlete/domain/agenda/class_agenda_entry.dart';
import 'professor_availability.dart';
import 'professor_lessons.dart';

/// Agenda do professor (fase 5, E1–E8): aulas de turma que ele dá
/// (`getMyClassAgenda`, `role: teacher`), aulas da carteira
/// (`professorLessons` + situação da reserva) e os bloqueios dele
/// (`users/{uid}/professorBlocks`). Tudo vira [ProfessorAgendaItem] no
/// horário de parede de São Paulo; as três visões leem a mesma lista.

// ── bloqueio de período (E7) ─────────────────────────────────────────────

enum ProfessorBlockReason {
  folga('Folga'),
  torneio('Torneio'),
  viagem('Viagem'),
  saude('Saúde'),
  outro('Outro');

  const ProfessorBlockReason(this.label);

  final String label;

  static ProfessorBlockReason parse(Object? raw) {
    for (final r in values) {
      if (r.name == raw) return r;
    }
    return outro;
  }
}

/// Teto do bloqueio (a rule recusa 62 dias ou mais).
const Duration kProfessorBlockMaxDuration = Duration(days: 62);
const int kProfessorBlockLabelMax = 40;
const int kProfessorBlockNoteMax = 300;

/// `users/{uid}/professorBlocks/{id}` — só o dono lê e grava.
class ProfessorBlock {
  const ProfessorBlock({
    required this.id,
    required this.reason,
    required this.reasonLabel,
    required this.startAt,
    required this.endAt,
    this.note,
    this.createdAt,
  });

  static ProfessorBlock? fromMap(String id, Map<String, Object?> map) {
    final start = _instant(map['startAt']);
    final end = _instant(map['endAt']);
    if (start == null || end == null || !end.isAfter(start)) return null;
    final reason = ProfessorBlockReason.parse(map['reason']);
    final label = map['reasonLabel'];
    final note = map['note'];
    return ProfessorBlock(
      id: id,
      reason: reason,
      reasonLabel: label is String && label.trim().isNotEmpty
          ? label.trim()
          : reason.label,
      startAt: start,
      endAt: end,
      note: note is String && note.trim().isNotEmpty ? note.trim() : null,
      createdAt: _instant(map['createdAt']),
    );
  }

  final String id;
  final ProfessorBlockReason reason;
  final String reasonLabel;

  /// Instantes (UTC).
  final DateTime startAt;
  final DateTime endAt;
  final String? note;
  final DateTime? createdAt;
}

/// Erro do formulário do bloqueio (ou `null`), com as regras da rule.
String? validateProfessorBlock({
  required DateTime? startAt,
  required DateTime? endAt,
  String note = '',
}) {
  if (startAt == null || endAt == null) return 'Escolha o início e o fim.';
  if (!endAt.isAfter(startAt)) return 'O fim precisa ser depois do início.';
  if (endAt.difference(startAt) >= kProfessorBlockMaxDuration) {
    return 'Bloqueie no máximo 61 dias por vez.';
  }
  if (note.trim().length > kProfessorBlockNoteMax) {
    return 'A observação vai até $kProfessorBlockNoteMax caracteres.';
  }
  return null;
}

// ── itens da agenda ──────────────────────────────────────────────────────

/// `privateLesson` = particular pedida pelo aluno no app (fase 10);
/// `ownClass` = ocorrência de turma própria (B10, `arenaBookings` com
/// `professorClassId`).
enum ProfessorAgendaKind { session, lesson, block, privateLesson, ownClass }

/// Rótulo do tipo da ocorrência de turma própria.
const String kProfessorOwnClassTypeLabel = 'Turma própria';

/// Uma aula (ou um pedaço de bloqueio) num dia, em minutos do dia (SP).
class ProfessorAgendaItem {
  const ProfessorAgendaItem({
    required this.id,
    required this.kind,
    required this.date,
    required this.startMin,
    required this.endMin,
    required this.title,
    required this.typeLabel,
    this.arenaId,
    this.arenaName,
    this.place = '',
    this.canceled = false,
    this.session,
    this.lesson,
    this.block,
    this.privateLesson,
    this.booking,
  });

  /// `session:{id}`, `lesson:{bookingId}`, `block:{id}:{date}`,
  /// `private:{id}`, `own:{bookingId}`.
  final String id;
  final ProfessorAgendaKind kind;

  /// `YYYY-MM-DD`.
  final String date;
  final int startMin;
  final int endMin;
  final String title;

  /// "Turma", "Particular", "Dupla", "Experimental", "Reposição", "Bloqueio",
  /// "Turma própria".
  final String typeLabel;

  /// `null` no bloqueio.
  final String? arenaId;
  final String? arenaName;

  /// Quadra (e quantos alunos na turma).
  final String place;
  final bool canceled;
  final ClassAgendaEntry? session;
  final ProfessorLesson? lesson;
  final ProfessorBlock? block;
  final PrivateLesson? privateLesson;

  /// A reserva da ocorrência de turma própria.
  final ProfessorCourtBooking? booking;

  /// Turma própria da ocorrência (`null` nos outros tipos).
  String? get ownClassId => booking?.professorClassId;

  bool get isBlock => kind == ProfessorAgendaKind.block;
  int get durationMin => endMin - startMin;
  String get startLabel => professorMinutesLabel(startMin);
  String get endLabel => professorMinutesLabel(endMin);

  /// Letra do bloco na Semana (T, P, D, E, R, B).
  String get letter => switch (typeLabel) {
        'Turma' => 'T',
        'Particular' => 'P',
        'Dupla' => 'D',
        'Experimental' => 'E',
        'Reposição' => 'R',
        'Bloqueio' => 'B',
        kProfessorOwnClassTypeLabel => 'T',
        _ => 'A',
      };
}

/// "07:30" de 450.
String professorMinutesLabel(int minutes) {
  final m = minutes.clamp(0, 24 * 60);
  return '${(m ~/ 60).toString().padLeft(2, '0')}:'
      '${(m % 60).toString().padLeft(2, '0')}';
}

/// "19:00" → 1140 (`null` se inválido).
int? professorParseMinutes(String hhmm) {
  final p = hhmm.split(':');
  if (p.length < 2) return null;
  final h = int.tryParse(p[0]);
  final m = int.tryParse(p[1]);
  if (h == null || m == null) return null;
  return h * 60 + m;
}

/// Monta a agenda: aulas de turma (só as que ele dá), da carteira, as
/// particulares CONFIRMADAS do app, as ocorrências de turma própria e os
/// bloqueios fatiados por dia. O tipo vem do `classType` do item; servidor
/// antigo usa [classTypes] (classId → tipo, da lista de turmas do professor).
///
/// [courtBookings] são as reservas como professor: só as com
/// `professorClassId` viram item (turma própria, nome por [ownClassNames]);
/// canceladas ficam de fora e uma reserva que já é aula da carteira não
/// entra duas vezes.
List<ProfessorAgendaItem> buildProfessorAgendaItems({
  required List<ClassAgendaEntry> sessions,
  required List<ProfessorLesson> lessons,
  required Map<String, String> bookingStatus,
  required List<ProfessorBlock> blocks,
  Map<String, ArenaClassType> classTypes = const {},
  List<PrivateLesson> privateLessons = const [],
  List<ProfessorCourtBooking> courtBookings = const [],
  Map<String, String> ownClassNames = const {},
}) {
  final items = <ProfessorAgendaItem>[];
  final lessonBookingIds = {for (final l in lessons) l.bookingId};
  final seenBookings = <String>{};
  for (final b in courtBookings) {
    final classId = b.professorClassId;
    if (classId == null || b.isVoid) continue;
    if (lessonBookingIds.contains(b.id) || !seenBookings.add(b.id)) continue;
    final start = professorParseMinutes(b.startTime);
    if (start == null || b.date.length != 10) continue;
    final end = professorParseMinutes(b.endTime) ?? start + 60;
    items.add(ProfessorAgendaItem(
      id: 'own:${b.id}',
      kind: ProfessorAgendaKind.ownClass,
      date: b.date,
      startMin: start,
      endMin: end > start ? end : start + 60,
      title: ownClassNames[classId] ?? kProfessorOwnClassTypeLabel,
      typeLabel: kProfessorOwnClassTypeLabel,
      arenaId: b.arenaId,
      arenaName: b.arenaName,
      place: [
        if (b.courtName != null) b.courtName!,
        b.arenaName,
      ].join(' · '),
      booking: b,
    ));
  }
  for (final s in sessions) {
    if (!s.isTeacher) continue;
    final start = professorParseMinutes(s.startTime);
    if (start == null || s.date.length != 10) continue;
    final end = professorParseMinutes(s.endTime) ?? start + 60;
    final type = s.kind == 'makeup'
        ? 'Reposição'
        : s.kind == 'trial'
            ? 'Experimental'
            : professorSessionType(s, classTypes).label;
    final count = s.studentCount;
    items.add(ProfessorAgendaItem(
      id: 'session:${s.sessionId}',
      kind: ProfessorAgendaKind.session,
      date: s.date,
      startMin: start,
      endMin: end > start ? end : start + 60,
      title: s.className,
      typeLabel: type,
      arenaId: s.arenaId,
      arenaName: s.arenaName,
      place: [
        if (s.courtName.isNotEmpty) s.courtName,
        if (count != null && count > 0) '$count aluno${count == 1 ? '' : 's'}',
      ].join(' · '),
      canceled: s.isCanceled,
      session: s,
    ));
  }
  for (final l in lessons) {
    final start = professorParseMinutes(l.startTime);
    if (start == null || l.date.length != 10) continue;
    final end = professorParseMinutes(l.endTime) ?? start + 60;
    items.add(ProfessorAgendaItem(
      id: 'lesson:${l.bookingId}',
      kind: ProfessorAgendaKind.lesson,
      date: l.date,
      startMin: start,
      endMin: end > start ? end : start + 60,
      title: l.studentName,
      typeLabel: 'Particular',
      arenaId: l.arenaId,
      arenaName: l.arenaName,
      place: '${l.courtName} · reservada por você',
      canceled: professorBookingIsVoid(bookingStatus[l.bookingId]),
      lesson: l,
    ));
  }
  for (final p in privateLessons) {
    if (p.status != PrivateLessonStatus.confirmed) continue;
    final start = toNexagoEventLocal(p.startAt);
    final startMin = start.hour * 60 + start.minute;
    items.add(ProfessorAgendaItem(
      id: 'private:${p.id}',
      kind: ProfessorAgendaKind.privateLesson,
      date: p.dateKey,
      startMin: startMin,
      endMin: (startMin + p.durationMin).clamp(startMin + 1, 24 * 60),
      title: 'Particular · ${privateLessonShortName(p.athleteName)}',
      typeLabel: p.pair ? 'Dupla' : 'Particular',
      place: [
        'Pelo app',
        if (p.pair) 'em dupla',
      ].join(' · '),
      privateLesson: p,
    ));
  }
  for (final b in blocks) {
    items.addAll(professorBlockSegments(b));
  }
  items.sort(_byWhen);
  return items;
}

/// Tipo da aula: o que a agenda manda (`classType`); servidor antigo cai no
/// mapa das turmas do professor; sem nada, turma.
ArenaClassType professorSessionType(
  ClassAgendaEntry s,
  Map<String, ArenaClassType> classTypes,
) =>
    s.classType != null
        ? ArenaClassTypeX.fromId(s.classType)
        : classTypes[s.classId] ?? ArenaClassType.turma;

/// O bloqueio em pedaços por dia (parede SP): o primeiro dia a partir da hora
/// de início, o último até a hora de fim, os do meio inteiros.
List<ProfessorAgendaItem> professorBlockSegments(ProfessorBlock b) {
  final start = toNexagoEventLocal(b.startAt);
  final end = toNexagoEventLocal(b.endAt);
  final out = <ProfessorAgendaItem>[];
  var day = DateTime(start.year, start.month, start.day);
  final lastDay = DateTime(end.year, end.month, end.day);
  while (!day.isAfter(lastDay)) {
    final key = _key(day);
    final from = day == DateTime(start.year, start.month, start.day)
        ? start.hour * 60 + start.minute
        : 0;
    final to = day == lastDay ? end.hour * 60 + end.minute : 24 * 60;
    if (to > from) {
      out.add(ProfessorAgendaItem(
        id: 'block:${b.id}:$key',
        kind: ProfessorAgendaKind.block,
        date: key,
        startMin: from,
        endMin: to,
        title: b.reasonLabel,
        typeLabel: 'Bloqueio',
        place: b.note ?? '',
        block: b,
      ));
    }
    day = DateTime(day.year, day.month, day.day + 1);
  }
  return out;
}

int _byWhen(ProfessorAgendaItem a, ProfessorAgendaItem b) {
  final d = a.date.compareTo(b.date);
  if (d != 0) return d;
  final s = a.startMin.compareTo(b.startMin);
  return s != 0 ? s : a.endMin.compareTo(b.endMin);
}

List<ProfessorAgendaItem> professorItemsOn(
  List<ProfessorAgendaItem> items,
  String dateKey,
) =>
    [
      for (final i in items)
        if (i.date == dateKey) i,
    ];

// ── paleta por arena ─────────────────────────────────────────────────────

/// Quantas cores a paleta tem (a tela define as cores, aqui só o índice).
const int kProfessorArenaPaletteSize = 8;

/// Índice da cor de cada arena: parte do hash estável do id e, havendo
/// colisão, anda para a próxima livre (ids em ordem, para dar sempre o
/// mesmo resultado com as mesmas arenas). As três visões usam o mesmo mapa.
Map<String, int> professorArenaPalette(Iterable<String> arenaIds) {
  final ids = {
    for (final id in arenaIds)
      if (id.isNotEmpty) id
  }.toList()
    ..sort();
  final taken = <int>{};
  final out = <String, int>{};
  for (final id in ids) {
    var i = _stableHash(id) % kProfessorArenaPaletteSize;
    for (var tries = 0;
        tries < kProfessorArenaPaletteSize && taken.contains(i);
        tries++) {
      i = (i + 1) % kProfessorArenaPaletteSize;
    }
    taken.add(i);
    out[id] = i;
  }
  return out;
}

/// FNV-1a de 32 bits (o `hashCode` do Dart não é garantido entre execuções).
int _stableHash(String s) {
  var h = 0x811c9dc5;
  for (final c in s.codeUnits) {
    h ^= c;
    h = (h * 0x01000193) & 0xffffffff;
  }
  return h;
}

// ── Dia (E1) ─────────────────────────────────────────────────────────────

enum ProfessorAgendaPhase { done, live, next }

/// Linha do Dia: uma aula/bloqueio, ou o marcador de deslocamento entre
/// duas aulas seguidas em arenas diferentes (sem tempo estimado).
class ProfessorDayEntry {
  const ProfessorDayEntry.item(ProfessorAgendaItem this.item, this.phase)
      : fromArena = null,
        toArena = null;

  const ProfessorDayEntry.travel({
    required String this.fromArena,
    required String this.toArena,
  })  : item = null,
        phase = null;

  final ProfessorAgendaItem? item;
  final ProfessorAgendaPhase? phase;
  final String? fromArena;
  final String? toArena;

  bool get isTravel => item == null;
}

/// Situação da aula agora: concluída, AGORA ou próxima.
ProfessorAgendaPhase professorItemPhase(
  ProfessorAgendaItem i, {
  required String todayKey,
  required int nowMin,
}) {
  final cmp = i.date.compareTo(todayKey);
  if (cmp < 0) return ProfessorAgendaPhase.done;
  if (cmp > 0) return ProfessorAgendaPhase.next;
  if (i.endMin <= nowMin) return ProfessorAgendaPhase.done;
  if (i.startMin <= nowMin) return ProfessorAgendaPhase.live;
  return ProfessorAgendaPhase.next;
}

List<ProfessorDayEntry> professorDayEntries(
  List<ProfessorAgendaItem> items, {
  required String dateKey,
  required String todayKey,
  required int nowMin,
}) {
  final out = <ProfessorDayEntry>[];
  ProfessorAgendaItem? lastLesson;
  for (final i in professorItemsOn(items, dateKey)) {
    if (!i.isBlock && !i.canceled && i.arenaId != null) {
      final prev = lastLesson;
      if (prev != null && prev.arenaId != i.arenaId) {
        out.add(ProfessorDayEntry.travel(
          fromArena: prev.arenaName ?? 'Arena',
          toArena: i.arenaName ?? 'Arena',
        ));
      }
      lastLesson = i;
    }
    out.add(ProfessorDayEntry.item(
      i,
      professorItemPhase(i, todayKey: todayKey, nowMin: nowMin),
    ));
  }
  return out;
}

/// Aulas (sem bloqueios e sem canceladas) num dia — o número da tira.
int professorLessonCountOn(List<ProfessorAgendaItem> items, String dateKey) =>
    items.where((i) => i.date == dateKey && !i.isBlock && !i.canceled).length;

// ── Mês (E3) ─────────────────────────────────────────────────────────────

class ProfessorMonthSummary {
  const ProfessorMonthSummary({
    required this.lessons,
    required this.courtMinutes,
    required this.blockedDays,
  });

  final int lessons;
  final int courtMinutes;

  /// Dias com algum bloqueio.
  final int blockedDays;

  /// "91h" / "1h30".
  String get hoursLabel {
    final h = courtMinutes ~/ 60;
    final m = courtMinutes % 60;
    return m == 0 ? '${h}h' : '${h}h${m.toString().padLeft(2, '0')}';
  }
}

ProfessorMonthSummary professorMonthSummary(
  List<ProfessorAgendaItem> items,
  String monthKey,
) {
  var lessons = 0, minutes = 0;
  final blocked = <String>{};
  for (final i in items) {
    if (!i.date.startsWith(monthKey)) continue;
    if (i.isBlock) {
      blocked.add(i.date);
    } else if (!i.canceled) {
      lessons++;
      minutes += i.durationMin;
    }
  }
  return ProfessorMonthSummary(
    lessons: lessons,
    courtMinutes: minutes,
    blockedDays: blocked.length,
  );
}

Set<String> professorBlockedDays(List<ProfessorAgendaItem> items) => {
      for (final i in items)
        if (i.isBlock) i.date,
    };

// ── conflitos (E6) ───────────────────────────────────────────────────────

/// Dois itens no mesmo horário: arenas diferentes, ou aula × bloqueio.
class ProfessorAgendaConflict {
  const ProfessorAgendaConflict(this.first, this.second);

  final ProfessorAgendaItem first;
  final ProfessorAgendaItem second;

  String get date => first.date;
  int get startMin =>
      first.startMin > second.startMin ? first.startMin : second.startMin;
  int get endMin => first.endMin < second.endMin ? first.endMin : second.endMin;
}

/// Sobreposições que pedem atenção (sem resolver nada): aulas em arenas
/// diferentes ao mesmo tempo, ou aula dentro de um bloqueio. Canceladas não
/// contam; dois bloqueios também não.
List<ProfessorAgendaConflict> professorAgendaConflicts(
  List<ProfessorAgendaItem> items,
) {
  final out = <ProfessorAgendaConflict>[];
  final active = [
    for (final i in items)
      if (!i.canceled) i,
  ]..sort(_byWhen);
  for (var a = 0; a < active.length; a++) {
    for (var b = a + 1; b < active.length; b++) {
      final x = active[a], y = active[b];
      // Em ordem de início: daqui em diante nada mais encosta em [x].
      if (y.date != x.date || y.startMin >= x.endMin) break;
      if (x.isBlock && y.isBlock) continue;
      final clash = x.isBlock || y.isBlock || x.arenaId != y.arenaId;
      if (clash) out.add(ProfessorAgendaConflict(x, y));
    }
  }
  return out;
}

/// Aulas (não canceladas) que caem dentro do período — E7, só informativo.
List<ProfessorAgendaItem> professorItemsAffectedBy(
  List<ProfessorAgendaItem> items, {
  required DateTime startAt,
  required DateTime endAt,
}) {
  final probe = ProfessorBlock(
    id: '__probe__',
    reason: ProfessorBlockReason.outro,
    reasonLabel: '',
    startAt: startAt,
    endAt: endAt,
  );
  final segments = professorBlockSegments(probe);
  return [
    for (final i in items)
      if (!i.isBlock &&
          !i.canceled &&
          segments.any((s) =>
              s.date == i.date &&
              i.startMin < s.endMin &&
              s.startMin < i.endMin))
        i,
  ];
}

// ── intervalos das visões ────────────────────────────────────────────────

enum ProfessorAgendaView { day, week, month }

typedef ProfessorAgendaRange = ({String fromKey, String toKey});

/// Segunda-feira da semana de [dateKey].
String professorWeekStart(String dateKey) {
  final d = DateTime.parse(dateKey);
  return _key(DateTime(d.year, d.month, d.day - (d.weekday - 1)));
}

List<String> professorWeekDays(String dateKey) {
  final start = DateTime.parse(professorWeekStart(dateKey));
  return [
    for (var i = 0; i < 7; i++)
      _key(DateTime(start.year, start.month, start.day + i)),
  ];
}

/// O que carregar para a visão: Dia e Semana = a semana (a tira do Dia
/// mostra a contagem de cada dia); Mês = o mês inteiro. Sempre bem abaixo
/// do teto de 100 dias da callable.
ProfessorAgendaRange professorAgendaRange(
  ProfessorAgendaView view,
  String dateKey,
) {
  if (view == ProfessorAgendaView.month) {
    final d = DateTime.parse(dateKey);
    return (
      fromKey: _key(DateTime(d.year, d.month, 1)),
      toKey: _key(DateTime(d.year, d.month + 1, 0)),
    );
  }
  final days = professorWeekDays(dateKey);
  return (fromKey: days.first, toKey: days.last);
}

/// Dia [days] depois de [dateKey].
String professorShiftDay(String dateKey, int days) {
  final d = DateTime.parse(dateKey);
  return _key(DateTime(d.year, d.month, d.day + days));
}

/// Mesmo dia (ou o último do mês) [months] meses depois.
String professorShiftMonth(String dateKey, int months) {
  final d = DateTime.parse(dateKey);
  final last = DateTime(d.year, d.month + months + 1, 0).day;
  return _key(DateTime(d.year, d.month + months, d.day.clamp(1, last)));
}

/// Dias do mês de [dateKey] (o índice 0 é o dia 1) e quantas casas vazias
/// antes (semana começando na segunda).
({List<String> days, int leading}) professorMonthGrid(String dateKey) {
  final d = DateTime.parse(dateKey);
  final first = DateTime(d.year, d.month, 1);
  final count = DateTime(d.year, d.month + 1, 0).day;
  return (
    days: [
      for (var i = 0; i < count; i++) _key(DateTime(d.year, d.month, i + 1)),
    ],
    leading: first.weekday - 1,
  );
}

String _key(DateTime d) => '${d.year.toString().padLeft(4, '0')}-'
    '${d.month.toString().padLeft(2, '0')}-'
    '${d.day.toString().padLeft(2, '0')}';

DateTime? _instant(Object? v) => switch (v) {
      Timestamp t => t.toDate().toUtc(),
      DateTime d => d.toUtc(),
      _ => null,
    };

// ── sincronizar calendário (E8) ──────────────────────────────────────────

/// Retorno de `configureProfessorCalendarFeed`.
class ProfessorCalendarFeed {
  const ProfessorCalendarFeed({
    required this.url,
    this.showStudentNames = false,
    this.excludedArenaIds = const [],
  });

  factory ProfessorCalendarFeed.fromMap(Map<String, Object?> map) =>
      ProfessorCalendarFeed(
        url: map['url'] is String ? map['url'] as String : '',
        showStudentNames: map['showStudentNames'] == true,
        excludedArenaIds: map['excludedArenaIds'] is List
            ? (map['excludedArenaIds'] as List).whereType<String>().toList()
            : const [],
      );

  /// `https://…/professorCalendarFeed?u=…&t=…` (.ics assinável).
  final String url;
  final bool showStudentNames;
  final List<String> excludedArenaIds;
}

/// Apple Calendário assina por `webcal://` (mesma URL, outro esquema).
String professorWebcalUrl(String feedUrl) =>
    feedUrl.replaceFirst(RegExp(r'^https?://'), 'webcal://');

/// Google Agenda: "Adicionar por URL" com a URL codificada.
String professorGoogleCalendarUrl(String feedUrl) =>
    'https://calendar.google.com/calendar/r?cid=${Uri.encodeComponent(feedUrl)}';

/// Outlook na web: "Assinar" por URL.
String professorOutlookCalendarUrl(String feedUrl) =>
    'https://outlook.live.com/calendar/0/addfromweb?url='
    '${Uri.encodeComponent(feedUrl)}&name=${Uri.encodeComponent('Aulas nexaGO')}';
