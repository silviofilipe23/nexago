import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/arena/domain/arena_occupancy_report.dart';

void main() {
  group('ArenaOccupancyReport.fromMap', () {
    test('mapeia todos os campos, incluindo o breakdown por quadra', () {
      final report = ArenaOccupancyReport.fromMap({
        'arenaId': 'arena1',
        'dateFrom': '2026-07-01',
        'dateTo': '2026-07-31',
        'totalBookings': 12,
        'totalHoursReserved': 18.5,
        'uniqueAthletesCount': 9,
        'noShowCount': 2,
        'attendanceResolvedCount': 8,
        'noShowRatePercent': 25.0,
        'recurringBookingsCount': 4,
        'standaloneBookingsCount': 8,
        'recurringSharePercent': 33.3,
        'courts': [
          {
            'courtId': 'c1',
            'courtName': 'Quadra 1',
            'hoursReserved': 12.0,
            'bookingsCount': 8,
          },
          {
            'courtId': 'c2',
            'courtName': 'Quadra 2',
            'hoursReserved': 6.5,
            'bookingsCount': 4,
          },
        ],
      });

      expect(report.arenaId, 'arena1');
      expect(report.dateFrom, '2026-07-01');
      expect(report.dateTo, '2026-07-31');
      expect(report.totalBookings, 12);
      expect(report.totalHoursReserved, 18.5);
      expect(report.uniqueAthletesCount, 9);
      expect(report.noShowCount, 2);
      expect(report.attendanceResolvedCount, 8);
      expect(report.noShowRatePercent, 25.0);
      expect(report.recurringBookingsCount, 4);
      expect(report.standaloneBookingsCount, 8);
      expect(report.recurringSharePercent, 33.3);
      expect(report.courts, hasLength(2));
      expect(report.courts.first.courtId, 'c1');
      expect(report.courts.first.hoursReserved, 12.0);
      expect(report.courts.last.courtName, 'Quadra 2');
    });

    test('campos ausentes/nulos caem em valores zerados sem lançar erro', () {
      final report = ArenaOccupancyReport.fromMap(const {});

      expect(report.arenaId, '');
      expect(report.totalBookings, 0);
      expect(report.totalHoursReserved, 0);
      expect(report.uniqueAthletesCount, 0);
      expect(report.noShowRatePercent, 0);
      expect(report.recurringSharePercent, 0);
      expect(report.courts, isEmpty);
    });

    test('ArenaOccupancyReport.empty é o equivalente de uma resposta vazia', () {
      expect(ArenaOccupancyReport.empty.totalBookings, 0);
      expect(ArenaOccupancyReport.empty.courts, isEmpty);
    });
  });
}
