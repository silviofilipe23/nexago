import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:nexago_app/features/tournaments/domain/compete_hub_logic.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_discovery_models.dart';

DiscoveryTournament _tournament({
  required String id,
  required String name,
  TournamentListingStatus status = TournamentListingStatus.open,
  DateTime? startDate,
  DateTime? createdAt,
  List<TournamentCategoryOffer> categoryOffers = const [],
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
    featured: false,
    enrolledCount: 0,
    liveMatchesNow: 0,
    categoryOffers: categoryOffers,
    createdAt: createdAt,
  );
}

TournamentCategoryOffer _openCategory({
  required String id,
  String genderType = 'Masculino',
}) {
  return TournamentCategoryOffer(
    id: id,
    name: id,
    entryFee: 100,
    genderType: genderType,
    spotsTotal: 10,
    spotsLeft: 5,
    maxTeams: 10,
  );
}

void main() {
  setUpAll(() async {
    await initializeDateFormatting('pt_BR');
  });

  group('pickNewestRegisterableTournamentsForHub', () {
    test('orders by createdAt descending', () {
      final result = pickNewestRegisterableTournamentsForHub(
        [
          _tournament(
            id: 'older',
            name: 'Older',
            createdAt: DateTime(2026, 5, 1),
            categoryOffers: [_openCategory(id: 'c1')],
          ),
          _tournament(
            id: 'newer',
            name: 'Newer',
            createdAt: DateTime(2026, 6, 1),
            categoryOffers: [_openCategory(id: 'c2')],
          ),
        ],
        athleteGender: 'Masculino',
      );

      expect(result.map((t) => t.id), ['newer', 'older']);
    });

    test('falls back to startDate when createdAt is missing', () {
      final result = pickNewestRegisterableTournamentsForHub(
        [
          _tournament(
            id: 'a',
            name: 'A',
            startDate: DateTime(2026, 4, 1),
            categoryOffers: [_openCategory(id: 'c1')],
          ),
          _tournament(
            id: 'b',
            name: 'B',
            startDate: DateTime(2026, 6, 1),
            categoryOffers: [_openCategory(id: 'c2')],
          ),
        ],
        athleteGender: 'Masculino',
      );

      expect(result.first.id, 'b');
    });

    test('excludes closed tournaments and full categories', () {
      final result = pickNewestRegisterableTournamentsForHub(
        [
          _tournament(
            id: 'ended',
            name: 'Ended',
            status: TournamentListingStatus.ended,
            categoryOffers: [_openCategory(id: 'c1')],
          ),
          _tournament(
            id: 'open',
            name: 'Open',
            categoryOffers: [
              const TournamentCategoryOffer(
                id: 'full',
                name: 'Full',
                entryFee: 100,
                genderType: 'Masculino',
                spotsTotal: 8,
                spotsLeft: 0,
                maxTeams: 8,
              ),
            ],
          ),
          _tournament(
            id: 'registerable',
            name: 'Registerable',
            categoryOffers: [_openCategory(id: 'ok')],
          ),
        ],
        athleteGender: 'Masculino',
      );

      expect(result.map((t) => t.id), ['registerable']);
    });

    test('filters by athlete gender', () {
      final result = pickNewestRegisterableTournamentsForHub(
        [
          _tournament(
            id: 'masc',
            name: 'Masc',
            categoryOffers: [_openCategory(id: 'm', genderType: 'Masculino')],
          ),
          _tournament(
            id: 'fem',
            name: 'Fem',
            categoryOffers: [_openCategory(id: 'f', genderType: 'Feminino')],
          ),
          _tournament(
            id: 'mix',
            name: 'Mix',
            categoryOffers: [_openCategory(id: 'x', genderType: 'Misto')],
          ),
        ],
        athleteGender: 'Masculino',
      );

      expect(result.map((t) => t.id), containsAll(['masc', 'mix']));
      expect(result.map((t) => t.id), isNot(contains('fem')));
    });

    test('without profile gender only mixed/open categories count', () {
      final result = pickNewestRegisterableTournamentsForHub(
        [
          _tournament(
            id: 'masc',
            name: 'Masc',
            categoryOffers: [_openCategory(id: 'm', genderType: 'Masculino')],
          ),
          _tournament(
            id: 'mix',
            name: 'Mix',
            categoryOffers: [_openCategory(id: 'x', genderType: 'Misto')],
          ),
        ],
      );

      expect(result.single.id, 'mix');
    });

    test('excludes categories already registered by athlete', () {
      final result = pickNewestRegisterableTournamentsForHub(
        [
          _tournament(
            id: 't1',
            name: 'T1',
            categoryOffers: [_openCategory(id: 'cat-a')],
          ),
        ],
        athleteGender: 'Masculino',
        registeredCategoriesByTournamentId: const {
          't1': {'cat-a'},
        },
      );

      expect(result, isEmpty);
    });

    test('respects limit of 5', () {
      final tournaments = List.generate(
        8,
        (i) => _tournament(
          id: '$i',
          name: 'T$i',
          createdAt: DateTime(2026, 6, i + 1),
          categoryOffers: [_openCategory(id: 'c$i')],
        ),
      );

      final result = pickNewestRegisterableTournamentsForHub(
        tournaments,
        athleteGender: 'Masculino',
        limit: 5,
      );

      expect(result, hasLength(5));
      expect(result.first.createdAt, DateTime(2026, 6, 8));
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
          _tournament(
            id: '1',
            name: 'A',
            categoryOffers: [
              _openCategory(id: 'c1'),
              _openCategory(id: 'c2'),
            ],
          ),
        ),
        '2 categorias',
      );
      expect(
        hubTournamentCategoryCountLabel(
          _tournament(
            id: '1',
            name: 'A',
            categoryOffers: [_openCategory(id: 'c1')],
          ),
        ),
        '1 categoria',
      );
    });
  });
}
