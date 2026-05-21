import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_discovery_labels.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_discovery_models.dart';

void main() {
  test('computeDiscoveryLiveStats counts from list', () {
    final stats = computeDiscoveryLiveStats([
      DiscoveryTournament(
        id: '1',
        name: 'A',
        location: 'L',
        city: 'C',
        dateLabel: 'd',
        startDate: DateTime.now(),
        categories: const [TournamentGenderCat.mix],
        format: TournamentFormat.dupla,
        priceLabel: r'R$ 10',
        priceValue: 10,
        spotsLeft: 5,
        spotsTotal: 10,
        status: TournamentListingStatus.open,
        featured: false,
        enrolledCount: 5,
        liveMatchesNow: 2,
        imageUrl: null,
      ),
      DiscoveryTournament(
        id: '2',
        name: 'B',
        location: 'L',
        city: 'C',
        dateLabel: 'd',
        startDate: DateTime.now(),
        categories: const [TournamentGenderCat.mix],
        format: TournamentFormat.dupla,
        priceLabel: r'R$ 10',
        priceValue: 10,
        spotsLeft: 0,
        spotsTotal: 10,
        status: TournamentListingStatus.ended,
        featured: false,
        enrolledCount: 10,
        liveMatchesNow: 0,
        imageUrl: null,
      ),
    ]);

    expect(stats.activeTournaments, 1);
    expect(stats.openRegistrations, 1);
    expect(stats.matchesLiveNow, 2);
  });
}
