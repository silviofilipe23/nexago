import '../../../core/brand/nexa_hashtag.dart';
import '../../athlete/domain/agenda/class_agenda_entry.dart';
import '../../athlete/domain/agenda/class_story.dart';
import '../../athlete/domain/agenda/teacher_class_roster.dart';

/// "Story do treino" no detalhe da aula (E4): aula dele, não cancelada, com a
/// chamada liberada pelo vínculo e que já TERMINOU (hoje depois do fim ou
/// antes de hoje). A tela G1 lista os presentes pela chamada.
bool isProfessorClassStoryAvailable(
  ClassAgendaEntry e,
  ({String todayKey, int nowMin}) now,
) {
  if (!e.isTeacher || e.isCanceled || !e.canManageLessons) return false;
  final cmp = e.date.compareTo(now.todayKey);
  if (cmp < 0) return true;
  if (cmp > 0) return false;
  final end = _minutesOfDay(e.endTime);
  return end != null && now.nowMin >= end;
}

int? _minutesOfDay(String hhmm) {
  final parts = hhmm.trim().split(':');
  if (parts.length < 2) return null;
  final h = int.tryParse(parts[0]);
  final m = int.tryParse(parts[1]);
  return h == null || m == null ? null : h * 60 + m;
}

/// Números do "Treino encerrado" (G1) a partir da chamada.
({int? minutes, int present, int total, int taggable}) professorClassSummary(
  TeacherClassRoster roster,
) {
  final s = roster.session;
  return (
    minutes: classMinutesBetween(s.startTime, s.endTime),
    present: roster.students.where((x) => x.isPresent).length,
    total: roster.students.length,
    taggable:
        roster.students.where((x) => x.isPresent && x.storyTaggable).length,
  );
}

/// Quem o professor pode marcar: presente e liberou a marcação.
List<TeacherClassRosterStudent> professorStoryTaggable(
  TeacherClassRoster roster,
) =>
    [
      for (final s in roster.students)
        if (s.isPresent && s.storyTaggable) s,
    ];

/// Legenda da folha de compartilhamento do story do professor.
String professorClassStoryShareText(TeacherClassRosterSession s) {
  final where = s.arenaName.trim().isEmpty ? '' : ' na ${s.arenaName.trim()}';
  final what = s.className.trim().isEmpty ? '' : ' ${s.className.trim()}.';
  return withNexaHashtag('Treino pago$where!$what');
}
