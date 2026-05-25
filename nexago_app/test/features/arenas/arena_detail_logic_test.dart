import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/arenas/domain/arena_court.dart';
import 'package:nexago_app/features/arenas/domain/arena_detail_logic.dart';
import 'package:nexago_app/features/arenas/domain/arena_list_item.dart';
import 'package:nexago_app/features/arenas/domain/arena_slot.dart';

ArenaCourt _court(String id, {bool maintenance = false}) {
  return ArenaCourt(
    id: id,
    name: 'Quadra $id',
    sportTypes: const ['Areia'],
    status: maintenance
        ? ArenaCourtStatus.maintenance
        : ArenaCourtStatus.active,
    basePricePerHourReais: 70,
  );
}

ArenaSlot _slot({
  required String courtId,
  required String startTime,
  required DateTime day,
  String status = 'available',
}) {
  return ArenaSlot(
    id: 's_$courtId$startTime',
    arenaId: 'arena1',
    courtId: courtId,
    date: day,
    startTime: startTime,
    endTime: '19:00',
    rawStatus: status,
  );
}

void main() {
  /// Dia futuro para não depender de `DateTime.now()` em [isPastArenaSlot].
  late DateTime futureDay;
  late DateTime futureDayOnly;

  setUp(() {
    final d = DateTime.now().add(const Duration(days: 2));
    futureDay = d;
    futureDayOnly = DateTime(d.year, d.month, d.day);
  });

  group('countFreeSlotsToday', () {
    test('counts only available non-past slots', () {
      final slots = [
        _slot(courtId: 'c1', startTime: '10:00', day: futureDayOnly),
        _slot(courtId: 'c1', startTime: '14:00', day: futureDayOnly),
        _slot(courtId: 'c1', startTime: '16:00', day: futureDayOnly, status: 'booked'),
      ];
      expect(countFreeSlotsToday(slots, futureDay), 2);
    });
  });

  group('buildArenaDetailTodaySummary', () {
    test('aggregates free courts and sorts free first', () {
      final courts = [_court('1'), _court('2'), _court('3', maintenance: true)];
      final summary = buildArenaDetailTodaySummary(
        courts: courts,
        slotsByCourtId: {
          '1': [_slot(courtId: '1', startTime: '18:00', day: futureDayOnly)],
          '2': [],
        },
        today: futureDay,
      );

      expect(summary.totalActiveCourts, 2);
      expect(summary.freeCourtsToday, 1);
      expect(summary.totalFreeSlotsToday, 1);
      expect(summary.courts, hasLength(3));
      expect(summary.courts.first.court.id, '1');
      expect(summary.courts.first.freeSlotsToday, 1);
      expect(summary.courts.last.freeSlotsToday, 0);
    });
  });

  group('courtSurfaceBadgeLabel', () {
    test('prefers arena surfaces', () {
      const arena = ArenaListItem(
        id: 'a',
        name: 'Arena',
        locationLabel: 'GO',
        pricePerHourReais: 80,
        surfaces: const ['Saibro'],
      );
      final court = _court('1');
      expect(courtSurfaceBadgeLabel(arena, court), 'SAIBRO');
    });
  });

  group('formatRelativeReviewAge', () {
    test('formats days ago', () {
      final now = DateTime(2026, 5, 21);
      final created = now.subtract(const Duration(days: 3));
      expect(formatRelativeReviewAge(created, now), 'há 3d');
    });
  });
}
