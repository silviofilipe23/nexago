import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/arenas/domain/arena_court.dart';
import 'package:nexago_app/features/arenas/domain/arena_detail_providers.dart';
import 'package:nexago_app/features/arenas/domain/slots_providers.dart';
import 'package:nexago_app/features/arenas/domain/arena_detail_hours_logic.dart';
import 'package:nexago_app/features/arenas/domain/arena_slot.dart';

final _mon = DateTime(2030, 11, 4); // segunda

ArenaSlot _slot(
  String courtId,
  DateTime day,
  String start,
  String end, {
  String status = 'available',
}) {
  return ArenaSlot(
    id: '$courtId-${day.day}-$start',
    arenaId: 'a1',
    courtId: courtId,
    date: day,
    startTime: start,
    endTime: end,
    rawStatus: status,
  );
}

DateTime _d(int offset) => _mon.add(Duration(days: offset));

void main() {
  group('arenaDayHours', () {
    test('spans the first start and the last end of the open courts', () {
      final hours = arenaDayHours(
        slots: [
          _slot('q1', _mon, '08:00', '09:00'),
          _slot('q2', _mon, '07:00', '08:00', status: 'booked'),
          _slot('q1', _mon, '22:00', '23:00'),
          _slot('q9', _mon, '05:00', '06:00'),
        ],
        courtIds: const {'q1', 'q2'},
        day: _mon,
      );

      expect(hours.isClosed, isFalse);
      expect(hours.openLabel, '07:00');
      expect(hours.closeLabel, '23:00');
    });

    test('a slot that ends at midnight closes at 00:00', () {
      final hours = arenaDayHours(
        slots: [_slot('q1', _mon, '23:00', '00:00')],
        courtIds: const {'q1'},
        day: _mon,
      );

      expect(hours.closeLabel, '00:00');
      expect(hours.closeMinutes, 24 * 60);
    });

    test('no slots that day means closed', () {
      final hours = arenaDayHours(
        slots: [_slot('q1', _d(1), '08:00', '09:00')],
        courtIds: const {'q1'},
        day: _mon,
      );

      expect(hours.isClosed, isTrue);
    });
  });

  group('arenaOpenStatus', () {
    final hours = arenaDayHours(
      slots: [
        _slot('q1', _mon, '07:00', '08:00'),
        _slot('q1', _mon, '22:00', '23:00'),
      ],
      courtIds: const {'q1'},
      day: _mon,
    );

    test('open now says until when', () {
      final status = arenaOpenStatus(hours, DateTime(2030, 11, 4, 18, 30));
      expect(status.isOpen, isTrue);
      expect(status.label, 'Aberta agora · até 23:00');
    });

    test('before opening says when it opens', () {
      final status = arenaOpenStatus(hours, DateTime(2030, 11, 4, 6));
      expect(status.isOpen, isFalse);
      expect(status.label, 'Abre hoje às 07:00');
    });

    test('after closing says closed for today', () {
      final status = arenaOpenStatus(hours, DateTime(2030, 11, 4, 23, 5));
      expect(status.isOpen, isFalse);
      expect(status.label, 'Fechada agora · abriu das 07:00 às 23:00');
    });

    test('a closed day says no hours today', () {
      final closed = arenaDayHours(
        slots: const [],
        courtIds: const {'q1'},
        day: _mon,
      );
      final status = arenaOpenStatus(closed, DateTime(2030, 11, 4, 10));
      expect(status.isOpen, isFalse);
      expect(status.label, 'Sem horários de reserva hoje');
    });
  });

  group('arenaWeekHours', () {
    test('groups consecutive days with the same hours, from Monday', () {
      final slots = [
        for (final i in [0, 1, 2, 3, 4, 7, 8]) ...[
          _slot('q1', _d(i), '07:00', '08:00'),
          _slot('q1', _d(i), '22:00', '23:00'),
        ],
        _slot('q1', _d(5), '08:00', '09:00'),
        _slot('q1', _d(5), '19:00', '20:00'),
      ];
      // Começa na quarta (vai até a terça seguinte): a semana mostrada
      // continua de segunda a domingo.
      final week = arenaWeekHours(
        slots: slots,
        courtIds: const {'q1'},
        from: _d(2),
      );

      expect(week.map((w) => '${w.daysLabel} ${w.hoursLabel}'), [
        'Seg–Sex 07:00–23:00',
        'Sáb 08:00–20:00',
        'Dom Fechado',
      ]);
    });

    test('a day without slots in the window counts as closed', () {
      final week = arenaWeekHours(
        slots: [_slot('q1', _d(0), '07:00', '08:00')],
        courtIds: const {'q1'},
        from: _mon,
      );

      expect(week.first.daysLabel, 'Seg');
      expect(week.last.daysLabel, 'Ter–Dom');
      expect(week.last.hoursLabel, 'Fechado');
    });
  });

  group('arenaDetailHoursProvider', () {
    test('ignores courts in maintenance and loads from the shared grid',
        () async {
      final container = ProviderContainer(
        overrides: [
          courtsStreamProvider.overrideWith(
            (ref, id) => Stream.value(const [
              ArenaCourt(id: 'q1', name: 'Quadra 1'),
              ArenaCourt(
                id: 'q2',
                name: 'Quadra 2',
                status: ArenaCourtStatus.maintenance,
              ),
            ]),
          ),
          arenaRangeSlotsProvider.overrideWith(
            (ref, p) => Stream.value([
              _slot('q1', _mon, '08:00', '09:00'),
              _slot('q1', _mon, '21:00', '22:00'),
              _slot('q2', _mon, '06:00', '07:00'),
            ]),
          ),
        ],
      );
      addTearDown(container.dispose);
      final key = (arenaId: 'a1', today: _mon);
      final sub = container.listen(arenaDetailHoursProvider(key), (_, _) {});
      addTearDown(sub.close);

      expect(sub.read(), isNull);
      await container.read(courtsStreamProvider('a1').future);
      await Future<void>.delayed(Duration.zero);

      final hours = sub.read();
      expect(hours, isNotNull);
      expect(hours!.today.rangeLabel, '08:00–22:00');
      expect(hours.week.first.daysLabel, 'Seg');
    });
  });
}
