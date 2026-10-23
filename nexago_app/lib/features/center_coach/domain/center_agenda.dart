import '../../professor_mode/domain/professor_agenda.dart'
    show professorParseMinutes;
import 'center_coach.dart';

/// Agenda do centro nas três visões (Dia · Semana · Mês), como a do
/// Professor: as funções de datas vêm de `professor_agenda.dart`
/// (`professorAgendaRange`, `professorWeekDays`, `professorMonthGrid`…).

/// Início e fim da aula em minutos do dia (`null` com horário inválido).
({int start, int end})? centerSessionMinutes(CenterCoachSession s) {
  final start = professorParseMinutes(s.startTime);
  if (start == null) return null;
  return (start: start, end: start + s.durationMin);
}

/// Aulas de [dateKey], em ordem de horário.
List<CenterCoachSession> centerSessionsOn(
  List<CenterCoachSession> sessions,
  String dateKey,
) =>
    [
      for (final s in sessions)
        if (s.date == dateKey) s,
    ]..sort((a, b) => a.startTime.compareTo(b.startTime));

/// Aulas que acontecem (não canceladas) em [dateKey].
int centerSessionCountOn(List<CenterCoachSession> sessions, String dateKey) =>
    sessions.where((s) => s.date == dateKey && !s.isCancelled).length;

/// Números do mês (`YYYY-MM`): aulas, horas em quadra e canceladas.
({int sessions, int minutes, int cancelled}) centerMonthSummary(
  List<CenterCoachSession> sessions,
  String month,
) {
  var n = 0, min = 0, cancelled = 0;
  for (final s in sessions) {
    if (!s.date.startsWith(month)) continue;
    if (s.isCancelled) {
      cancelled++;
    } else {
      n++;
      min += s.durationMin;
    }
  }
  return (sessions: n, minutes: min, cancelled: cancelled);
}

/// "12h" / "12h30".
String centerHoursLabel(int minutes) {
  final h = minutes ~/ 60, m = minutes % 60;
  return m == 0 ? '${h}h' : '${h}h${m.toString().padLeft(2, '0')}';
}

const _monthsLong = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', //
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

/// "Outubro 2026" do mês de [dateKey].
String centerMonthTitle(String dateKey) =>
    '${_monthsLong[int.parse(dateKey.substring(5, 7)) - 1]} '
    '${dateKey.substring(0, 4)}';
