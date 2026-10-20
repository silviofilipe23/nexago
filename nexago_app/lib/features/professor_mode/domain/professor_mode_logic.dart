import '../../athlete/domain/agenda/class_agenda_entry.dart';
import '../../professor_links/domain/arena_professor_link.dart';
import '../../professor_links/domain/professor_link_rules.dart';

/// Regras do modo Professor (papel `professor`): o que a home mostra a partir
/// das aulas que a pessoa dá (`getMyClassAgenda`, `role: teacher`) e dos
/// vínculos dela com as arenas (`arenaProfessors`). Quem autoriza chamada e
/// reserva é sempre o servidor — aqui só se decide o que oferecer.

/// `YYYY-MM-DD` do dia local (mesmo formato do `date` das aulas).
String professorDateKey(DateTime day) =>
    '${day.year.toString().padLeft(4, '0')}-'
    '${day.month.toString().padLeft(2, '0')}-'
    '${day.day.toString().padLeft(2, '0')}';

int _byDateAndTime(ClassAgendaEntry a, ClassAgendaEntry b) {
  final byDate = a.date.compareTo(b.date);
  return byDate != 0 ? byDate : a.startTime.compareTo(b.startTime);
}

/// Aulas que dou no dia, por horário. Cancelada fica (aparece riscada): o
/// professor precisa saber que não tem aula.
List<ClassAgendaEntry> professorClassesOn(
  List<ClassAgendaEntry> entries,
  String dateKey,
) =>
    [
      for (final e in entries)
        if (e.isTeacher && e.date == dateKey) e,
    ]..sort(_byDateAndTime);

/// Próximas aulas depois de hoje (até [days] dias), sem as canceladas.
List<ClassAgendaEntry> professorUpcomingClasses(
  List<ClassAgendaEntry> entries,
  DateTime today, {
  int days = 7,
  int limit = 5,
}) {
  final todayKey = professorDateKey(today);
  final lastKey = professorDateKey(
    DateTime(today.year, today.month, today.day + days),
  );
  final upcoming = [
    for (final e in entries)
      if (e.isTeacher &&
          !e.isCanceled &&
          e.date.compareTo(todayKey) > 0 &&
          e.date.compareTo(lastKey) <= 0)
        e,
  ]..sort(_byDateAndTime);
  return upcoming.take(limit).toList();
}

/// Aulas de dias anteriores com a chamada ainda aberta (não fechada nem
/// cancelada) — "ficou pendente" na home.
List<ClassAgendaEntry> professorPendingAttendance(
  List<ClassAgendaEntry> entries,
  String todayKey,
) =>
    [
      for (final e in entries)
        if (e.isTeacher &&
            e.canManageLessons &&
            e.status == 'scheduled' &&
            e.date.compareTo(todayKey) < 0)
          e,
    ]..sort((a, b) => _byDateAndTime(b, a));

/// Botão da aula: "Fazer chamada" no dia (ou depois, se ficou aberta), "Ver
/// chamada" depois de fechada e "Ver lista" antes do dia — a chamada só abre
/// no dia da aula. `null` sem o botão (aula cancelada ou vínculo sem
/// "Gerenciar as próprias aulas").
String? professorClassCta(ClassAgendaEntry e, String todayKey) {
  if (!e.isTeacher || !e.canManageLessons || e.isCanceled) return null;
  if (e.status == 'completed') return 'Ver chamada';
  if (e.date.compareTo(todayKey) > 0) return 'Ver lista';
  return 'Fazer chamada';
}

/// "Arena Sol · Quadra 2 · 6 alunos".
String professorClassSubtitle(ClassAgendaEntry e) {
  final count = e.studentCount ?? 0;
  return [
    e.arenaName,
    if (e.courtName.isNotEmpty) e.courtName,
    '$count aluno${count == 1 ? '' : 's'}',
  ].join(' · ');
}

/// Arenas em que posso reservar como professor agora (vínculo `ACTIVE` com
/// "Reservar quadras"), por nome.
List<ArenaProfessorLink> professorBookableArenas(
  List<ArenaProfessorLink> links,
) =>
    [
      for (final link in links)
        if (effectiveProfessorPermissions(link).canBookCourts) link,
    ]..sort(
        (a, b) =>
            a.arenaName.toLowerCase().compareTo(b.arenaName.toLowerCase()),
      );

int professorActiveLinkCount(List<ArenaProfessorLink> links, DateTime now) =>
    links
        .where(
          (l) =>
              effectiveProfessorLinkStatus(l, now) ==
              ArenaProfessorLinkStatus.active,
        )
        .length;

/// Rodapé do card "Professor" no seletor de papéis: "2 ARENAS ATIVAS". Sem
/// vínculo ativo (encerrado/suspenso — a claim não é removida), avisa.
String professorRoleFooter(List<ArenaProfessorLink> links, DateTime now) {
  final active = professorActiveLinkCount(links, now);
  if (active == 0) return 'NENHUMA ARENA ATIVA';
  return active == 1 ? '1 ARENA ATIVA' : '$active ARENAS ATIVAS';
}

/// O token já liberou o modo Professor? Só pede refresh quando há vínculo
/// ativo e a claim ainda não veio (aceite/aprovação com o app aberto).
bool professorRoleNeedsRefresh({
  required List<String> tokenRoles,
  required List<ArenaProfessorLink> links,
  required DateTime now,
}) =>
    !tokenRoles.contains('professor') &&
    professorActiveLinkCount(links, now) > 0;
