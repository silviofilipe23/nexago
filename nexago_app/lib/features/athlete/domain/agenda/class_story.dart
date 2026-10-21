import 'dart:math';

import 'package:flutter/foundation.dart';

import '../../../../core/brand/nexa_hashtag.dart';
import '../../../arenas/domain/arena_booking_labels.dart';
import '../../../arenas/domain/booking_story.dart';
import 'athlete_agenda_logic.dart';
import 'class_agenda_entry.dart';

/// Informações que o atleta liga/desliga no story do treino, na ordem dos
/// chips (Agenda · F3).
enum ClassStoryInfo {
  numbers('Números'),
  place('Arena e horário'),
  people('Coach e turma');

  const ClassStoryInfo(this.label);

  final String label;
}

/// O story do treino é do ALUNO, numa aula que já acabou e em que ele não
/// levou falta: "Treino pago." não vale para aula cancelada, futura ou com
/// falta/justificada. Aula de hoje ainda sem chamada vale — o professor
/// costuma fechar a chamada depois.
bool isClassStoryShareable(ClassAgendaEntry e, DateTime now) {
  if (e.isTeacher || e.isCanceled) return false;
  if (e.myMark == 'absent' || e.myMark == 'excused') return false;
  final end = parseBookingDateTime(e.date, e.endTime) ??
      parseBookingDateTime(e.date, e.startTime);
  return end != null && !now.isBefore(end);
}

/// Os números do treino: duração, qual treino do mês ele é e quantas semanas
/// seguidas o atleta treinou até ele. Contam as aulas com presença na chamada
/// (e a própria aula do story).
@immutable
class ClassStoryStats {
  const ClassStoryStats({
    required this.minutes,
    required this.monthOrdinal,
    required this.weekStreak,
  });

  /// `null` sem horário de fim utilizável.
  final int? minutes;

  /// 1 = primeiro treino do mês.
  final int monthOrdinal;

  /// Semanas (seg–dom) seguidas com treino, terminando na semana da aula.
  final int weekStreak;
}

ClassStoryStats classStoryStats(
  ClassAgendaEntry session,
  Iterable<ClassAgendaEntry> history,
) {
  final attended = <String>{};
  final monthKeys = <String>{};
  final month = session.date.length >= 7 ? session.date.substring(0, 7) : '';
  final self = _orderKey(session);

  for (final e in [...history, session]) {
    final counts = e.sessionId == session.sessionId ||
        (!e.isTeacher && !e.isCanceled && e.myMark == 'present');
    if (!counts) continue;
    final key = _orderKey(e);
    if (key.compareTo(self) > 0) continue;
    final day = parseBookingDateOnly(e.date);
    if (day == null) continue;
    attended.add(_weekKey(day));
    if (month.isNotEmpty && e.date.startsWith(month)) monthKeys.add(key);
  }

  var streak = 0;
  final day = parseBookingDateOnly(session.date);
  if (day != null) {
    var monday = _mondayOf(day);
    while (attended.contains(_weekKey(monday))) {
      streak++;
      monday = DateTime(monday.year, monday.month, monday.day - 7);
    }
  }

  return ClassStoryStats(
    minutes: _minutesBetween(session.startTime, session.endTime),
    monthOrdinal: monthKeys.isEmpty ? 1 : monthKeys.length,
    weekStreak: streak < 1 ? 1 : streak,
  );
}

/// Data + hora + id: duas aulas no mesmo horário contam as duas.
String _orderKey(ClassAgendaEntry e) =>
    '${e.date} ${e.startTime} ${e.sessionId}';

DateTime _mondayOf(DateTime day) =>
    DateTime(day.year, day.month, day.day - (day.weekday - DateTime.monday));

String _weekKey(DateTime day) {
  final m = _mondayOf(day);
  return '${m.year}-${m.month}-${m.day}';
}

int? _minutesBetween(String start, String end) {
  int? toMinutes(String v) {
    final parts = v.trim().split(':');
    if (parts.length < 2) return null;
    final h = int.tryParse(parts[0]);
    final m = int.tryParse(parts[1]);
    return h == null || m == null ? null : h * 60 + m;
  }

  final s = toMinutes(start);
  final e = toMinutes(end);
  if (s == null || e == null || e <= s) return null;
  return e - s;
}

/// Frases grandes da arte, sorteadas a cada story para não sair sempre a
/// mesma. Duas linhas curtas cada: na Sora 54 ExtraBold a mais larga
/// ("Missão cumprida.") ocupa ~270 dos 312 px da arte — frase nova tem de
/// passar no teste de largura (`agenda_class_story_test`).
const List<String> kClassStoryHeadlines = [
  'Treino\npago.',
  'Missão\ncumprida.',
  'Suor\nem dia.',
  'Areia\nno pé.',
  'Mais um\nno bolso.',
  'Hoje\nteve.',
  'Foco\nna areia.',
  'Treinou,\nevoluiu.',
  'Evolução\nem dia.',
  'Rumo ao\npódio.',
  'Hoje foi\npuxado.',
  'Sem\ndesculpa.',
  'Batendo\nponto.',
  'Um passo\nà frente.',
];

