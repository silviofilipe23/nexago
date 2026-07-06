import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:nexago_app/core/theme/app_colors.dart';
import 'package:nexago_app/features/athlete/data/mock_athlete_agenda_data.dart';
import 'package:nexago_app/features/athlete/domain/agenda/athlete_agenda_logic.dart';
import 'package:nexago_app/features/athlete/domain/agenda/athlete_agenda_models.dart';
import 'package:nexago_app/features/tournaments/domain/my_tournaments_models.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_discovery_models.dart';

void main() {
  setUpAll(() async {
    await initializeDateFormatting('pt_BR');
  });

  final baseDay = DateTime(2025, 5, 26, 12);

  AthleteAgendaItem rentalAt(DateTime start) => AthleteAgendaItem(
    id: 'rental-${start.millisecondsSinceEpoch}',
    kind: AthleteAgendaItemKind.rental,
    startsAt: start,
    endsAt: start.add(const Duration(hours: 1)),
    title: 'Arena Test',
    subtitle: 'Quadra 1',
    statusLabel: 'Em 2h',
    accentColor: AppColors.brand,
    rental: AthleteAgendaRentalPayload(
      bookingId: 'b1',
      arenaName: 'Arena Test',
      courtName: 'Quadra 1',
      startAt: start,
      endAt: start.add(const Duration(hours: 1)),
      rawStatus: 'confirmed',
      confirmedParticipants: 4,
      stage: AthleteAgendaBookingStage.future,
    ),
  );

  AthleteAgendaItem tournamentAt(DateTime start) => AthleteAgendaItem(
    id: 'tournament-${start.millisecondsSinceEpoch}',
    kind: AthleteAgendaItemKind.tournament,
    startsAt: start,
    title: 'Torneio X',
    subtitle: 'Arena CFC',
    statusLabel: 'INSCRIÇÕES ABERTAS',
    accentColor: const Color(0xFFE5B82E),
    tournament: const AthleteAgendaTournamentPayload(
      tournamentId: 't1',
      registrationId: 'r1',
      isLive: false,
    ),
  );

  AthleteAgendaItem challengeAt(DateTime start) => AthleteAgendaItem(
    id: 'challenge-${start.millisecondsSinceEpoch}',
    kind: AthleteAgendaItemKind.challenge,
    startsAt: start,
    title: 'Desafio',
    subtitle: 'Ranking',
    statusLabel: 'PENDENTE',
    accentColor: athleteAgendaChallengeAccent,
    challenge: const AthleteAgendaChallengePayload(challengeId: 'c1'),
  );

  AthleteAgendaItem pastRentalAt(DateTime start) => AthleteAgendaItem(
    id: 'past-rental-${start.millisecondsSinceEpoch}',
    kind: AthleteAgendaItemKind.rental,
    startsAt: start,
    endsAt: start.add(const Duration(hours: 1)),
    title: 'Arena Passada',
    subtitle: 'Quadra 1',
    statusLabel: 'Finalizado',
    accentColor: AppColors.onSurfaceMuted,
    rental: AthleteAgendaRentalPayload(
      bookingId: 'past-b1',
      arenaName: 'Arena Passada',
      courtName: 'Quadra 1',
      startAt: start,
      endAt: start.add(const Duration(hours: 1)),
      rawStatus: 'confirmed',
      confirmedParticipants: 4,
      stage: AthleteAgendaBookingStage.past,
    ),
  );

  group('mergeAgendaItems', () {
    test('merges and sorts by startsAt ascending', () {
      final items = mergeAgendaItems(
        bookings: [rentalAt(baseDay.add(const Duration(hours: 3)))],
        tournaments: [tournamentAt(baseDay)],
        challenges: [challengeAt(baseDay.add(const Duration(hours: 1)))],
      );

      expect(items.length, 3);
      expect(items[0].kind, AthleteAgendaItemKind.tournament);
      expect(items[1].kind, AthleteAgendaItemKind.challenge);
      expect(items[2].kind, AthleteAgendaItemKind.rental);
    });
  });

  group('filterAgendaItems', () {
    final filterNow = baseDay.add(const Duration(hours: 1));

    final all = mergeAgendaItems(
      bookings: [rentalAt(baseDay.add(const Duration(hours: 2)))],
      tournaments: [tournamentAt(baseDay.add(const Duration(days: 1)))],
      challenges: [challengeAt(baseDay.add(const Duration(hours: 4)))],
    );

    test('filters by chip kind', () {
      final rentals = filterAgendaItems(
        items: all,
        filter: AthleteAgendaFilter.rentals,
        viewMode: AthleteAgendaViewMode.month,
        selectedDay: baseDay,
        visibleMonth: startOfMonth(baseDay),
        now: filterNow,
      );
      expect(
        rentals.every((i) => i.kind == AthleteAgendaItemKind.rental),
        true,
      );
      expect(rentals.length, 1);
    });

    test('day mode keeps only selected day', () {
      final dayItems = filterAgendaItems(
        items: all,
        filter: AthleteAgendaFilter.all,
        viewMode: AthleteAgendaViewMode.day,
        selectedDay: baseDay,
        visibleMonth: startOfMonth(baseDay),
        now: filterNow,
      );
      expect(dayItems.length, 2);
      expect(dayItems.every((i) => isSameDay(i.startsAt, baseDay)), true);
    });

    test('month mode keeps items in visible month', () {
      final monthItems = filterAgendaItems(
        items: all,
        filter: AthleteAgendaFilter.all,
        viewMode: AthleteAgendaViewMode.month,
        selectedDay: baseDay,
        visibleMonth: startOfMonth(baseDay),
        now: filterNow,
      );
      expect(monthItems.length, 3);
    });

    test('search filters title and subtitle', () {
      final results = filterAgendaItems(
        items: all,
        filter: AthleteAgendaFilter.all,
        viewMode: AthleteAgendaViewMode.month,
        selectedDay: baseDay,
        visibleMonth: startOfMonth(baseDay),
        query: 'torneio',
        now: filterNow,
      );
      expect(results.length, 1);
      expect(results.first.kind, AthleteAgendaItemKind.tournament);
    });

    test('past tab keeps only finished items', () {
      final now = DateTime(2025, 5, 26, 15);
      final items = [
        rentalAt(DateTime(2025, 5, 26, 18)),
        pastRentalAt(DateTime(2025, 5, 26, 10)),
        pastRentalAt(DateTime(2025, 5, 25, 10)),
      ];

      final past = filterAgendaItems(
        items: items,
        filter: AthleteAgendaFilter.all,
        viewMode: AthleteAgendaViewMode.day,
        selectedDay: baseDay,
        visibleMonth: startOfMonth(baseDay),
        timeTab: AthleteAgendaTimeTab.past,
        now: now,
      );
      final upcoming = filterAgendaItems(
        items: items,
        filter: AthleteAgendaFilter.all,
        viewMode: AthleteAgendaViewMode.day,
        selectedDay: baseDay,
        visibleMonth: startOfMonth(baseDay),
        timeTab: AthleteAgendaTimeTab.upcoming,
        now: now,
      );

      expect(past.length, 2);
      expect(upcoming.length, 1);
      expect(past.first.startsAt.isAfter(past.last.startsAt), true);
    });

    test('past tab lists all past items regardless of selected day', () {
      final now = DateTime(2025, 5, 26, 15);
      final items = [
        pastRentalAt(DateTime(2025, 5, 10, 10)),
        pastRentalAt(DateTime(2025, 4, 20, 10)),
      ];

      final past = filterAgendaItems(
        items: items,
        filter: AthleteAgendaFilter.all,
        viewMode: AthleteAgendaViewMode.day,
        selectedDay: baseDay,
        visibleMonth: startOfMonth(baseDay),
        timeTab: AthleteAgendaTimeTab.past,
        now: now,
      );

      expect(past.length, 2);
    });
  });

  group('countAgendaTimeTabs', () {
    test('counts upcoming and past items', () {
      final now = DateTime(2025, 5, 26, 15);
      final items = [
        rentalAt(DateTime(2025, 5, 26, 18)),
        pastRentalAt(DateTime(2025, 5, 26, 10)),
      ];

      final counts = countAgendaTimeTabs(items, now: now);
      expect(counts.upcoming, 1);
      expect(counts.past, 1);
    });
  });

  group('buildDaySummary', () {
    test('counts active items today and next minutes', () {
      final now = DateTime(2025, 5, 26, 10);
      final items = [
        rentalAt(DateTime(2025, 5, 26, 11)),
        tournamentAt(DateTime(2025, 5, 26, 12)),
        challengeAt(DateTime(2025, 5, 26, 14)),
        rentalAt(DateTime(2025, 5, 27, 11)),
      ];

      final summary = buildDaySummary(items, now: now);
      expect(summary.totalToday, 3);
      expect(summary.rentalsToday, 1);
      expect(summary.tournamentsToday, 1);
      expect(summary.challengesToday, 1);
      expect(summary.nextInMinutes, 60);
      expect(summary.headline, contains('3 jogos hoje'));
    });
  });

  group('buildAgendaMonthDayMarkers', () {
    test('builds one cell per day in month with dot counts', () {
      final visibleMonth = DateTime(2025, 5, 1);
      final items = [
        rentalAt(DateTime(2025, 5, 26, 10)),
        rentalAt(DateTime(2025, 5, 26, 14)),
        tournamentAt(DateTime(2025, 5, 27, 12)),
      ];

      final markers = buildAgendaMonthDayMarkers(
        visibleMonth: visibleMonth,
        selectedDay: DateTime(2025, 5, 26),
        items: items,
        now: baseDay,
      );

      expect(markers.length, 31);
      expect(markers[25].rentalDots, 2);
      expect(markers[25].eventCount, 2);
      expect(markers[25].isSelected, true);
      expect(markers[26].tournamentDots, 1);
      expect(markers[0].eventCount, 0);
    });
  });

  group('buildAgendaMonthSummaryRows', () {
    test('includes free and busy days', () {
      final visibleMonth = DateTime(2025, 5, 1);
      final items = [rentalAt(DateTime(2025, 5, 26, 10))];

      final rows = buildAgendaMonthSummaryRows(
        visibleMonth: visibleMonth,
        items: items,
        now: DateTime(2025, 5, 26, 8),
      );

      final busy = rows.where((r) => !r.isFree).toList();
      final free = rows.where((r) => r.isFree).toList();
      expect(busy.length, 1);
      expect(busy.first.eventCount, 1);
      expect(free, isNotEmpty);
    });
  });

  group('filterAgendaItemsForWeekStrip', () {
    test('includes items on other days in strip window', () {
      final now = baseDay;
      final items = [
        rentalAt(baseDay.add(const Duration(hours: 2))),
        tournamentAt(baseDay.add(const Duration(days: 2, hours: 10))),
      ];
      final dayOnly = filterAgendaItems(
        items: items,
        filter: AthleteAgendaFilter.all,
        viewMode: AthleteAgendaViewMode.day,
        selectedDay: baseDay,
        visibleMonth: startOfMonth(baseDay),
        now: now,
      );
      final stripItems = filterAgendaItemsForWeekStrip(
        items: items,
        selectedDay: baseDay,
        now: now,
      );
      expect(dayOnly.length, 1);
      expect(stripItems.length, 2);
    });
  });

  group('buildWeekDayStrip', () {
    test('builds seven-day window with dot counts', () {
      final items = [
        rentalAt(baseDay),
        rentalAt(baseDay.add(const Duration(hours: 3))),
        tournamentAt(baseDay.add(const Duration(days: 2))),
      ];

      final strip = buildWeekDayStrip(
        selectedDay: baseDay,
        items: items,
        now: baseDay,
      );

      expect(strip.length, 7);
      final selected = strip.firstWhere((d) => d.isSelected);
      expect(selected.rentalDots, 2);
      expect(selected.eventCount, 2);
      expect(selected.totalDots, 2);
      expect(selected.isPast, false);
      expect(strip.first.isPast, true);
      expect(strip[4].tournamentDots, 1);
    });
  });

  group('groupItemsByDaySection', () {
    test('groups with Hoje and Amanhã labels', () {
      final now = DateTime(2025, 5, 26, 9);
      final items = [
        rentalAt(DateTime(2025, 5, 26, 18)),
        tournamentAt(DateTime(2025, 5, 27, 10)),
      ];

      final sections = groupItemsByDaySection(items, now: now);
      expect(sections.length, 2);
      expect(sections[0].title, contains('Hoje'));
      expect(sections[1].title, contains('Amanhã'));
    });
  });

  group('empty day D3 helpers', () {
    test('formatAgendaEmptyDayLabel returns HOJE for today', () {
      final now = DateTime(2025, 5, 26, 10);
      expect(formatAgendaEmptyDayLabel(now, now: now), 'HOJE');
    });

    test('formatAgendaEmptyDayLabel returns weekday for other days', () {
      final now = DateTime(2025, 5, 26, 10);
      final tomorrow = DateTime(2025, 5, 27);
      final label = formatAgendaEmptyDayLabel(tomorrow, now: now);
      expect(label, isNot('HOJE'));
      expect(label.length, greaterThanOrEqualTo(3));
    });

    test('formatAgendaEmptyHeroDescription includes nearby count', () {
      final parts = formatAgendaEmptyHeroDescription(12, 'num raio de 5 km');
      expect(parts.nearbyCount, 12);
      expect(parts.suffix, contains('arenas livres'));
      expect(parts.suffix, contains('num raio de 5 km'));
    });

    test('formatAgendaEmptyHeroDescription uses singular for one arena', () {
      final parts = formatAgendaEmptyHeroDescription(1, '');
      expect(parts.suffix, ' arena livre hoje.');
      final withPhrase =
          formatAgendaEmptyHeroDescription(1, 'num raio de 5 km');
      expect(withPhrase.suffix, ' arena livre num raio de 5 km.');
    });

    test('countDropInsNeedingPlayers counts items with spots needed', () {
      expect(countDropInsNeedingPlayers(mockAgendaDropIns()), 3);
    });
  });

  group('buildAgendaTimelineRows', () {
    test('maps items to rows with first/last flags', () {
      final items = [
        rentalAt(DateTime(2025, 5, 26, 8)),
        rentalAt(DateTime(2025, 5, 26, 12)),
      ];

      final rows = buildAgendaTimelineRows(items: items);
      expect(rows.length, 2);
      expect(rows.first.isFirst, true);
      expect(rows.first.isLast, false);
      expect(rows.last.isLast, true);
      expect(rows.last.item.startsAt.hour, 12);
    });
  });

  group('mapTournamentEnrollmentToAgendaItem', () {
    MyTournamentEnrollment enrollment({
      required String registrationId,
      required String categoryId,
      required String categoryName,
      DateTime? startDate,
      String dateLabel = '',
    }) {
      return MyTournamentEnrollment(
        registration: MyTournamentRegistration(
          registrationId: registrationId,
          tournamentId: 'tour-1',
          tournamentName: 'Copa Teste',
          dateLabel: dateLabel,
          statusLabel: 'Inscrito',
          isPaid: true,
          categoryId: categoryId,
        ),
        tournament: DiscoveryTournament(
          id: 'tour-1',
          name: 'Copa Teste',
          location: 'Arena CFC',
          city: 'Goiânia',
          dateLabel: '15/06',
          startDate: startDate ?? DateTime(2025, 6, 15),
          categories: const [TournamentGenderCat.m],
          format: TournamentFormat.dupla,
          priceLabel: 'R\$ 80',
          priceValue: 80,
          spotsLeft: 4,
          spotsTotal: 16,
          status: TournamentListingStatus.open,
          featured: false,
          enrolledCount: 12,
          liveMatchesNow: 0,
          categoryOffers: [
            TournamentCategoryOffer(
              id: categoryId,
              name: categoryName,
              entryFee: 80,
            ),
          ],
        ),
      );
    }

    test('maps each registration to a unique agenda item with category', () {
      final a = enrollment(
        registrationId: 'reg-a',
        categoryId: 'cat-a',
        categoryName: 'Sub-19 Masc',
      );
      final b = enrollment(
        registrationId: 'reg-b',
        categoryId: 'cat-b',
        categoryName: 'Open Masc',
      );

      final itemA = mapTournamentEnrollmentToAgendaItem(a)!;
      final itemB = mapTournamentEnrollmentToAgendaItem(b)!;

      expect(itemA.id, 'tournament-reg-a');
      expect(itemB.id, 'tournament-reg-b');
      expect(itemA.subtitle, contains('Sub-19 Masc'));
      expect(itemB.subtitle, contains('Open Masc'));
      expect(itemA.tournament?.categoryId, 'cat-a');
      expect(itemB.tournament?.categoryId, 'cat-b');
    });

    test('returns null when no parseable date', () {
      final e = MyTournamentEnrollment(
        registration: MyTournamentRegistration(
          registrationId: 'reg-no-date',
          tournamentId: 'tour-1',
          tournamentName: 'Copa Teste',
          dateLabel: '',
          statusLabel: 'Inscrito',
          isPaid: true,
          categoryId: 'cat-a',
        ),
      );

      expect(mapTournamentEnrollmentToAgendaItem(e), isNull);
    });

    test('uses registration startDate when discovery tournament is absent', () {
      final today = DateTime.now();
      final eventStart = DateTime(today.year, today.month, today.day, 8);
      final e = MyTournamentEnrollment(
        registration: MyTournamentRegistration(
          registrationId: 'reg-local',
          tournamentId: 'tour-1',
          tournamentName: 'Copa Teste',
          dateLabel: 'hoje',
          statusLabel: 'Inscrito',
          isPaid: true,
          categoryId: 'cat-a',
          startDate: eventStart,
          listingStatus: TournamentListingStatus.open,
        ),
      );

      final item = mapTournamentEnrollmentToAgendaItem(e)!;
      expect(item.startsAt, DateTime(today.year, today.month, today.day));
      expect(item.statusLabel, 'DIA DO EVENTO');
    });

    test(
      'same-day start and end at midnight stays upcoming during afternoon',
      () {
        final startBrt = DateTime.utc(2026, 6, 9, 3);
        final endBrt = DateTime.utc(2026, 6, 9, 3);
        final afternoon = DateTime(2026, 6, 9, 14);
        final e = MyTournamentEnrollment(
          registration: MyTournamentRegistration(
            registrationId: 'reg-same-day',
            tournamentId: 'PHRdRRMqc5oiCbYus2Fh',
            tournamentName: 'nexaGO',
            dateLabel: '09/06',
            statusLabel: 'Inscrito',
            isPaid: true,
            categoryId: 'cat-a',
            startDate: startBrt,
            endDate: endBrt,
            listingStatus: TournamentListingStatus.live,
          ),
        );

        final item = mapTournamentEnrollmentToAgendaItem(e)!;
        expect(item.statusLabel, 'DIA DO EVENTO');
        expect(item.tournament?.isCompleted, isFalse);
        expect(isAgendaItemPast(item, now: afternoon), isFalse);

        final upcoming = filterAgendaItems(
          items: [item],
          filter: AthleteAgendaFilter.tournaments,
          viewMode: AthleteAgendaViewMode.day,
          selectedDay: DateTime(2026, 6, 9),
          visibleMonth: startOfMonth(DateTime(2026, 6, 9)),
          timeTab: AthleteAgendaTimeTab.upcoming,
          now: afternoon,
        );
        expect(upcoming, hasLength(1));
      },
    );

    test('normalizes UTC midnight to local event day for day filter', () {
      final today = DateTime.now();
      final startUtc = DateTime.utc(today.year, today.month, today.day);
      final e = MyTournamentEnrollment(
        registration: MyTournamentRegistration(
          registrationId: 'reg-utc',
          tournamentId: 'tour-1',
          tournamentName: 'Copa UTC',
          dateLabel: '',
          statusLabel: 'Inscrito',
          isPaid: true,
          categoryId: 'cat-a',
          startDate: startUtc,
          listingStatus: TournamentListingStatus.open,
        ),
      );
      final item = mapTournamentEnrollmentToAgendaItem(e)!;
      final now = DateTime(today.year, today.month, today.day, 12);
      final dayItems = filterAgendaItems(
        items: [item],
        filter: AthleteAgendaFilter.tournaments,
        viewMode: AthleteAgendaViewMode.day,
        selectedDay: DateTime(today.year, today.month, today.day),
        visibleMonth: startOfMonth(today),
        timeTab: AthleteAgendaTimeTab.upcoming,
        now: now,
      );
      expect(dayItems, hasLength(1));
      expect(isAgendaItemPast(item, now: now), isFalse);
    });
  });

  group('formatAgendaTimelineTimeLabel', () {
    test('shows Dia todo for tournaments at midnight', () {
      final item = tournamentAt(DateTime(2025, 5, 26));
      expect(formatAgendaTimelineTimeLabel(item), 'Dia todo');
    });

    test('shows HH:mm for rentals and timed tournaments', () {
      final rental = rentalAt(DateTime(2025, 5, 26, 14, 30));
      expect(formatAgendaTimelineTimeLabel(rental), '14:30');

      final timedTournament = AthleteAgendaItem(
        id: 'tournament-timed',
        kind: AthleteAgendaItemKind.tournament,
        startsAt: DateTime(2025, 5, 26, 9, 0),
        title: 'Torneio',
        subtitle: 'Arena',
        statusLabel: 'INSCRIÇÕES ABERTAS',
        accentColor: const Color(0xFFE5B82E),
        tournament: const AthleteAgendaTournamentPayload(
          tournamentId: 't1',
          registrationId: 'r1',
          isLive: false,
        ),
      );
      expect(formatAgendaTimelineTimeLabel(timedTournament), '09:00');
    });
  });

  group('filterCounts scoped to selected day', () {
    test('chip counts match filtered items for the day', () {
      final now = DateTime(2025, 5, 26, 10);
      final items = [
        rentalAt(DateTime(2025, 5, 26, 11)),
        rentalAt(DateTime(2025, 5, 26, 14)),
        tournamentAt(DateTime(2025, 5, 26, 18)),
        tournamentAt(DateTime(2025, 5, 27, 10)),
      ];

      final scoped = filterAgendaItems(
        items: items,
        filter: AthleteAgendaFilter.all,
        viewMode: AthleteAgendaViewMode.day,
        selectedDay: DateTime(2025, 5, 26),
        visibleMonth: startOfMonth(DateTime(2025, 5, 26)),
        now: now,
      );
      final counts = countAgendaFilters(scoped);

      expect(scoped.length, 3);
      expect(counts.all, 3);
      expect(counts.rentals, 2);
      expect(counts.tournaments, 1);
    });
  });
}
