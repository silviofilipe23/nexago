import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/arenas/domain/slots_suggestion_models.dart';
import 'package:nexago_app/core/location/user_location_snapshot.dart';
import 'package:nexago_app/features/arenas/domain/arena_court.dart';
import 'package:nexago_app/features/arenas/domain/arena_list_item.dart';
import 'package:nexago_app/features/arenas/domain/arena_search_providers.dart';
import 'package:nexago_app/features/arenas/domain/arena_slot.dart';
import 'package:nexago_app/features/arenas/domain/slots_page_logic.dart';
import 'package:nexago_app/features/arenas/domain/slots_page_providers.dart';
import 'package:nexago_app/features/arenas/domain/slots_suggestions_logic.dart';

ArenaListItem _arena(String id, {String name = 'Arena'}) {
  return ArenaListItem(
    id: id,
    name: name,
    locationLabel: 'Goiânia · GO',
    pricePerHourReais: 70,
  );
}

ArenaCourt _court(String id, {String? name}) {
  return ArenaCourt(
    id: id,
    name: name ?? 'Quadra $id',
    sportTypes: const ['Areia'],
    status: ArenaCourtStatus.active,
    basePricePerHourReais: 70,
  );
}

ArenaSlot _slot({
  required DateTime day,
  String start = '10:00',
  String status = 'available',
}) {
  return ArenaSlot(
    id: 's_$start',
    arenaId: 'a1',
    courtId: 'c1',
    date: day,
    startTime: start,
    endTime: '11:00',
    rawStatus: status,
  );
}

void main() {
  late DateTime futureDay;

  setUp(() {
    final d = DateTime.now().add(const Duration(days: 4));
    futureDay = DateTime(d.year, d.month, d.day);
  });

  group('isDayFullyBooked', () {
    test('true when future slots exist but none free', () {
      final slots = [
        _slot(day: futureDay, status: 'booked'),
        _slot(day: futureDay, start: '11:00', status: 'booked'),
      ];
      expect(isDayFullyBooked(slots, futureDay), isTrue);
    });

    test('false when grade is empty', () {
      expect(isDayFullyBooked(const [], futureDay), isFalse);
    });

    test('false when a free slot exists', () {
      final slots = [
        _slot(day: futureDay),
        _slot(day: futureDay, start: '11:00', status: 'booked'),
      ];
      expect(isDayFullyBooked(slots, futureDay), isFalse);
    });
  });

  group('shouldShowSlotsFullyBookedBody', () {
    test('true for empty schedule', () {
      expect(shouldShowSlotsFullyBookedBody(const [], futureDay), isTrue);
    });
  });

  group('pickAlternateCourtSummary', () {
    test('skips selected court and maintenance', () {
      final summaries = [
        SlotsCourtSummary(court: _court('1'), freeSlotsCount: 0),
        SlotsCourtSummary(court: _court('2'), freeSlotsCount: 3),
        SlotsCourtSummary(court: _court('3'), freeSlotsCount: 1),
      ];
      final picked = pickAlternateCourtSummary(
        summaries: summaries,
        selectedCourtId: '1',
      );
      expect(picked?.court.id, '2');
    });
  });

  group('pickNextAvailableDayAfter', () {
    test('returns first day after anchor with free slots', () {
      final anchor = futureDay;
      final next = anchor.add(const Duration(days: 2));
      final calendar = [
        SlotsCalendarDayStatus(
          date: anchor,
          availability: const SlotDayAvailability(
            hasAnyFree: false,
            allPastOrFull: true,
          ),
        ),
        SlotsCalendarDayStatus(
          date: anchor.add(const Duration(days: 1)),
          availability: const SlotDayAvailability(
            hasAnyFree: false,
            allPastOrFull: true,
          ),
        ),
        SlotsCalendarDayStatus(
          date: next,
          availability: const SlotDayAvailability(
            hasAnyFree: true,
            allPastOrFull: false,
          ),
        ),
      ];
      expect(
        pickNextAvailableDayAfter(calendar: calendar, selectedDay: anchor),
        slotDayOnly(next),
      );
    });
  });

  group('rankNearbyArenaSuggestions', () {
    test('excludes current arena', () {
      final day = futureDay;
      final slot = _slot(day: day);
      final results = [
        ArenaSearchResult(
          arena: _arena('current'),
          selectedSlot: slot,
          courtName: 'Q1',
          isExactMatch: false,
          minutesDistance: 0,
          displayPricePerHourReais: 70,
          availableCourtsCount: 1,
        ),
        ArenaSearchResult(
          arena: _arena('other', name: 'Outra'),
          selectedSlot: slot.copyWith(arenaId: 'other'),
          courtName: 'Q2',
          isExactMatch: false,
          minutesDistance: 5,
          displayPricePerHourReais: 80,
          availableCourtsCount: 2,
        ),
      ];
      final ranked = rankNearbyArenaSuggestions(
        results: results,
        excludeArenaId: 'current',
        user: const UserLocationSnapshot(source: UserLocationSource.none),
        limit: 3,
      );
      expect(ranked, hasLength(1));
      expect(ranked.first.result.arena.id, 'other');
    });
  });

  group('mergeSmartSuggestions', () {
    test('orders court, day, nearby', () {
      final court = SlotsSuggestion(
        kind: SlotsSuggestionKind.alternateCourt,
        title: 'c',
        subtitle: 's',
        actionLabel: 'Trocar',
        actionStyle: SlotsSuggestionActionStyle.primaryFilled,
        icon: Icons.sports_tennis,
        iconBackground: Colors.orange,
      );
      expect(
        mergeSmartSuggestions(alternateCourt: court, nearby: const []).length,
        1,
      );
    });
  });
}
