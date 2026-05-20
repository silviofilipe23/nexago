import 'package:flutter/foundation.dart';

import '../../arenas/domain/arena_slot.dart';

enum ArenaScheduleStatusFilter { all, available, booked, blocked }

/// Resumo de reserva para subtítulo na agenda.
@immutable
class ArenaScheduleBookingSummary {
  const ArenaScheduleBookingSummary({
    required this.athleteId,
    required this.paymentShortLabel,
    required this.amountReais,
  });

  final String athleteId;
  final String paymentShortLabel;
  final double? amountReais;
}

/// Linha de quadra dentro de um grupo horário.
@immutable
class ArenaScheduleCourtRow {
  const ArenaScheduleCourtRow({
    required this.slot,
    required this.courtName,
    this.booking,
    this.isPeakHour = false,
  });

  final ArenaSlot slot;
  final String courtName;
  final ArenaScheduleBookingSummary? booking;
  final bool isPeakHour;
}

/// Grupo de slots no mesmo horário de início.
@immutable
class ArenaScheduleHourGroup {
  const ArenaScheduleHourGroup({
    required this.hour,
    required this.timeRange,
    required this.courtCount,
    required this.reservedCount,
    required this.rows,
  });

  final int hour;
  final String timeRange;
  final int courtCount;
  final int reservedCount;
  final List<ArenaScheduleCourtRow> rows;
}

/// Contagens do dia para chips de filtro.
@immutable
class ArenaScheduleDayStats {
  const ArenaScheduleDayStats({
    required this.total,
    required this.available,
    required this.booked,
    required this.blocked,
  });

  const ArenaScheduleDayStats.empty()
      : total = 0,
        available = 0,
        booked = 0,
        blocked = 0;

  final int total;
  final int available;
  final int booked;
  final int blocked;
}
