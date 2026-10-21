import 'package:flutter/foundation.dart';

import '../../../../core/brand/nexa_hashtag.dart';
import '../../../arenas/domain/arena_booking_labels.dart';
import '../../../arenas/domain/booking_story.dart';
import 'athlete_agenda_logic.dart';
import 'class_agenda_entry.dart';

/// Informações que o atleta liga/desliga no story do treino, na ordem dos
/// chips (Agenda · F3).
enum ClassStoryInfo {
  /// Só o story do professor tem plano (o atleta não tem de onde tirar).
  plan('Plano do treino'),
  numbers('Números'),
  place('Arena e horário'),
  people('Coach e turma');

  const ClassStoryInfo(this.label);

  final String label;
}

/// Chips que fazem sentido para estes dados: sem plano não há "Plano do
/// treino"; sem gente, nem "Coach e turma"/"Marcar alunos".
List<ClassStoryInfo> classStoryInfosFor(ClassStoryData data) => [
      for (final info in ClassStoryInfo.values)
        if (switch (info) {
          ClassStoryInfo.plan => data.plan.isNotEmpty,
          ClassStoryInfo.people => data.people.isNotEmpty,
          _ => true,
        })
          info,
    ];

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
    minutes: classMinutesBetween(session.startTime, session.endTime),
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

/// Minutos entre `HH:mm` e `HH:mm`; `null` sem fim depois do início.
int? classMinutesBetween(String start, String end) {
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
    this.plan = const [],
    this.footer,
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

  /// Blocos do plano: `[('10′', 'Aquecimento'), …]` (story do professor).
  final List<(String, String)> plan;

  /// Rodapé da arte; `null` = `TREINE TAMBÉM · NEXAGO.APP`.
  final String? footer;
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
  final weekday = classWeekdayShort(session.date);
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
          initials: classStoryInitials(name),
          avatarUrl: (athleteAvatarUrl?.trim() ?? '').isEmpty
              ? null
              : athleteAvatarUrl,
        ),
      if (teacher.isNotEmpty)
        BookingStoryPerson(
            firstName: teacherFirst, initials: classStoryInitials(teacher)),
    ],
  );
}

String classStoryInitials(String name) {
  final parts =
      name.trim().split(RegExp(r'\s+')).where((p) => p.isNotEmpty).toList();
  if (parts.isEmpty) return '?';
  final first = parts.first[0];
  final last = parts.length > 1 ? parts.last[0] : '';
  return '$first$last'.toUpperCase();
}

/// `2026-05-26` → `Ter`.
String classWeekdayShort(String dateKey) {
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
