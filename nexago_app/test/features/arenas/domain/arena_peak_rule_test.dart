import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/arenas/domain/arena_peak_rule.dart';

// Quarta 05/08/2026 (ISO weekday 3).
final qua = DateTime(2026, 8, 5);

ArenaPeakRule rule({
  bool active = true,
  List<String> courtIds = const [],
  List<int> weekdays = const [],
  String startTime = '20:00',
  String endTime = '21:00',
}) {
  return ArenaPeakRule(
    id: 'r1',
    active: active,
    label: 'Pico noturno',
    courtIds: courtIds,
    weekdays: weekdays,
    startTime: startTime,
    endTime: endTime,
    minDurationMinutes: 120,
    releaseHoursBefore: null,
  );
}

void main() {
  group('ArenaPeakRule.matches', () {
    test('casa pelo início do slot dentro da faixa', () {
      expect(
        rule().matches(courtId: 'q1', date: qua, slotStartTime: '20:00'),
        isTrue,
      );
      expect(
        rule().matches(courtId: 'q1', date: qua, slotStartTime: '19:00'),
        isFalse,
      );
      expect(
        rule().matches(courtId: 'q1', date: qua, slotStartTime: '21:00'),
        isFalse,
      );
    });

    test('respeita filtro de quadra e de dia da semana', () {
      expect(
        rule(courtIds: ['q2'])
            .matches(courtId: 'q1', date: qua, slotStartTime: '20:00'),
        isFalse,
      );
      expect(
        rule(weekdays: [3])
            .matches(courtId: 'q1', date: qua, slotStartTime: '20:00'),
        isTrue,
      );
      expect(
        rule(weekdays: [6, 7])
            .matches(courtId: 'q1', date: qua, slotStartTime: '20:00'),
        isFalse,
      );
    });

    test('regra inativa nunca casa', () {
      expect(
        rule(active: false)
            .matches(courtId: 'q1', date: qua, slotStartTime: '20:00'),
        isFalse,
      );
    });

    test('suporta faixa cruzando a meia-noite', () {
      final overnight = rule(startTime: '22:00', endTime: '01:00');
      expect(
        overnight.matches(courtId: 'q1', date: qua, slotStartTime: '23:00'),
        isTrue,
      );
      expect(
        overnight.matches(courtId: 'q1', date: qua, slotStartTime: '00:00'),
        isTrue,
      );
      expect(
        overnight.matches(courtId: 'q1', date: qua, slotStartTime: '21:00'),
        isFalse,
      );
    });
  });
}
