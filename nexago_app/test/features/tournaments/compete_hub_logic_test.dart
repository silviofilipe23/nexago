import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:nexago_app/features/tournaments/domain/compete_hub_logic.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_discovery_models.dart';

DiscoveryTournament _tournament({
  required String id,
  required String name,
  bool featured = false,
  TournamentListingStatus status = TournamentListingStatus.scheduled,
  DateTime? startDate,
  int categoryCount = 2,
}) {
  return DiscoveryTournament(
    id: id,
    name: name,
    city: 'Goiânia',
    location: 'Arena',
    dateLabel: '28 mai',
    startDate: startDate ?? DateTime(2026, 5, 28),
    categories: const [TournamentGenderCat.m],
    format: TournamentFormat.dupla,
    priceLabel: 'R\$ 100',
    priceValue: 100,
    spotsTotal: 20,
    spotsLeft: 10,
    status: status,
    featured: featured,
    enrolledCount: 0,
    liveMatchesNow: 0,
    categoryOffers: List.generate(
      categoryCount,
      (i) => TournamentCategoryOffer(
        id: 'c$i',
        name: 'Cat $i',
        entryFee: 100,
        genderType: 'm',
        spotsTotal: 10,
        spotsLeft: 5,
      ),
    ),
  );
}

void main() {
  setUpAll(() async {
    await initializeDateFormatting('pt_BR');
  });

  group('pickTournamentsForHubPreview', () {
    test('prioritizes featured and open tournaments', () {
      final result = pickTournamentsForHubPreview([
        _tournament(id: '1', name: 'Later', featured: false),
        _tournament(
          id: '2',
          name: 'Open featured',
          featured: true,
          status: TournamentListingStatus.open,
        ),
        _tournament(
          id: '3',
          name: 'Open',
          status: TournamentListingStatus.open,
        ),
      ]);

      expect(result.first.id, '2');
      expect(result.map((t) => t.id), contains('3'));
    });

    test('respects limit', () {
      final result = pickTournamentsForHubPreview(
        List.generate(10, (i) => _tournament(id: '$i', name: 'T$i')),
        limit: 4,
      );
      expect(result, hasLength(4));
    });
  });

  group('hubTournamentDateLabel', () {
    test('formats short month label', () {
      final label = hubTournamentDateLabel(
        _tournament(id: '1', name: 'A', startDate: DateTime(2026, 5, 28)),
      );
      expect(label, contains('28'));
      expect(label, contains('mai'));
    });
  });

  group('hubTournamentCategoryCountLabel', () {
    test('formats category count', () {
      expect(
        hubTournamentCategoryCountLabel(
          _tournament(id: '1', name: 'A', categoryCount: 6),
        ),
        '6 categorias',
      );
      expect(
        hubTournamentCategoryCountLabel(
          _tournament(id: '1', name: 'A', categoryCount: 1),
        ),
        '1 categoria',
      );
    });
  });
}
