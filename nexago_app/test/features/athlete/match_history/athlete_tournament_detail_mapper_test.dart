import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/athlete/domain/match_history/athlete_match_history_models.dart';
import 'package:nexago_app/features/athlete/domain/match_history/athlete_tournament_detail_mapper.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_detail_model.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_discovery_models.dart';

TournamentDetail _tournamentWithCategory({
  required String categoryId,
  required String categoryName,
}) {
  return TournamentDetail(
    id: 't1',
    name: 'Copa',
    location: 'Arena',
    city: 'Goiânia',
    dateLabel: 'JUN 2026',
    startDate: DateTime(2026, 6, 1),
    endDate: null,
    categories: const [TournamentGenderCat.m],
    format: TournamentFormat.dupla,
    priceLabel: 'R\$ 100',
    priceValue: 100,
    spotsLeft: 10,
    spotsTotal: 16,
    status: TournamentListingStatus.completed,
    featured: false,
    enrolledCount: 8,
    liveMatchesNow: 0,
    categoryOffers: [
      TournamentCategoryOffer(
        id: categoryId,
        name: categoryName,
        entryFee: 100,
      ),
    ],
  );
}

void main() {
  test('resolveTournamentCategoryLabel maps category id to offer name', () {
    final doc = _tournamentWithCategory(
      categoryId: 'cat-wb3',
      categoryName: 'WB3',
    );

    expect(
      resolveTournamentCategoryLabel(
        categoryId: 'cat-wb3',
        tournamentDoc: doc,
      ),
      'WB3',
    );
  });

  test('buildAthleteTournamentDetail uses category name in meta label', () {
    final doc = _tournamentWithCategory(
      categoryId: 'cat-wb3',
      categoryName: 'WB3',
    );
    final summary = AthleteTournamentHistoryItem(
      id: 't1',
      tournamentId: 't1',
      name: 'Copa',
      venue: 'Arena',
      periodLabel: 'JUN 2026',
      categoryLabel: 'cat-wb3',
      genderLabel: 'MASC',
      placement: 1,
      medal: TournamentPlacement.gold,
      wins: 3,
      losses: 0,
    );

    final detail = buildAthleteTournamentDetail(
      tournamentId: 't1',
      summary: summary,
      tournamentDoc: doc,
      tournamentMatches: const [],
      athleteTeamId: 'team-a',
      opponentNames: const {},
    );

    expect(detail.metaLabel, contains('WB3'));
    expect(detail.metaLabel, isNot(contains('cat-wb3')));
  });
}
