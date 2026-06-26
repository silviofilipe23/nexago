import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/time/nexago_event_timezone.dart';

void main() {
  setUpAll(() async {
    await initializeNexagoEventTimezone();
  });

  group('nexagoEventTimezone', () {
    test('nexagoEventDayKey uses São Paulo calendar date', () {
      // 02:30 UTC em 15/jun = 23:30 em 14/jun em SP
      final instant = DateTime.utc(2026, 6, 15, 2, 30);
      expect(nexagoEventDayKey(instant), '2026-06-14');
    });

    test('nexagoEventDateTime maps wall clock SP to UTC instant', () {
      final utc = nexagoEventDateTime(
        year: 2026,
        month: 6,
        day: 14,
        hour: 22,
        minute: 0,
      );
      expect(utc.isUtc, isTrue);
      expect(utc, DateTime.utc(2026, 6, 15, 1, 0));
      expect(toNexagoEventLocal(utc).hour, 22);
    });

    test('time at 22:00 SP stays on same calendar day', () {
      final utc = nexagoEventDateTime(
        year: 2026,
        month: 6,
        day: 14,
        hour: 22,
        minute: 0,
      );
      expect(nexagoEventDayKey(utc), '2026-06-14');
      final local = toNexagoEventLocal(utc);
      expect(local.hour, 22);
      expect(local.day, 14);
    });

    test('nexagoEventDayKeyAnchor returns midnight SP as UTC', () {
      final anchor = nexagoEventDayKeyAnchor('2026-06-14');
      expect(anchor, DateTime.utc(2026, 6, 14, 3, 0));
    });
  });
}
