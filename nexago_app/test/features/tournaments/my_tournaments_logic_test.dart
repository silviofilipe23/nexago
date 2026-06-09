import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/tournaments/domain/my_tournaments_logic.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_discovery_models.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_listing_status.dart';

DiscoveryTournament _tournament({
  required String id,
  required TournamentListingStatus status,
  DateTime? startDate,
  String? name,
}) {
  return DiscoveryTournament(
    id: id,
    name: name ?? 'Torneio $id',
    location: 'Arena',
    city: 'Goiânia',
    dateLabel: 'hoje',
    startDate: startDate ?? DateTime(2026, 5, 25),
    categories: const [TournamentGenderCat.m],
    format: TournamentFormat.dupla,
    priceLabel: 'R\$ 100',
    priceValue: 100,
    spotsLeft: 10,
    spotsTotal: 32,
    status: status,
    featured: false,
    enrolledCount: 8,
    liveMatchesNow: status == TournamentListingStatus.live ? 2 : 0,
  );
}

MyTournamentRegistration _reg(String tournamentId) {
  return MyTournamentRegistration(
    registrationId: 'reg-$tournamentId',
    tournamentId: tournamentId,
    tournamentName: 'Torneio $tournamentId',
    dateLabel: '25/05',
    statusLabel: 'Inscrito',
    isPaid: true,
    categoryId: 'cat1',
  );
}

void main() {
  group('splitMyTournamentEnrollments', () {
    test('splits ongoing vs completed by listing status', () {
      final enrollments = buildMyTournamentEnrollments(
        registrations: [_reg('live'), _reg('done'), _reg('open')],
        tournamentsById: {
          'live': _tournament(id: 'live', status: TournamentListingStatus.live),
          'done': _tournament(
            id: 'done',
            status: TournamentListingStatus.completed,
          ),
          'open': _tournament(id: 'open', status: TournamentListingStatus.open),
        },
      );

      final split = splitMyTournamentEnrollments(enrollments);
      expect(split.ongoing.length, 2);
      expect(split.completed.length, 1);
      expect(split.completed.first.tournamentId, 'done');
    });
  });

  group('sortCompletedEnrollments', () {
    test('orders by startDate descending', () {
      final enrollments = buildMyTournamentEnrollments(
        registrations: [_reg('a'), _reg('b')],
        tournamentsById: {
          'a': _tournament(
            id: 'a',
            status: TournamentListingStatus.completed,
            startDate: DateTime(2026, 3, 1),
          ),
          'b': _tournament(
            id: 'b',
            status: TournamentListingStatus.completed,
            startDate: DateTime(2026, 5, 1),
          ),
        },
      );

      final sorted = sortCompletedEnrollments(
        splitMyTournamentEnrollments(enrollments).completed,
      );
      expect(sorted.first.tournamentId, 'b');
      expect(sorted.last.tournamentId, 'a');
    });
  });

  group('sortOngoingEnrollments', () {
    test('puts live tournaments first', () {
      final enrollments = buildMyTournamentEnrollments(
        registrations: [_reg('open'), _reg('live')],
        tournamentsById: {
          'open': _tournament(id: 'open', status: TournamentListingStatus.open),
          'live': _tournament(id: 'live', status: TournamentListingStatus.live),
        },
      );

      final sorted = sortOngoingEnrollments(
        splitMyTournamentEnrollments(enrollments).ongoing,
      );
      expect(sorted.first.tournamentId, 'live');
    });
  });

  group('filterEnrollmentsByQuery', () {
    test('filters by display name case-insensitively', () {
      final enrollments = buildMyTournamentEnrollments(
        registrations: [_reg('a'), _reg('b')],
        tournamentsById: {
          'a': _tournament(
            id: 'a',
            status: TournamentListingStatus.open,
            name: 'Copa Garden',
          ),
          'b': _tournament(
            id: 'b',
            status: TournamentListingStatus.open,
            name: 'Open Beach',
          ),
        },
      );

      final filtered = filterEnrollmentsByQuery(enrollments, 'garden');
      expect(filtered.length, 1);
      expect(filtered.first.displayName, 'Copa Garden');
    });
  });

  group('pickOpenTournamentSuggestions', () {
    test('returns only tournaments open for registration', () {
      final suggestions = pickOpenTournamentSuggestions([
        _tournament(id: 'open', status: TournamentListingStatus.open),
        _tournament(id: 'live', status: TournamentListingStatus.live),
        _tournament(id: 'done', status: TournamentListingStatus.completed),
      ]);
      expect(suggestions.length, 1);
      expect(suggestions.first.id, 'open');
    });
  });

  group('resolveSeasonYear', () {
    test('parses year from ranking season label', () {
      expect(resolveSeasonYear(rankingSeasonLabel: 'TEMPORADA 2026'), 2026);
    });

    test('falls back to current year', () {
      expect(resolveSeasonYear(), DateTime.now().year);
    });
  });

  group('registrationShowsAsLiveToday', () {
    test('returns true for open registration on event day', () {
      final today = DateTime.now();
      final reg = MyTournamentRegistration(
        registrationId: 'reg-1',
        tournamentId: 't1',
        tournamentName: 'Copa',
        dateLabel: 'hoje',
        statusLabel: 'Inscrito',
        isPaid: true,
        categoryId: 'cat',
        startDate: DateTime(today.year, today.month, today.day),
        listingStatus: TournamentListingStatus.open,
      );
      expect(registrationShowsAsLiveToday(reg), isTrue);
      expect(registrationHomeBadgeLabel(reg), 'DIA DO EVENTO');
    });

    test('sortRegistrationsForHomePreview puts live today first', () {
      final today = DateTime.now();
      final todayReg = MyTournamentRegistration(
        registrationId: 'reg-today',
        tournamentId: 'today',
        tournamentName: 'Hoje',
        dateLabel: 'hoje',
        statusLabel: 'Inscrito',
        isPaid: true,
        categoryId: 'cat',
        startDate: DateTime(today.year, today.month, today.day),
        listingStatus: TournamentListingStatus.open,
      );
      final laterReg = MyTournamentRegistration(
        registrationId: 'reg-later',
        tournamentId: 'later',
        tournamentName: 'Depois',
        dateLabel: '15/07',
        statusLabel: 'Inscrito',
        isPaid: true,
        categoryId: 'cat',
        startDate: today.add(const Duration(days: 14)),
        listingStatus: TournamentListingStatus.open,
      );
      final sorted = sortRegistrationsForHomePreview([laterReg, todayReg]);
      expect(sorted.first.registrationId, 'reg-today');
    });
  });
}
