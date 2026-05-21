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
  });
}
