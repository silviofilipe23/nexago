import 'package:cloud_firestore/cloud_firestore.dart';

/// Série de horário fixo (mensalista) em `arenaRecurringBookings/{id}`.
///
/// A série é a regra (dia da semana + horário + quadra); as ocorrências são
/// documentos normais de `arenaBookings` com `recurringBookingId`, criados
/// pelas Cloud Functions num horizonte rolante. Escrita apenas server-side.
class ArenaRecurringBooking {
  const ArenaRecurringBooking({
    required this.id,
    required this.arenaId,
    required this.arenaName,
    required this.courtId,
    required this.courtName,
    required this.weekday,
    required this.startTime,
    required this.endTime,
    required this.amountReais,
    required this.status,
    required this.startDate,
    required this.skippedDates,
    this.athleteId,
    this.customerName,
    this.endDate,
    this.createdAt,
    this.paymentType = 'per_occurrence',
    this.pausedAt,
  });

  final String id;
  final String arenaId;
  final String arenaName;
  final String courtId;
  final String courtName;

  /// ISO: 1 = segunda … 7 = domingo (igual a [DateTime.weekday]).
  final int weekday;

  final String startTime;
  final String endTime;

  /// Mensalista com conta no app (aparece em "Minhas reservas" dele).
  final String? athleteId;

  /// Mensalista sem conta (nome livre digitado pelo gestor).
  final String? customerName;

  /// Valor por ocorrência (acerto na arena).
  final double amountReais;

  /// `active` | `paused` | `canceled`.
  final String status;

  /// `per_occurrence` | `monthly` — só informativo, sem cobrança automática.
  final String paymentType;

  /// Quando a série foi pausada (`null` se nunca foi ou já foi retomada).
  final DateTime? pausedAt;

  /// `YYYY-MM-DD`.
  final String startDate;

  /// `YYYY-MM-DD` ou null (sem data de término).
  final String? endDate;

  /// Datas puladas por conflito ou cancelamento pontual.
  final List<String> skippedDates;

  final DateTime? createdAt;

  bool get isActive => status == 'active';
  bool get isPaused => status == 'paused';

  static const List<String> _weekdayLabels = [
    'Segunda-feira',
    'Terça-feira',
    'Quarta-feira',
    'Quinta-feira',
    'Sexta-feira',
    'Sábado',
    'Domingo',
  ];

  String get weekdayLabel =>
      (weekday >= 1 && weekday <= 7) ? _weekdayLabels[weekday - 1] : '';

  factory ArenaRecurringBooking.fromFirestore(
    DocumentSnapshot<Map<String, dynamic>> doc,
  ) {
    final d = doc.data() ?? {};
    return ArenaRecurringBooking(
      id: doc.id,
      arenaId: _str(d['arenaId']),
      arenaName: _str(d['arenaName'], fallback: 'Arena'),
      courtId: _str(d['courtId']),
      courtName: _str(d['courtName'], fallback: 'Quadra'),
      weekday: (d['weekday'] as num?)?.toInt() ?? 0,
      startTime: _time(d['startTime']),
      endTime: _time(d['endTime']),
      athleteId: _optional(d['athleteId']),
      customerName: _optional(d['customerName']),
      amountReais: (d['amountReais'] as num?)?.toDouble() ?? 0,
      status: _str(d['status'], fallback: 'active'),
      startDate: _str(d['startDate']),
      endDate: _optional(d['endDate']),
      paymentType: _str(d['paymentType'], fallback: 'per_occurrence'),
      pausedAt: (d['pausedAt'] as Timestamp?)?.toDate(),
      skippedDates: [
        if (d['skippedDates'] is List)
          for (final s in d['skippedDates'] as List)
            if (s is String && s.trim().isNotEmpty) s.trim(),
      ]..sort(),
      createdAt: (d['createdAt'] as Timestamp?)?.toDate(),
    );
  }

  static String _str(dynamic v, {String fallback = ''}) {
    if (v is String && v.trim().isNotEmpty) return v.trim();
    return fallback;
  }

  static String? _optional(dynamic v) {
    if (v is String && v.trim().isNotEmpty) return v.trim();
    return null;
  }

  static String _time(dynamic v) {
    if (v is String) {
      final t = v.trim();
      return t.length >= 5 ? t.substring(0, 5) : t;
    }
    return '--:--';
  }
}

/// Retorno de `createArenaRecurringBooking` — datas criadas e puladas por
/// conflito (a UI avisa o gestor das puladas).
class CreateRecurringBookingResult {
  const CreateRecurringBookingResult({
    required this.seriesId,
    required this.createdDates,
    required this.skippedDates,
  });

  final String seriesId;
  final List<String> createdDates;
  final List<String> skippedDates;
}
