import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/arenas/domain/arena_booking_allocation.dart';
import 'package:nexago_app/features/arenas/domain/arena_court.dart';
import 'package:nexago_app/features/arenas/domain/arena_detail_agenda_logic.dart';
import 'package:nexago_app/features/arenas/domain/arena_peak_rule.dart';
import 'package:nexago_app/features/arenas/domain/arena_slot.dart';
import 'package:nexago_app/features/arenas/domain/slots_page_logic.dart';

final _day = DateTime(2030, 3, 15); // sexta, longe de "agora"
final _now = DateTime(2030, 3, 14, 10);

ArenaCourt _court(
  String id, {
  List<String> sports = const ['Beach Tennis'],
  bool maintenance = false,
}) {
  return ArenaCourt(
    id: id,
    name: 'Quadra $id',
    sportTypes: sports,
    status:
        maintenance ? ArenaCourtStatus.maintenance : ArenaCourtStatus.active,
  );
}

String _hm(int minutes) => '${(minutes ~/ 60).toString().padLeft(2, '0')}:'
    '${(minutes % 60).toString().padLeft(2, '0')}';

ArenaSlot _slot(
  String courtId,
  String start, {
  String status = 'available',
  double? price = 100,
  DateTime? day,
}) {
  final parts = start.split(':');
  final m = int.parse(parts[0]) * 60 + int.parse(parts[1]);
  return ArenaSlot(
    id: '$courtId-$start',
    arenaId: 'a1',
    courtId: courtId,
    date: day ?? _day,
    startTime: start,
    endTime: _hm(m + 60),
    rawStatus: status,
    priceReais: price,
  );
}