/// Sorteia uma frase de [kClassStoryHeadlines], diferente de [avoid] (a do
/// story anterior) para duas aberturas seguidas não repetirem.
String pickClassStoryHeadline({Random? random, String? avoid}) {
  final pool = [
    for (final h in kClassStoryHeadlines)
      if (h != avoid) h,
  ];
  return pool[(random ?? Random()).nextInt(pool.length)];
}

/// Tudo o que a arte do story do treino escreve — já formatado.
@immutable
class ClassStoryData {
  const ClassStoryData({
    required this.kicker,
    required this.stats,
    required this.arenaName,
    required this.placeLine,
    required this.handle,
    required this.withLine,
    required this.noPeopleLine,
    this.people = const [],
  });

  /// `AULA · TREINO TÉCNICO`.
  final String kicker;

  /// `[('90', 'MIN'), ('12º', 'DO MÊS'), ('4', 'SEM. SEGUIDAS')]`.
  final List<(String, String)> stats;
  final String arenaName;

  /// ` · Quadra central · Ter 07:00` (depois do nome da arena, em negrito).
  final String placeLine;

  /// `@ma.beach` (apelido) ou o primeiro nome.
  final String handle;

  /// `com Prof. Júnior e a turma`.
  final String withLine;

  /// Sem "Coach e turma": `Treino técnico · Ter 7h`.
  final String noPeopleLine;

  /// O atleta e o professor (só iniciais: o servidor não manda foto dele).
  final List<BookingStoryPerson> people;
}

ClassStoryData classStoryDataFrom({
  required ClassAgendaEntry session,
  required ClassStoryStats stats,
  required String athleteName,
  String? athleteNickname,
  String? athleteAvatarUrl,
}) {
  final className = session.className.trim();
  final teacher = session.teacherName.trim();
  final teacherFirst = teacher.split(RegExp(r'\s+')).first;
  final weekday = _weekdayShort(session.date);
  final start = session.startTime.length >= 5
      ? session.startTime.substring(0, 5)
      : session.startTime.trim();
  final hour = int.tryParse(start.split(':').first);
  final isGroup = (session.classType ?? 'turma') == 'turma';

  final nickname = athleteNickname?.trim() ?? '';
  final name = athleteName.trim();
  final firstName = name.isEmpty ? '' : name.split(RegExp(r'\s+')).first;

  final withParts = <String>[
    if (teacherFirst.isNotEmpty) 'Prof. $teacherFirst',
    if (isGroup) 'a turma',
  ];

  return ClassStoryData(
    kicker: className.isEmpty ? 'AULA' : 'AULA · ${className.toUpperCase()}',
    stats: [
      if (stats.minutes != null) ('${stats.minutes}', 'MIN'),
      ('${stats.monthOrdinal}º', 'DO MÊS'),
      if (stats.weekStreak >= 2) ('${stats.weekStreak}', 'SEM. SEGUIDAS'),
    ],
    arenaName: session.arenaName.trim(),
    placeLine: [
      if (session.courtName.trim().isNotEmpty) session.courtName.trim(),
      [weekday, start].where((s) => s.isNotEmpty).join(' '),
    ].where((s) => s.isNotEmpty).map((s) => ' · $s').join(),
    handle: nickname.isNotEmpty ? '@$nickname' : firstName,
    withLine: withParts.isEmpty ? '' : 'com ${withParts.join(' e ')}',
    noPeopleLine: [
      if (className.isNotEmpty) className,
      [weekday, if (hour != null) '${hour}h']
          .where((s) => s.isNotEmpty)
          .join(' '),
    ].where((s) => s.isNotEmpty).join(' · '),
    people: [
      if (name.isNotEmpty)
        BookingStoryPerson(
          firstName: firstName,
          initials: _initials(name),
          avatarUrl: (athleteAvatarUrl?.trim() ?? '').isEmpty
              ? null
              : athleteAvatarUrl,
        ),
      if (teacher.isNotEmpty)
        BookingStoryPerson(
            firstName: teacherFirst, initials: _initials(teacher)),
    ],
  );
}

String _initials(String name) {
  final parts =
      name.trim().split(RegExp(r'\s+')).where((p) => p.isNotEmpty).toList();
  if (parts.isEmpty) return '?';
  final first = parts.first[0];
  final last = parts.length > 1 ? parts.last[0] : '';
  return '$first$last'.toUpperCase();
}

/// `2026-05-26` → `Ter`.
String _weekdayShort(String dateKey) {
  final compact = formatTicketDateCompact(dateKey);
  final idx = compact.indexOf('•');
  if (idx <= 0) return '';
  final w = compact.substring(0, idx).trim();
  return w.isEmpty ? '' : '${w[0]}${w.substring(1).toLowerCase()}';
}

/// Legenda que acompanha a imagem na folha de compartilhamento.
String classStoryShareText(ClassAgendaEntry session) {
  final arena = session.arenaName.trim();
  final className = session.className.trim();
  final where = arena.isEmpty ? '' : ' na $arena';
  final what = className.isEmpty ? '' : ' $className.';
  return withNexaHashtag('Treino pago$where!$what');
}
