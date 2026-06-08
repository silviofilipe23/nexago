import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_detail_model.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_detail_tab.dart';
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
  test('visibleTournamentDetailTabs omits groups for double elimination', () {
    final tabs = visibleTournamentDetailTabs(
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

    expect(tabs, isNot(contains(TournamentDetailTab.groups)));
    expect(tabs, [
      TournamentDetailTab.overview,
      TournamentDetailTab.categories,
      TournamentDetailTab.bracket,
      TournamentDetailTab.prizes,
    ]);
  });

  test('visibleTournamentDetailTabs includes groups for pool play', () {
    final tabs = visibleTournamentDetailTabs(
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

    expect(tabs, contains(TournamentDetailTab.groups));
  });
}
