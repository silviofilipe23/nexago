import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/arenas/domain/arena_booking_allocation.dart';
import 'package:nexago_app/features/arenas/domain/arena_court.dart';
import 'package:nexago_app/features/arenas/domain/arena_detail_logic.dart';
import 'package:nexago_app/features/arenas/domain/arena_list_item.dart';
import 'package:nexago_app/features/arenas/domain/arena_slot.dart';

ArenaCourt _court(String id, {bool maintenance = false}) {
  return ArenaCourt(
    id: id,
    name: 'Quadra $id',
    sportTypes: const ['Areia'],
    status:
        maintenance ? ArenaCourtStatus.maintenance : ArenaCourtStatus.active,
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
        _slot(
            courtId: 'c1',
            startTime: '16:00',
            day: futureDayOnly,
            status: 'booked'),
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

  group('seção de quadras', () {
    ArenaCourtDaySummary s(String name, List<String> sports, {int free = 1}) =>
        ArenaCourtDaySummary(
          court: ArenaCourt(id: name, name: name, sportTypes: sports),
          freeSlotsToday: free,
        );

    test('courtBadgeLabel usa o número do nome ou a inicial', () {
      expect(courtBadgeLabel('Quadra 12'), '12');
      expect(courtBadgeLabel('Q3 coberta'), '3');
      expect(courtBadgeLabel('central'), 'C');
      expect(courtBadgeLabel('  '), '?');
    });

    test('courtMetaLine junta esportes e coberta/aberta, sem superfície', () {
      const arena = ArenaListItem(
        id: 'a',
        name: 'Arena',
        locationLabel: 'GO',
        pricePerHourReais: 80,
      );
      final court = ArenaCourt(
        id: '1',
        name: 'Quadra 1',
        sportTypes: const ['beachTennis', 'Areia', 'Vôlei de praia'],
      );
      expect(courtMetaLine(arena, court),
          'Beach tennis · Vôlei de praia · Aberta');
    });

    test('filtro por esporte só com mais de 4 quadras e mais de um esporte',
        () {
      final four = [
        for (var i = 0; i < 4; i++)
          s('Q$i', const ['beachTennis', 'footvolley'])
      ];
      expect(courtSportFilterOptions(four), isEmpty);

      final oneSport = [
        for (var i = 0; i < 6; i++) s('Q$i', const ['beachTennis'])
      ];
      expect(courtSportFilterOptions(oneSport), isEmpty);

      final mixed = [
        s('Q1', const ['beachTennis']),
        s('Q2', const ['beachTennis', 'Vôlei de praia']),
        s('Q3', const ['Vôlei de praia']),
        s('Q4', const ['beachTennis']),
        s('Q5', const ['footvolley']),
      ];
      final options = courtSportFilterOptions(mixed);
      expect(options.map((o) => '${o.label}:${o.count}'),
          ['Beach tennis:3', 'Vôlei de praia:2', 'Futevôlei:1']);
      expect(
          filterCourtsBySport(mixed, 'Vôlei de praia').map((c) => c.court.id),
          ['Q2', 'Q3']);
      expect(filterCourtsBySport(mixed, null), same(mixed));
    });

    test('courtDayStatusLabel', () {
      expect(courtDayStatusLabel(s('Q', const [], free: 1)), '1 livre hoje');
      expect(courtDayStatusLabel(s('Q', const [], free: 8)), '8 livres hoje');
      expect(courtDayStatusLabel(s('Q', const [], free: 0)), 'Lotada hoje');
      expect(
        courtDayStatusLabel(const ArenaCourtDaySummary(
          court: ArenaCourt(
            id: 'm',
            name: 'M',
            status: ArenaCourtStatus.maintenance,
          ),
          freeSlotsToday: 0,
        )),
        'Em manutenção',
      );
    });
  });

  test('compareCourtNames: ordem natural', () {
    final names = ['Quadra 10', 'Quadra 2', 'Central', 'Quadra 1']
      ..sort(compareCourtNames);
    expect(names, ['Central', 'Quadra 1', 'Quadra 2', 'Quadra 10']);
  });

  group('capacitySportRows', () {
    ArenaCourtDaySummary c(String id, List<String> sports,
            {int free = 0, bool maintenance = false}) =>
        ArenaCourtDaySummary(
          court: ArenaCourt(
            id: id,
            name: 'Quadra $id',
            sportTypes: sports,
            status: maintenance
                ? ArenaCourtStatus.maintenance
                : ArenaCourtStatus.active,
          ),
          freeSlotsToday: free,
        );

    test('fora do modo capacidade: vazio', () {
      expect(
        capacitySportRows(ArenaBookingAllocation.court, [
          c('1', const ['beachTennis'])
        ]),
        isEmpty,
      );
    });

    test('um por esporte com preço e quadra; conta quadras e as livres hoje',
        () {
      const allocation = ArenaBookingAllocation(
        isCapacity: true,
        priceBySport: {
          'beachTennis': 120,
          'beachVolleyball': 100,
          'footvolley': 90
        },
      );
      final rows = capacitySportRows(allocation, [
        c('1', const ['beachTennis'], free: 3),
        c('2', const ['beachTennis', 'beachVolleyball']),
        c('3', const ['beachVolleyball'], free: 1),
        c('4', const ['beachTennis'], free: 2, maintenance: true),
      ]);
      // Futevôlei tem preço mas nenhuma quadra: fica de fora.
      expect(rows.map((r) => r.label), ['Beach tennis', 'Vôlei de praia']);
      expect(rows.first.courtCount, 2);
      expect(rows.first.freeCourtsToday, 1);
      expect(rows.first.pricePerHour, 120);
      expect(rows.last.courtCount, 2);
      expect(rows.last.freeCourtsToday, 1);
      expect(capacitySportStatusLabel(rows.first), '1 com horário hoje');
    });
  });
}
