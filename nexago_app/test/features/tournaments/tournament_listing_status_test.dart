import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_discovery_models.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_listing_status.dart';

void main() {
  group('listingStatusFromRaw', () {
    test('maps operational PascalCase statuses', () {
      expect(
        listingStatusFromRaw('Draft'),
        TournamentListingStatus.scheduled,
      );
      expect(
        listingStatusFromRaw('Open'),
        TournamentListingStatus.open,
      );
      expect(
        listingStatusFromRaw('Brackets Ready'),
        TournamentListingStatus.bracketsReady,
      );
      expect(
        listingStatusFromRaw('In Progress'),
        TournamentListingStatus.live,
      );
      expect(
        listingStatusFromRaw('Completed'),
        TournamentListingStatus.completed,
      );
    });

    test('maps legacy and PT aliases', () {
      expect(
        listingStatusFromRaw('live'),
        TournamentListingStatus.live,
      );
      expect(
        listingStatusFromRaw('closed'),
        TournamentListingStatus.bracketsReady,
      );
      expect(
        listingStatusFromRaw('cancelled'),
        TournamentListingStatus.ended,
      );
      expect(
        listingStatusFromRaw('ended'),
        TournamentListingStatus.ended,
      );
      expect(
        listingStatusFromRaw('concluído'),
        TournamentListingStatus.completed,
      );
      expect(
        listingStatusFromRaw('finalizado'),
        TournamentListingStatus.ended,
      );
    });
  });

  test('resolveListingStatus respects listingStatus raw', () {
    expect(
      resolveListingStatus(listingStatusRaw: 'live'),
      TournamentListingStatus.live,
    );
    expect(
      resolveListingStatus(listingStatusRaw: 'Completed'),
      TournamentListingStatus.completed,
    );
    expect(
      resolveListingStatus(listingStatusRaw: 'ended'),
      TournamentListingStatus.ended,
    );
  });

  test('resolveListingStatus promotes Open to live on event day', () {
    final today = DateTime(2026, 6, 9, 14);
    expect(
      resolveListingStatus(
        listingStatusRaw: 'Open',
        startAt: DateTime(2026, 6, 9, 8),
        now: today,
      ),
      TournamentListingStatus.live,
    );
  });

  test('resolveListingStatus keeps Open when not event day', () {
    expect(
      resolveListingStatus(
        listingStatusRaw: 'Open',
        startAt: DateTime(2026, 6, 15),
        now: DateTime(2026, 6, 9),
      ),
      TournamentListingStatus.open,
    );
  });

  test('resolveListingStatus does not promote scheduled on event day', () {
    expect(
      resolveListingStatus(
        listingStatusRaw: 'Draft',
        startAt: DateTime(2026, 6, 9),
        now: DateTime(2026, 6, 9, 10),
      ),
      TournamentListingStatus.scheduled,
    );
  });

  test('isTournamentEventDay treats UTC midnight as calendar event date', () {
    final startUtc = DateTime.utc(2026, 6, 9);
    final nowLocal = DateTime(2026, 6, 9, 12);
    expect(
      isTournamentEventDay(startAt: startUtc, now: nowLocal),
      isTrue,
    );
    expect(tournamentEventDateLocal(startUtc), DateTime(2026, 6, 9));
  });

  group('same-day calendar dates', () {
    final startBrt = DateTime.utc(2026, 6, 9, 3); // 9/jun 00:00 BRT
    final endBrt = DateTime.utc(2026, 6, 9, 3);
    final afternoon = DateTime(2026, 6, 9, 14);

    test('tournamentEffectiveEndAt extends equal midnight to end of day', () {
      final effective = tournamentEffectiveEndAt(startBrt, endBrt);
      expect(effective, DateTime(2026, 6, 9, 23, 59, 59));
    });

    test('resolveListingStatus keeps In Progress live on same-day event', () {
      expect(
        resolveListingStatus(
          listingStatusRaw: 'In Progress',
          startAt: startBrt,
          endAt: endBrt,
          now: afternoon,
        ),
        TournamentListingStatus.live,
      );
    });

    test('isTournamentEventDay true while same-day event is active', () {
      expect(
        isTournamentEventDay(
          startAt: startBrt,
          endAt: endBrt,
          now: afternoon,
        ),
        isTrue,
      );
    });

    test('isTournamentEventDay false after effective end of day', () {
      expect(
        isTournamentEventDay(
          startAt: startBrt,
          endAt: endBrt,
          now: DateTime(2026, 6, 10, 1),
        ),
        isFalse,
      );
    });

    test('resolveListingStatus completes after effective end of day', () {
      expect(
        resolveListingStatus(
          listingStatusRaw: 'In Progress',
          startAt: startBrt,
          endAt: endBrt,
          now: DateTime(2026, 6, 10, 1),
        ),
        TournamentListingStatus.completed,
      );
    });
  });

  group('multi-day event', () {
    // Retrato do torneio seed de DEV: 20/08 08:00 a 23/08 20:00 (BRT).
    final start = DateTime(2026, 8, 20, 8);
    final end = DateTime(2026, 8, 23, 20);

    test('isTournamentEventDay true on the first day', () {
      expect(
        isTournamentEventDay(
          startAt: start,
          endAt: end,
          now: DateTime(2026, 8, 20, 10),
        ),
        isTrue,
      );
    });

    test('isTournamentEventDay true on a middle day', () {
      expect(
        isTournamentEventDay(
          startAt: start,
          endAt: end,
          now: DateTime(2026, 8, 21, 10),
        ),
        isTrue,
      );
    });

    test('isTournamentEventDay true on the last day', () {
      expect(
        isTournamentEventDay(
          startAt: start,
          endAt: end,
          now: DateTime(2026, 8, 23, 10),
        ),
        isTrue,
      );
    });

    test('isTournamentEventDay false before it starts', () {
      expect(
        isTournamentEventDay(
          startAt: start,
          endAt: end,
          now: DateTime(2026, 8, 19, 23),
        ),
        isFalse,
      );
    });

    test('isTournamentEventDay false after the effective end', () {
      expect(
        isTournamentEventDay(
          startAt: start,
          endAt: end,
          now: DateTime(2026, 8, 23, 21),
        ),
        isFalse,
      );
    });
  });

  test('resolveListingStatus derives almostFull from spots', () {
    final status = resolveListingStatus(
      spotsLeft: 2,
      now: DateTime(2026, 4, 10),
    );
    expect(status, TournamentListingStatus.almostFull);
  });

  test('resolveListingStatus completed when no spots', () {
    final status = resolveListingStatus(spotsLeft: 0);
    expect(status, TournamentListingStatus.completed);
  });

  test('canRegisterForTournament only open and almostFull', () {
    expect(canRegisterForTournament(TournamentListingStatus.open), isTrue);
    expect(
      canRegisterForTournament(TournamentListingStatus.almostFull),
      isTrue,
    );
    expect(
      canRegisterForTournament(TournamentListingStatus.completed),
      isFalse,
    );
    expect(
      canRegisterForTournament(TournamentListingStatus.scheduled),
      isFalse,
    );
    expect(
      canRegisterForTournament(TournamentListingStatus.bracketsReady),
      isFalse,
    );
  });

  test('isPubliclyListedTournament hides draft, cancelled and missing status', () {
    expect(isPubliclyListedTournament('draft'), isFalse);
    expect(isPubliclyListedTournament('open'), isTrue);
    expect(isPubliclyListedTournament('closed'), isTrue);
    expect(isPubliclyListedTournament('cancelled'), isFalse);
    expect(isPubliclyListedTournament(null), isFalse);
    expect(isPubliclyListedTournament(''), isFalse);
  });

  test('isPubliclyListedLeague hides closed and cancelled circuits', () {
    expect(isPubliclyListedLeague('open'), isTrue);
    expect(isPubliclyListedLeague('live'), isTrue);
    expect(isPubliclyListedLeague('closed'), isFalse);
    expect(isPubliclyListedLeague('cancelled'), isFalse);
    expect(isPubliclyListedLeague('ended'), isFalse);
    expect(isPubliclyListedLeague(null), isFalse);
  });

  test('leagueListingBannerMessage for terminal statuses', () {
    expect(leagueListingBannerMessage('cancelled'), isNotNull);
    expect(leagueListingBannerMessage('closed'), isNotNull);
    expect(leagueListingBannerMessage('open'), isNull);
  });

  test('isRegistrationListingClosed detects closed status', () {
    expect(isRegistrationListingClosed('closed'), isTrue);
    expect(isRegistrationListingClosed('open'), isFalse);
  });

  group('isTournamentTerminal', () {
    test('true only for completed and ended (cancelled maps to ended)', () {
      expect(isTournamentTerminal(TournamentListingStatus.completed), isTrue);
      expect(isTournamentTerminal(TournamentListingStatus.ended), isTrue);
      expect(
        isTournamentTerminal(listingStatusFromRaw('cancelled')!),
        isTrue,
      );
    });

    test('false for every non-terminal status', () {
      expect(isTournamentTerminal(TournamentListingStatus.scheduled), isFalse);
      expect(isTournamentTerminal(TournamentListingStatus.open), isFalse);
      expect(
        isTournamentTerminal(TournamentListingStatus.almostFull),
        isFalse,
      );
      expect(isTournamentTerminal(TournamentListingStatus.live), isFalse);
      expect(
        isTournamentTerminal(TournamentListingStatus.bracketsReady),
        isFalse,
      );
    });
  });

  group('tournamentRegistrationNotYetOpen', () {
    final opensAt = DateTime(2026, 9, 5, 10, 0);

    test('sem registrationOpensAt nunca bloqueia', () {
      expect(tournamentRegistrationNotYetOpen(null), isFalse);
    });

    test('antes da data e hora configuradas, inscrições ainda não abriram', () {
      expect(
        tournamentRegistrationNotYetOpen(
          opensAt,
          now: DateTime(2026, 9, 5, 9, 59),
        ),
        isTrue,
      );
    });

    test('abre exatamente no instante configurado', () {
      expect(tournamentRegistrationNotYetOpen(opensAt, now: opensAt), isFalse);
      expect(
        tournamentRegistrationNotYetOpen(
          opensAt,
          now: DateTime(2026, 9, 5, 10, 1),
        ),
        isFalse,
      );
    });
  });
}
