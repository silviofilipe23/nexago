import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/arenas/domain/arena_slot.dart';
import 'package:nexago_app/features/weather/domain/weather_reschedule.dart';

final day = DateTime(2026, 11, 1);

ArenaSlot slot(String start, String end,
    {double? price = 60, bool booked = false}) {
  final s = ArenaSlot.virtual(
    arenaId: 'a1',
    courtId: 'q1',
    date: day,
    startTime: start,
    endTime: end,
    priceReais: price,
  );
  return booked ? s.copyWith(rawStatus: 'booked') : s;
}

void main() {
  group('weatherRescheduleDelta — espelha rescheduleSettlement', () {
    test('mesmo valor', () {
      final d = weatherRescheduleDelta(creditableReais: 60, newPriceReais: 60);
      expect(d.kind, WeatherRescheduleDeltaKind.same);
      expect(d.dueOnsiteReais, 0);
    });

    test('mais caro: a diferença é paga na arena', () {
      final d = weatherRescheduleDelta(creditableReais: 60, newPriceReais: 70);
      expect(d.kind, WeatherRescheduleDeltaKind.extra);
      expect(d.amountReais, 10);
      expect(d.dueOnsiteReais, 10);
    });

    test('mais barato: a sobra vira crédito', () {
      final d =
          weatherRescheduleDelta(creditableReais: 60, newPriceReais: 45.5);
      expect(d.kind, WeatherRescheduleDeltaKind.leftover);
      expect(d.amountReais, 14.5);
      expect(d.dueOnsiteReais, 0);
    });

    test('centavos não geram diferença fantasma', () {
      final d = weatherRescheduleDelta(
          creditableReais: 0.1 + 0.2, newPriceReais: 0.3);
      expect(d.kind, WeatherRescheduleDeltaKind.same);
    });

    test('preço desconhecido', () {
      expect(
        weatherRescheduleDelta(creditableReais: 60, newPriceReais: null).kind,
        WeatherRescheduleDeltaKind.unknown,
      );
    });
  });

  group('weatherRescheduleSlotCount', () {
    test('mesma duração da reserva original', () {
      final b = {
        'date': '2026-10-29',
        'startTime': '18:00',
        'endTime': '20:00'
      };
      expect(
          weatherRescheduleSlotCount(booking: b, slotDurationMinutes: 60), 2);
      expect(
          weatherRescheduleSlotCount(booking: b, slotDurationMinutes: 30), 4);
    });

    test('sem horário legível: linhas de preço; sem nada, 1', () {
      expect(
        weatherRescheduleSlotCount(
          booking: {
            'pricingLineItems': [{}, {}, {}],
          },
          slotDurationMinutes: 60,
        ),
        3,
      );
      expect(
          weatherRescheduleSlotCount(booking: {}, slotDurationMinutes: 60), 1);
    });
  });

  group('weatherRescheduleDays', () {
    test('de hoje até rescheduleUntil, inclusive', () {
      final days = weatherRescheduleDays(
        now: DateTime(2026, 10, 30, 21),
        until: DateTime(2026, 11, 3),
      );
      expect(days.first, DateTime(2026, 10, 30));
      expect(days.last, DateTime(2026, 11, 3));
      expect(days, hasLength(5));
    });

    test('prazo vencido: nenhum dia', () {
      expect(
        weatherRescheduleDays(
            now: DateTime(2026, 12, 1), until: DateTime(2026, 11, 28)),
        isEmpty,
      );
    });
  });

  group('buildWeatherRescheduleOptions', () {
    final now = DateTime(2026, 10, 30, 12);

    test('1 slot: livres e ocupados, com a diferença de preço', () {
      final options = buildWeatherRescheduleOptions(
        slots: [
          slot('18:00', '19:00'),
          slot('17:00', '18:00', booked: true),
          slot('19:00', '20:00', price: 70),
        ],
        slotCount: 1,
        day: day,
        now: now,
        creditableReais: 60,
      );
      expect(options.map((o) => o.startTime), ['17:00', '18:00', '19:00']);
      expect(options[0].available, isFalse);
      expect(options[1].delta.kind, WeatherRescheduleDeltaKind.same);
      expect(options[2].delta.kind, WeatherRescheduleDeltaKind.extra);
      expect(options[2].delta.amountReais, 10);
      expect(options[2].slotStartTimes, ['19:00']);
    });

    test('2 slots: soma os preços e exige os dois livres e contíguos', () {
      final options = buildWeatherRescheduleOptions(
        slots: [
          slot('17:00', '18:00', price: 50),
          slot('18:00', '19:00', price: 50),
          slot('19:00', '20:00', booked: true),
          slot('21:00', '22:00'),
        ],
        slotCount: 2,
        day: day,
        now: now,
        creditableReais: 120,
      );
      // 17–19 livre; 18–20 tem ocupado; 19–21 não é contíguo (pula).
      expect(options.map((o) => o.startTime), ['17:00', '18:00']);
      expect(options[0].available, isTrue);
      expect(options[0].endTime, '19:00');
      expect(options[0].priceReais, 100);
      expect(options[0].delta.kind, WeatherRescheduleDeltaKind.leftover);
      expect(options[0].delta.amountReais, 20);
      expect(options[0].slotStartTimes, ['17:00', '18:00']);
      expect(options[1].available, isFalse);
    });

    test('hoje: horário que já passou some', () {
      final options = buildWeatherRescheduleOptions(
        slots: [slot('08:00', '09:00'), slot('18:00', '19:00')],
        slotCount: 1,
        day: day,
        now: DateTime(2026, 11, 1, 12),
        creditableReais: 60,
      );
      expect(options.map((o) => o.startTime), ['18:00']);
    });

    test('preço sem configuração: diferença desconhecida', () {
      final options = buildWeatherRescheduleOptions(
        slots: [slot('18:00', '19:00', price: null)],
        slotCount: 1,
        day: day,
        now: now,
        creditableReais: 60,
      );
      expect(options.single.priceReais, isNull);
      expect(options.single.delta.kind, WeatherRescheduleDeltaKind.unknown);
    });
  });
}
