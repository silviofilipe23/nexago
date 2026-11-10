import '../../athlete/domain/agenda/class_agenda_entry.dart';

/// Emendar a aula (+1h) pelo app do professor (callable `extendArenaClassSession`). A hora a mais
/// ocupa a mesma quadra e desconta da capacidade do horário; sem vaga, o servidor recusa e nada
/// muda. Canvas "Reservas por capacidade · professor emenda a aula (+1h)".

/// Quanto cada emenda acrescenta (igual ao servidor).
const kProfessorExtendMinutes = 60;

class ProfessorSessionExtendResult {
  const ProfessorSessionExtendResult({
    required this.endTime,
    required this.previousEndTime,
    required this.relocatedBookings,
  });

  factory ProfessorSessionExtendResult.fromMap(Map<String, Object?> map) =>
      ProfessorSessionExtendResult(
        endTime: map['endTime']?.toString() ?? '',
        previousEndTime: map['previousEndTime']?.toString() ?? '',
        relocatedBookings: (map['relocatedBookings'] as num?)?.toInt() ?? 0,
      );

  final String endTime;
  final String previousEndTime;

  /// Reservas provisórias que foram para outra quadra para abrir a vaga.
  final int relocatedBookings;
}

int? _minutes(String hhmm) {
  final parts = hhmm.trim().split(':');
  if (parts.length < 2) return null;
  final h = int.tryParse(parts[0]);
  final m = int.tryParse(parts[1]);
  if (h == null || m == null) return null;
  return h * 60 + m;
}

/// Fim depois de emendar a partir de [endTime] ("19:00" → "20:00"); `null` se passaria da
/// meia-noite.
String? professorExtendedEnd(String endTime) {
  final end = _minutes(endTime);
  if (end == null) return null;
  final next = (end == 0 ? 24 * 60 : end) + kProfessorExtendMinutes;
  if (next > 24 * 60) return null;
  final h = (next ~/ 60).toString().padLeft(2, '0');
  final m = (next % 60).toString().padLeft(2, '0');
  return '$h:$m';
}

/// O card "Emendar +1h" aparece: aula da turma (não cancelada), com a chave "Agendar aulas" do
/// vínculo, que ainda não terminou e não passa da meia-noite. [endTime] é o fim atual (pode já
/// ter sido emendado nesta tela).
bool canProfessorExtendSession(
  ClassAgendaEntry e, {
  required String endTime,
  required bool canScheduleLessons,
  required ({String todayKey, int nowMin}) now,
}) {
  if (!canScheduleLessons || e.isCanceled) return false;
  if (professorExtendedEnd(endTime) == null) return false;
  final cmp = e.date.compareTo(now.todayKey);
  if (cmp < 0) return false;
  if (cmp > 0) return true;
  final end = _minutes(endTime);
  return end != null && (end == 0 || now.nowMin < end);
}
