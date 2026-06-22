import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_detail_logic.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_detail_model.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_discovery_models.dart';

TournamentDetail _tournament({required List<TournamentCategoryOffer> offers}) {
  return TournamentDetail(
    id: 't1',
    name: 'Torneio',
    location: 'Arena',
    city: 'Goiânia',
    dateLabel: '21/04',
    startDate: DateTime(2026, 4, 21),
    endDate: DateTime(2026, 4, 21),
    categories: const [TournamentGenderCat.m],
    format: TournamentFormat.dupla,
    priceLabel: r'R$ 90',
    priceValue: 90,
    spotsLeft: 20,
    spotsTotal: 80,
    status: TournamentListingStatus.open,
    featured: false,
    enrolledCount: 0,
    liveMatchesNow: 0,
    categoryOffers: offers,
  );
}

void main() {
  test('tournamentShouldShowGroupsTab is false for double elimination', () {
    final show = tournamentShouldShowGroupsTab(
      _tournament(
        offers: const [
          TournamentCategoryOffer(
            id: 'de',
            name: 'Misto',
            entryFee: 90,
            spotsLeft: 8,
            spotsTotal: 16,
            bracketFormat: 'Double Elimination',
          ),
        ],
      ),
    );

    expect(show, isFalse);
  });

  test('tournamentShouldShowGroupsTab is true for pool play', () {
    final show = tournamentShouldShowGroupsTab(
      _tournament(
        offers: const [
          TournamentCategoryOffer(
            id: 'pool',
            name: 'Misto',
            entryFee: 90,
            spotsLeft: 8,
            spotsTotal: 16,
            bracketFormat: 'Pool Play + SE',
          ),
        ],
      ),
    );

    expect(show, isTrue);
  });
}
