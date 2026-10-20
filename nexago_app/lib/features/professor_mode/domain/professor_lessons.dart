import 'package:cloud_firestore/cloud_firestore.dart';

import '../../../core/time/nexago_event_timezone.dart';
import '../../professor_links/domain/arena_professor_link.dart';
import '../../professor_links/domain/professor_link_rules.dart';

/// Aulas da carteira e custo de quadra do professor independente (fase 4).
///
/// A aula é uma reserva feita COMO PROFESSOR ligada a um aluno da carteira
/// (`professorLessons/{bookingId}`, só functions escrevem). A situação da
/// aula é a da reserva (`arenaBookings/{bookingId}.status`) — o doc da aula
/// não repete status.

/// `professorLessons/{bookingId}`.
class ProfessorLesson {
  const ProfessorLesson({
    required this.bookingId,
    required this.athleteId,
    required this.studentName,
    required this.arenaId,
    required this.arenaName,
    required this.courtName,
    required this.date,
    required this.startTime,
    required this.endTime,
    required this.courtCostReais,
  });

  factory ProfessorLesson.fromMap(String id, Map<String, Object?> map) =>
      ProfessorLesson(
        bookingId: _str(map['bookingId'], id),
        athleteId: _str(map['athleteId']),
        studentName: _str(map['studentName'], 'Aluno'),
        arenaId: _str(map['arenaId']),
        arenaName: _str(map['arenaName'], 'Arena'),
        courtName: _str(map['courtName'], 'Quadra'),
        date: _dateKey(map['date']),
        startTime: _str(map['startTime']),
        endTime: _str(map['endTime']),
        courtCostReais: _num(map['courtCostReais']) ?? 0,
      );

  final String bookingId;
  final String athleteId;
  final String studentName;
  final String arenaId;
  final String arenaName;
  final String courtName;

  /// `YYYY-MM-DD`.
  final String date;
  final String startTime;
  final String endTime;
  final double courtCostReais;
}

/// Reserva de quadra feita como professor (`arenaBookings` com
/// `bookedAs: professor`) — o custo de quadra do professor.
class ProfessorCourtBooking {
  const ProfessorCourtBooking({
    required this.id,
    required this.date,
    required this.startTime,
    required this.amountReais,
    required this.status,
    this.arenaName = 'Arena',
    this.courtName,
  });

  factory ProfessorCourtBooking.fromMap(String id, Map<String, Object?> map) =>
      ProfessorCourtBooking(
        id: id,
        date: _dateKey(map['date']),
        startTime: _str(map['startTime']),
        amountReais: _num(map['amountReais']) ?? _num(map['priceReais']) ?? 0,
        status: _str(map['status'], 'active').toLowerCase(),
        arenaName: _str(map['arenaName'], 'Arena'),
        courtName: _strOrNull(map['courtName']),
      );

  final String id;
  final String date;
  final String startTime;
  final double amountReais;
  final String status;
  final String arenaName;
  final String? courtName;

  bool get isVoid => professorBookingIsVoid(status);
}

/// Reserva que não vale: cancelada, PIX expirado ou recusado.
bool professorBookingIsVoid(String? status) => const {
      'canceled',
      'cancelled',
      'expired',
      'rejected',
    }.contains(status?.trim().toLowerCase());

// ── custo de quadra (B16) ───────────────────────────────────────────────

class ProfessorCourtCost {
  const ProfessorCourtCost({
    required this.pastCount,
    required this.pastReais,
    required this.upcomingCount,
    required this.upcomingReais,
  });

  static const zero = ProfessorCourtCost(
    pastCount: 0,
    pastReais: 0,
    upcomingCount: 0,
    upcomingReais: 0,
  );

  /// Reservas do mês até ontem.
  final int pastCount;
  final double pastReais;

  /// De hoje até o fim do mês.
  final int upcomingCount;
  final double upcomingReais;

  int get count => pastCount + upcomingCount;
  double get totalReais => pastReais + upcomingReais;
}

