import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/arenas/domain/arena_slot.dart';
import 'package:nexago_app/features/arenas/domain/slots_page_logic.dart';

ArenaSlot _slot({
  required String startTime,
  required DateTime day,
  String status = 'available',
  String endTime = '19:00',
}) {
  return ArenaSlot(
    id: 's_$startTime',
    arenaId: 'arena1',
    courtId: 'c1',
    date: day,
    startTime: startTime,
    endTime: endTime,
    rawStatus: status,
    priceReais: 50,
  );
}

void main() {
  late DateTime futureDay;

  setUp(() {
    final d = DateTime.now().add(const Duration(days: 3));
    futureDay = DateTime(d.year, d.month, d.day);
  });

  group('periodOfSlot', () {
    test('maps morning, afternoon, evening', () {
      expect(periodOfSlot('08:00'), SlotPeriodFilter.morning);
      expect(periodOfSlot('14:00'), SlotPeriodFilter.afternoon);
      expect(periodOfSlot('20:00'), SlotPeriodFilter.evening);
    });
  });

  group('filterSlotsByPeriod', () {
    test('filters by period', () {
      final slots = [
        _slot(startTime: '08:00', day: futureDay),
        _slot(startTime: '14:00', day: futureDay),
        _slot(startTime: '20:00', day: futureDay),
      ];
      final afternoon = filterSlotsByPeriod(slots, SlotPeriodFilter.afternoon);
      expect(afternoon, hasLength(1));
      expect(afternoon.first.startTime, '14:00');
    });
  });

  group('durationSlotCount', () {
    test('converts minutes to slot count for 60min grid', () {
      expect(durationSlotCount(60, 60), 1);
      expect(durationSlotCount(90, 60), 2);
      expect(durationSlotCount(120, 60), 2);
      expect(durationSlotCount(180, 60), 3);
    });
  });

  group('selectRangeForDuration', () {
    test('selects first contiguous free block', () {
      final slots = [
        _slot(startTime: '08:00', day: futureDay, endTime: '09:00'),
        _slot(startTime: '09:00', day: futureDay, endTime: '10:00'),
        _slot(startTime: '10:00', day: futureDay, endTime: '11:00'),
      ];
      final range = selectRangeForDuration(
        slots: slots,
        durationMinutes: 90,
        slotDurationMinutes: 60,
        selectedDay: futureDay,
      );
      expect(range?.start, 0);
      expect(range?.end, 1);
    });

    test('skips booked slots in the middle', () {
      final slots = [
        _slot(startTime: '08:00', day: futureDay, endTime: '09:00'),
        _slot(startTime: '09:00', day: futureDay, status: 'booked', endTime: '10:00'),
        _slot(startTime: '10:00', day: futureDay, endTime: '11:00'),
        _slot(startTime: '11:00', day: futureDay, endTime: '12:00'),
      ];
      final range = selectRangeForDuration(
        slots: slots,
        durationMinutes: 120,
        slotDurationMinutes: 60,
        selectedDay: futureDay,
      );
      expect(range?.start, 2);
      expect(range?.end, 3);
    });
  });

  group('lastAvailableSlotIndex', () {
    test('returns last free slot index', () {
      final slots = [
        _slot(startTime: '08:00', day: futureDay, status: 'booked'),
        _slot(startTime: '09:00', day: futureDay),
        _slot(startTime: '10:00', day: futureDay),
      ];
      expect(lastAvailableSlotIndex(slots, futureDay), 2);
    });
  });

  group('mostPopularSlotIndex', () {
    test('prefers 08:00–10:00 window when free', () {
      final slots = [
        _slot(startTime: '07:00', day: futureDay),
        _slot(startTime: '08:30', day: futureDay),
        _slot(startTime: '14:00', day: futureDay),
      ];
      expect(mostPopularSlotIndex(slots, futureDay), 1);
    });
  });

  group('countFreeSlotsForDay', () {
    test('counts available non-past slots', () {
      final slots = [
        _slot(startTime: '10:00', day: futureDay),
        _slot(startTime: '11:00', day: futureDay, status: 'booked'),
      ];
      expect(countFreeSlotsForDay(slots, futureDay), 1);
    });
  });

  group('indexAtOrAfterTime', () {
    test('finds first slot at or after target', () {
      final slots = [
        _slot(startTime: '08:00', day: futureDay),
        _slot(startTime: '10:00', day: futureDay),
      ];
      expect(indexAtOrAfterTime(slots, '09:30'), 1);
      expect(indexAtOrAfterTime(slots, '08:00'), 0);
    });
  });

  group('isDayFullyBooked', () {
    test('detects booked day with future slots', () {
      final slots = [
        _slot(startTime: '10:00', day: futureDay, status: 'booked'),
      ];
      expect(isDayFullyBooked(slots, futureDay), isTrue);
      expect(isDayWithoutSchedule(const []), isTrue);
    });
  });

  group('formatSelectionDurationLabel', () {
    test('formats hours and 90min', () {
      expect(formatSelectionDurationLabel(1, 60), '1h');
      expect(formatSelectionDurationLabel(2, 60), '2h');
      expect(formatSelectionDurationLabel(2, 60), '2h');
      expect(formatSelectionDurationLabel(2, 45), '1h30');
    });
  });
}
