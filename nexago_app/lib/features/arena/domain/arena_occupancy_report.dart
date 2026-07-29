/// Resultado do relatório de ocupação (callable `getArenaOccupancyReport`,
/// `functions/src/arena-occupancy-report.ts`). Modelo espelha exatamente o
/// shape retornado pelo servidor — fonte única de verdade da agregação.
class ArenaOccupancyCourtBreakdown {
  const ArenaOccupancyCourtBreakdown({
    required this.courtId,
    required this.courtName,
    required this.hoursReserved,
    required this.bookingsCount,
  });

  final String courtId;
  final String courtName;
  final double hoursReserved;
  final int bookingsCount;

  factory ArenaOccupancyCourtBreakdown.fromMap(Map<String, dynamic> map) {
    return ArenaOccupancyCourtBreakdown(
      courtId: (map['courtId'] as String?) ?? '',
      courtName: (map['courtName'] as String?) ?? 'Quadra',
      hoursReserved: (map['hoursReserved'] as num?)?.toDouble() ?? 0,
      bookingsCount: (map['bookingsCount'] as num?)?.toInt() ?? 0,
    );
  }
}

class ArenaOccupancyReport {
  const ArenaOccupancyReport({
    required this.arenaId,
    required this.dateFrom,
    required this.dateTo,
    required this.totalBookings,
    required this.totalHoursReserved,
    required this.uniqueAthletesCount,
    required this.noShowCount,
    required this.attendanceResolvedCount,
    required this.noShowRatePercent,
    required this.recurringBookingsCount,
    required this.standaloneBookingsCount,
    required this.recurringSharePercent,
    required this.courts,
  });

  final String arenaId;
  final String dateFrom;
  final String dateTo;
  final int totalBookings;
  final double totalHoursReserved;
  final int uniqueAthletesCount;
  final int noShowCount;

  /// Reservas com presença já resolvida (`checked_in` + `no_show`) — o
  /// denominador de [noShowRatePercent].
  final int attendanceResolvedCount;

  /// 0–100.
  final double noShowRatePercent;
  final int recurringBookingsCount;
  final int standaloneBookingsCount;

  /// 0–100.
  final double recurringSharePercent;
  final List<ArenaOccupancyCourtBreakdown> courts;

  static const ArenaOccupancyReport empty = ArenaOccupancyReport(
    arenaId: '',
    dateFrom: '',
    dateTo: '',
    totalBookings: 0,
    totalHoursReserved: 0,
    uniqueAthletesCount: 0,
    noShowCount: 0,
    attendanceResolvedCount: 0,
    noShowRatePercent: 0,
    recurringBookingsCount: 0,
    standaloneBookingsCount: 0,
    recurringSharePercent: 0,
    courts: <ArenaOccupancyCourtBreakdown>[],
  );

  factory ArenaOccupancyReport.fromMap(Map<String, dynamic> map) {
    final rawCourts = map['courts'];
    final courts = rawCourts is List
        ? rawCourts
            .whereType<Object>()
            .map(
              (e) => ArenaOccupancyCourtBreakdown.fromMap(
                Map<String, dynamic>.from(e as Map),
              ),
            )
            .toList()
        : const <ArenaOccupancyCourtBreakdown>[];

    return ArenaOccupancyReport(
      arenaId: (map['arenaId'] as String?) ?? '',
      dateFrom: (map['dateFrom'] as String?) ?? '',
      dateTo: (map['dateTo'] as String?) ?? '',
      totalBookings: (map['totalBookings'] as num?)?.toInt() ?? 0,
      totalHoursReserved: (map['totalHoursReserved'] as num?)?.toDouble() ?? 0,
      uniqueAthletesCount: (map['uniqueAthletesCount'] as num?)?.toInt() ?? 0,
      noShowCount: (map['noShowCount'] as num?)?.toInt() ?? 0,
      attendanceResolvedCount:
          (map['attendanceResolvedCount'] as num?)?.toInt() ?? 0,
      noShowRatePercent: (map['noShowRatePercent'] as num?)?.toDouble() ?? 0,
      recurringBookingsCount:
          (map['recurringBookingsCount'] as num?)?.toInt() ?? 0,
      standaloneBookingsCount:
          (map['standaloneBookingsCount'] as num?)?.toInt() ?? 0,
      recurringSharePercent:
          (map['recurringSharePercent'] as num?)?.toDouble() ?? 0,
      courts: courts,
    );
  }
}