/// Custo de quadra do mês de [todayKey] (sem as reservas que não valem).
ProfessorCourtCost professorCourtCostOfMonth(
  List<ProfessorCourtBooking> bookings, {
  required String todayKey,
}) {
  final month = todayKey.substring(0, 7);
  var pastCount = 0, upcomingCount = 0;
  var past = 0.0, upcoming = 0.0;
  for (final b in bookings) {
    if (b.isVoid || !b.date.startsWith(month)) continue;
    if (b.date.compareTo(todayKey) < 0) {
      pastCount++;
      past += b.amountReais;
    } else {
      upcomingCount++;
      upcoming += b.amountReais;
    }
  }
  return ProfessorCourtCost(
    pastCount: pastCount,
    pastReais: _round(past),
    upcomingCount: upcomingCount,
    upcomingReais: _round(upcoming),
  );
}

// ── aulas do aluno (B4) ─────────────────────────────────────────────────

/// Situação da aula pela reserva (`null` = reserva ainda não lida).
Map<String, String> professorBookingStatusById(
  List<ProfessorCourtBooking> bookings,
) =>
    {for (final b in bookings) b.id: b.status};

class ProfessorStudentLessons {
  const ProfessorStudentLessons({
    required this.upcoming,
    required this.past,
    required this.monthCourtCostReais,
  });

  /// De hoje em diante, a mais próxima primeiro.
  final List<ProfessorLesson> upcoming;

  /// Antes de hoje, a mais recente primeiro.
  final List<ProfessorLesson> past;

  /// Soma do custo de quadra das aulas do aluno no mês (sem as canceladas).
  final double monthCourtCostReais;
}

ProfessorStudentLessons professorStudentLessons(
  List<ProfessorLesson> lessons, {
  required String athleteId,
  required String todayKey,
  required Map<String, String> bookingStatus,
}) {
  final month = todayKey.substring(0, 7);
  final mine = [
    for (final l in lessons)
      if (l.athleteId == athleteId) l,
  ];
  int byWhen(ProfessorLesson a, ProfessorLesson b) {
    final d = a.date.compareTo(b.date);
    return d != 0 ? d : a.startTime.compareTo(b.startTime);
  }

  final upcoming = [
    for (final l in mine)
      if (l.date.compareTo(todayKey) >= 0) l,
  ]..sort(byWhen);
  final past = [
    for (final l in mine)
      if (l.date.compareTo(todayKey) < 0) l,
  ]..sort((a, b) => byWhen(b, a));
  var cost = 0.0;
  for (final l in mine) {
    if (l.date.startsWith(month) &&
        !professorBookingIsVoid(bookingStatus[l.bookingId])) {
      cost += l.courtCostReais;
    }
  }
  return ProfessorStudentLessons(
    upcoming: upcoming,
    past: past,
    monthCourtCostReais: _round(cost),
  );
}

/// Arenas em que o professor pode marcar aula da carteira: vínculo
/// INDEPENDENT ativo com "Reservar quadras".
List<ArenaProfessorLink> professorLessonArenas(
  List<ArenaProfessorLink> links,
) =>
    [
      for (final l in links)
        if (l.type == ArenaProfessorLinkType.independent &&
            effectiveProfessorPermissions(l).canBookCourts)
          l,
    ];

// ── leitura defensiva ────────────────────────────────────────────────────

String _str(Object? v, [String fallback = '']) =>
    v is String && v.trim().isNotEmpty ? v.trim() : fallback;

String? _strOrNull(Object? v) =>
    v is String && v.trim().isNotEmpty ? v.trim() : null;

double? _num(Object? v) => v is num ? v.toDouble() : null;

/// `date` da reserva: `YYYY-MM-DD` (às vezes com hora) ou Timestamp antigo.
String _dateKey(Object? v) {
  if (v is String) return v.length >= 10 ? v.substring(0, 10) : v.trim();
  if (v is Timestamp) return nexagoEventDayKey(v.toDate());
  if (v is DateTime) return nexagoEventDayKey(v);
  return '';
}

double _round(double v) => (v * 100).round() / 100;
