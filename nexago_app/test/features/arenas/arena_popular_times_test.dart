import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/arenas/domain/arena_popular_times.dart';

List<int> _day(Map<int, int> values) =>
    List.generate(24, (h) => values[h] ?? 0);

ArenaPopularTimes _times(Map<int, List<int>> byWeekday, {int count = 40}) {
  return ArenaPopularTimes.fromMap({
    'bookingsCount': count,
    'byWeekday': {
      for (final e in byWeekday.entries) '${e.key}': e.value,
    },
  });
}

void main() {
  group('ArenaPopularTimes.fromMap', () {
    test('reads 24 values per weekday', () {
      final t = _times({
        1: _day({19: 100})
      });
      expect(t.hoursFor(1)?[19], 100);
      expect(t.hoursFor(2), isNull);
    });

    test('a summary without the drawing has nothing to show', () {
      final t =
          ArenaPopularTimes.fromMap({'bookingsCount': 3, 'byWeekday': null});
      expect(t.hoursFor(1), isNull);
    });

    test('ignores malformed weekdays and clamps values', () {
      final t = ArenaPopularTimes.fromMap({
        'byWeekday': {
          '1': [for (var h = 0; h < 24; h++) h == 5 ? 140 : -3],
          '2': [1, 2, 3],
          'x': _day({}),
        },
      });
      expect(t.hoursFor(1)?[5], 100);
      expect(t.hoursFor(1)?[0], 0);
      expect(t.hoursFor(2), isNull);
    });
  });

  group('popularDayView', () {
    test('trims the empty hours at both ends', () {
      final view = popularDayView(
        _times({
          1: _day({7: 20, 8: 30, 19: 100, 21: 40})
        }),
        weekday: 1,
      );
      expect(view, isNotNull);
      expect(view!.firstHour, 7);
      expect(view.lastHour, 21);
      expect(view.values, hasLength(15));
    });

    test('names the busiest stretch', () {
      final view = popularDayView(
        _times({
          1: _day({8: 30, 18: 85, 19: 100, 20: 90, 21: 40})
        }),
        weekday: 1,
      );
      expect(view!.headline, 'Costuma lotar das 18h às 21h');
    });

    test('a single peak hour names that hour', () {
      final view = popularDayView(
        _times({
          3: _day({10: 30, 19: 100, 20: 50})
        }),
        weekday: 3,
      );
      expect(view!.headline, 'Costuma lotar das 19h às 20h');
    });

    test('a quiet day does not claim it gets full', () {
      final view = popularDayView(
        _times({
          7: _day({9: 20, 10: 40, 11: 30})
        }),
        weekday: 7,
      );
      expect(view!.headline, 'Mais movimentado por volta das 10h');
    });

    test('says how busy the picked hour usually is', () {
      final data = _times({
        1: _day({8: 10, 14: 55, 19: 100})
      });
      expect(
        popularDayView(data, weekday: 1, selectedHour: 19)!.selectedLabel,
        'Às 19h costuma estar cheio',
      );
      expect(
        popularDayView(data, weekday: 1, selectedHour: 14)!.selectedLabel,
        'Às 14h o movimento costuma ser médio',
      );
      expect(
        popularDayView(data, weekday: 1, selectedHour: 8)!.selectedLabel,
        'Às 8h costuma estar tranquilo',
      );
      expect(
        popularDayView(data, weekday: 1, selectedHour: 11)!.selectedLabel,
        'Às 11h costuma estar livre',
      );
      expect(popularDayView(data, weekday: 1)!.selectedLabel, isNull);
    });

    test('nothing to show without data or with an empty day', () {
      expect(popularDayView(null, weekday: 1), isNull);
      expect(popularDayView(_times({1: _day({})}), weekday: 1), isNull);
      expect(
          popularDayView(
              _times({
                1: _day({19: 100})
              }),
              weekday: 2),
          isNull);
    });
  });
}