void main() {
  group('agendaCourtCandidates', () {
    test('drops courts in maintenance', () {
      final courts = [_court('1'), _court('2', maintenance: true)];
      expect(agendaCourtCandidates(courts, null).map((c) => c.id), ['1']);
    });

    test('filters by sport label', () {
      final courts = [
        _court('1'),
        _court('2', sports: const ['Vôlei de Praia']),
      ];
      final labels = agendaCourtSportLabels(courts);
      expect(labels, hasLength(2));
      final volei = labels.firstWhere((l) => l.contains('Vôlei'));
      expect(
        agendaCourtCandidates(courts, volei).map((c) => c.id),
        ['2'],
      );
    });

    test('a single sport offers no filter', () {
      expect(agendaCourtSportLabels([_court('1'), _court('2')]), isEmpty);
    });
  });

  group('buildCourtAgendaTimes', () {
    test('counts free courts and picks the cheapest free one', () {
      final times = buildCourtAgendaTimes(
        daySlots: [
          _slot('1', '19:00', price: 120),
          _slot('2', '19:00', price: 90),
          _slot('3', '19:00', status: 'booked', price: 50),
        ],
        candidates: [_court('1'), _court('2'), _court('3')],
        durationMinutes: 60,
        day: _day,
        now: _now,
      );

      final t = times.single;
      expect(t.startTime, '19:00');
      expect(t.endTime, '20:00');
      expect(t.freeCourts, 2);
      expect(t.totalCourts, 3);
      expect(t.courtId, '2');
      expect(t.priceReais, 90);
      expect(t.isFull, isFalse);
    });

    test('a duration needs the whole chain free on the same court', () {
      final times = buildCourtAgendaTimes(
        daySlots: [
          _slot('1', '19:00'),
          _slot('1', '20:00', status: 'booked'),
          _slot('2', '19:00', price: 110),
          _slot('2', '20:00', price: 130),
        ],
        candidates: [_court('1'), _court('2')],
        durationMinutes: 120,
        day: _day,
        now: _now,
      );

      final t = times.firstWhere((t) => t.startTime == '19:00');
      expect(t.freeCourts, 1);
      expect(t.courtId, '2');
      expect(t.priceReais, 240);
      expect(t.endTime, '21:00');
      expect(t.slotStartTimes, ['19:00', '20:00']);
    });

    test('a full time keeps its place with no court and no price', () {
      final times = buildCourtAgendaTimes(
        daySlots: [_slot('1', '18:00', status: 'booked')],
        candidates: [_court('1')],
        durationMinutes: 60,
        day: _day,
        now: _now,
      );

      expect(times.single.isFull, isTrue);
      expect(times.single.courtId, isNull);
      expect(times.single.priceReais, isNull);
    });

    test('leaves out times that already passed today', () {
      final today = DateTime(2030, 3, 15);
      final times = buildCourtAgendaTimes(
        daySlots: [
          _slot('1', '08:00', day: today),
          _slot('1', '20:00', day: today),
        ],
        candidates: [_court('1')],
        durationMinutes: 60,
        day: today,
        now: DateTime(2030, 3, 15, 12),
      );

      expect(times.map((t) => t.startTime), ['20:00']);
    });

    test('ignores slots of other courts and other days', () {
      final times = buildCourtAgendaTimes(
        daySlots: [
          _slot('9', '19:00'),
          _slot('1', '19:00', day: DateTime(2030, 3, 16)),
        ],
        candidates: [_court('1')],
        durationMinutes: 60,
        day: _day,
        now: _now,
      );

      expect(times, isEmpty);
    });

    test('comes sorted by start time', () {
      final times = buildCourtAgendaTimes(
        daySlots: [_slot('1', '21:00'), _slot('1', '07:00')],
        candidates: [_court('1')],
        durationMinutes: 60,
        day: _day,
        now: _now,
      );

      expect(times.map((t) => t.startTime), ['07:00', '21:00']);
    });
  });

  group('buildCapacityAgendaTimes', () {
    test('uses the arena price for the sport and no court', () {
      const allocation = ArenaBookingAllocation(
        isCapacity: true,
        priceBySport: {'beach_tennis': 80},
      );
      final times = buildCapacityAgendaTimes(
        daySlots: [_slot('1', '19:00'), _slot('2', '19:00')],
        allocation: allocation,
        courts: [
          _court('1', sports: const []),
          _court('2', sports: const []),
        ],
        sport: 'beach_tennis',
        durationMinutes: 60,
        day: _day,
        now: _now,
      );

      final t = times.single;
      expect(t.courtId, isNull);
      expect(t.freeCourts, 2);
      expect(t.priceReais, 80);
    });
  });

  group('groupAgendaByPeriod', () {
    test('splits morning, afternoon and evening in order', () {
      final times = buildCourtAgendaTimes(
        daySlots: [
          _slot('1', '07:00'),
          _slot('1', '14:00'),
          _slot('1', '19:00'),
          _slot('1', '20:00'),
        ],
        candidates: [_court('1')],
        durationMinutes: 60,
        day: _day,
        now: _now,
      );
      final groups = groupAgendaByPeriod(times);

      expect(groups.keys, [
        SlotPeriodFilter.morning,
        SlotPeriodFilter.afternoon,
        SlotPeriodFilter.evening,
      ]);
      expect(groups[SlotPeriodFilter.evening]!.map((t) => t.startTime),
          ['19:00', '20:00']);
    });

    test('skips periods with no times', () {
      final times = buildCourtAgendaTimes(
        daySlots: [_slot('1', '19:00')],
        candidates: [_court('1')],
        durationMinutes: 60,
        day: _day,
        now: _now,
      );

      expect(groupAgendaByPeriod(times).keys, [SlotPeriodFilter.evening]);
    });
  });

  group('agendaDayStateOf', () {
    AgendaTime time({required bool full}) => AgendaTime(
          startTime: '19:00',
          endTime: '20:00',
          freeCourts: full ? 0 : 1,
          totalCourts: 1,
          slotStartTimes: const ['19:00'],
        );

    test('no times means no schedule', () {
      expect(agendaDayStateOf(const []), AgendaDayState.noSchedule);
    });

    test('every time full means the day is full', () {
      expect(
        agendaDayStateOf([time(full: true), time(full: true)]),
        AgendaDayState.full,
      );
    });

    test('any free time means open', () {
      expect(
        agendaDayStateOf([time(full: true), time(full: false)]),
        AgendaDayState.open,
      );
    });
  });

  group('agendaCalendarStatuses', () {
    test('marks each day of the strip by the candidate courts', () {
      final d1 = DateTime(2030, 3, 15);
      final d2 = DateTime(2030, 3, 16);
      final statuses = agendaCalendarStatuses(
        rangeSlots: [
          _slot('1', '19:00', day: d1),
          _slot('1', '19:00', day: d2, status: 'booked'),
          _slot('9', '20:00', day: d2),
        ],
        candidateIds: const {'1'},
        startDay: d1,
        days: 3,
        now: _now,
      );

      expect(statuses, hasLength(3));
      expect(statuses[0].availability.hasAnyFree, isTrue);
      expect(statuses[1].availability.hasAnyFree, isFalse);
      expect(statuses[1].availability.allPastOrFull, isTrue);
      expect(statuses[2].availability.hasAnyFree, isFalse);
    });
  });

  group('nextOpenDay', () {
    test('finds the first day after the selected one with a free time', () {
      final d1 = DateTime(2030, 3, 15);
      final statuses = agendaCalendarStatuses(
        rangeSlots: [
          _slot('1', '19:00', day: d1),
          _slot('1', '19:00', day: DateTime(2030, 3, 16), status: 'booked'),
          _slot('1', '19:00', day: DateTime(2030, 3, 17)),
        ],
        candidateIds: const {'1'},
        startDay: d1,
        days: 4,
        now: _now,
      );

      expect(nextOpenDay(statuses, after: d1), DateTime(2030, 3, 17));
    });

    test('is null when no later day has room', () {
      final d1 = DateTime(2030, 3, 15);
      final statuses = agendaCalendarStatuses(
        rangeSlots: [_slot('1', '19:00', day: d1)],
        candidateIds: const {'1'},
        startDay: d1,
        days: 2,
        now: _now,
      );

      expect(nextOpenDay(statuses, after: d1), isNull);
    });
  });

  group('agendaNeedsPeakFlow', () {
    const rule = ArenaPeakRule(
      id: 'pico',
      active: true,
      label: 'Pico',
      courtIds: [],
      weekdays: [1, 2, 3, 4, 5, 6, 7],
      startTime: '20:00',
      endTime: '21:00',
      minDurationMinutes: 120,
    );
    final courtSlots = [
      _slot('1', '19:00'),
      _slot('1', '20:00'),
      _slot('1', '21:00'),
    ];

    test('one hour inside the peak with a free neighbour needs the flow', () {
      expect(
        agendaNeedsPeakFlow(
          rules: [rule],
          courtId: '1',
          courtSlots: courtSlots,
          day: _day,
          slotStartTimes: const ['20:00'],
          slotDurationMinutes: 60,
          now: _now,
        ),
        isTrue,
      );
    });

    test('the minimum duration goes straight through', () {
      expect(
        agendaNeedsPeakFlow(
          rules: [rule],
          courtId: '1',
          courtSlots: courtSlots,
          day: _day,
          slotStartTimes: const ['20:00', '21:00'],
          slotDurationMinutes: 60,
          now: _now,
        ),
        isFalse,
      );
    });

    test('outside the peak goes straight through', () {
      expect(
        agendaNeedsPeakFlow(
          rules: [rule],
          courtId: '1',
          courtSlots: courtSlots,
          day: _day,
          slotStartTimes: const ['19:00'],
          slotDurationMinutes: 60,
          now: _now,
        ),
        isFalse,
      );
    });

    test('without rules goes straight through', () {
      expect(
        agendaNeedsPeakFlow(
          rules: const [],
          courtId: '1',
          courtSlots: courtSlots,
          day: _day,
          slotStartTimes: const ['20:00'],
          slotDurationMinutes: 60,
          now: _now,
        ),
        isFalse,
      );
    });
  });

  group('buildAgendaView', () {
    test('court arena: "Todas" plus each sport, all courts by default', () {
      final view = buildAgendaView(
        allocation: ArenaBookingAllocation.court,
        courts: [
          _court('1'),
          _court('2', sports: const ['Vôlei de Praia']),
        ],
        daySlots: [_slot('1', '19:00'), _slot('2', '19:00')],
        day: _day,
        now: _now,
      );

      expect(view.isCapacity, isFalse);
      expect(view.sportOptions.first.label, 'Todas');
      expect(view.sportOptions.first.value, isNull);
      expect(view.sportOptions, hasLength(3));
      expect(view.sport, isNull);
      expect(view.times.single.freeCourts, 2);
      expect(view.durationMinutes, 60);
    });

    test('court arena: a sport no longer offered falls back to all', () {
      final view = buildAgendaView(
        allocation: ArenaBookingAllocation.court,
        courts: [_court('1')],
        daySlots: [_slot('1', '19:00')],
        day: _day,
        now: _now,
        sportChoice: 'Futevôlei',
        durationChoice: 999,
      );

      expect(view.sport, isNull);
      expect(view.sportOptions, isEmpty);
      expect(view.durationMinutes, 60);
    });

    test('court arena: keeps a valid duration choice', () {
      final view = buildAgendaView(
        allocation: ArenaBookingAllocation.court,
        courts: [_court('1')],
        daySlots: [_slot('1', '19:00'), _slot('1', '20:00')],
        day: _day,
        now: _now,
        durationChoice: 120,
      );

      expect(view.durationMinutes, 120);
      expect(view.durations, [60, 120, 180]);
      expect(view.times.first.slotStartTimes, ['19:00', '20:00']);
    });

    test('capacity arena: the athlete primary sport comes first', () {
      const allocation = ArenaBookingAllocation(
        isCapacity: true,
        priceBySport: {'beach_tennis': 80, 'footvolley': 70},
      );
      final view = buildAgendaView(
        allocation: allocation,
        courts: [_court('1', sports: const [])],
        daySlots: [_slot('1', '19:00')],
        day: _day,
        now: _now,
        primarySport: 'footvolley',
      );

      expect(view.isCapacity, isTrue);
      expect(view.sport, 'footvolley');
      expect(view.sportOptions.first.value, 'footvolley');
      expect(view.times.single.priceReais, 70);
      expect(view.times.single.courtId, isNull);
    });

    test('freeTimeAt ignores full times', () {
      final view = buildAgendaView(
        allocation: ArenaBookingAllocation.court,
        courts: [_court('1')],
        daySlots: [
          _slot('1', '19:00', status: 'booked'),
          _slot('1', '20:00'),
        ],
        day: _day,
        now: _now,
      );

      expect(view.freeTimeAt('19:00'), isNull);
      expect(view.freeTimeAt('20:00')?.startTime, '20:00');
      expect(view.freeTimeAt(null), isNull);
    });
  });
}
