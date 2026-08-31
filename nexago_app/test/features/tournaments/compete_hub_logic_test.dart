import 'dart:math';

import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:nexago_app/features/athlete/domain/athlete_profile.dart';
import 'package:nexago_app/features/tournaments/domain/compete_hub_logic.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_discovery_models.dart';

AthleteProfile _athlete({
  required String id,
  String name = 'Atleta',
  String city = '',
  String? state,
  String category = '',
  String level = '',
  String? avatarUrl,
}) {
  return AthleteProfile(
    id: id,
    name: name,
    sport: 'Vôlei de praia',
    level: level,
    city: city,
    state: state,
    category: category.isEmpty ? null : category,
    avatarUrl: avatarUrl,
  );
}

DiscoveryTournament _tournament({
  required String id,
  required String name,
  TournamentListingStatus status = TournamentListingStatus.open,
  DateTime? startDate,
  DateTime? createdAt,
  DateTime? registrationOpensAt,
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
    registrationOpensAt: registrationOpensAt,
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

  group('pickTournamentsForHubPreview', () {
    test('fills with finished tournaments when registerable list is short', () {
      final result = pickTournamentsForHubPreview(
        [
          _tournament(
            id: 'open',
            name: 'Open',
            createdAt: DateTime(2026, 6, 10),
            categoryOffers: [_openCategory(id: 'c1')],
          ),
          _tournament(
            id: 'ended',
            name: 'Ended',
            status: TournamentListingStatus.ended,
            createdAt: DateTime(2026, 6, 9),
            categoryOffers: [_openCategory(id: 'c2')],
          ),
          _tournament(
            id: 'completed',
            name: 'Completed',
            status: TournamentListingStatus.completed,
            createdAt: DateTime(2026, 6, 8),
            categoryOffers: [_openCategory(id: 'c3')],
          ),
        ],
        athleteGender: 'Masculino',
        limit: 3,
      );

      expect(result.map((t) => t.id), ['open', 'ended', 'completed']);
    });

    test('does not duplicate tournaments when filling', () {
      final result = pickTournamentsForHubPreview(
        [
          _tournament(
            id: 'open',
            name: 'Open',
            categoryOffers: [_openCategory(id: 'c1')],
          ),
        ],
        athleteGender: 'Masculino',
        limit: 3,
      );

      expect(result, hasLength(1));
      expect(result.single.id, 'open');
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

  group('pickAthletesForHubPreview', () {
    final viewer = _athlete(
      id: 'me',
      name: 'Viewer',
      city: 'Goiânia',
      state: 'GO',
    );

    test('prioritizes same city then same state', () {
      final regional = [
        _athlete(id: 'uf', name: 'UF', city: 'Anápolis', state: 'GO'),
        _athlete(id: 'city1', name: 'C1', city: 'Goiânia', state: 'GO'),
        _athlete(id: 'city2', name: 'C2', city: 'Goiânia', state: 'GO'),
      ];

      final picked = pickAthletesForHubPreview(
        viewer: viewer,
        regionalPool: regional,
        randomPool: const [],
        currentUserId: 'me',
        limit: 3,
        random: Random(1),
      );

      expect(picked.map((p) => p.id), containsAll(['city1', 'city2', 'uf']));
      expect(picked.first.id, isIn(['city1', 'city2']));
    });

    test('fills with random pool when regional is insufficient', () {
      final regional = [
        _athlete(id: 'city1', name: 'C1', city: 'Goiânia', state: 'GO'),
      ];
      final random = List.generate(
        5,
        (i) => _athlete(id: 'r$i', name: 'R$i', city: 'SP', state: 'SP'),
      );

      final picked = pickAthletesForHubPreview(
        viewer: viewer,
        regionalPool: regional,
        randomPool: random,
        currentUserId: 'me',
        limit: 4,
        random: Random(2),
      );

      expect(picked, hasLength(4));
      expect(picked.first.id, 'city1');
      expect(picked.where((p) => p.id.startsWith('r')), hasLength(3));
    });

    test('excludes current user from results', () {
      final regional = [
        _athlete(id: 'me', name: 'Me', city: 'Goiânia', state: 'GO'),
        _athlete(id: 'other', name: 'Other', city: 'Goiânia', state: 'GO'),
      ];

      final picked = pickAthletesForHubPreview(
        viewer: viewer,
        regionalPool: regional,
        randomPool: const [],
        currentUserId: 'me',
        limit: 10,
      );

      expect(picked.map((p) => p.id), ['other']);
    });

    test('uses only random pool when viewer has no location', () {
      final random = [
        _athlete(id: 'a', city: 'Curitiba', state: 'PR'),
        _athlete(id: 'b', city: 'SP', state: 'SP'),
      ];

      final picked = pickAthletesForHubPreview(
        viewer: _athlete(id: 'me'),
        regionalPool: const [],
        randomPool: random,
        currentUserId: 'me',
        limit: 2,
        random: Random(3),
      );

      expect(picked.map((p) => p.id), containsAll(['a', 'b']));
    });
  });

  group('athleteMatchesViewerCity', () {
    test('matches city with compatible state', () {
      final viewer = _athlete(id: 'v', city: 'Goiânia', state: 'GO');
      final other = _athlete(id: 'o', city: 'Goiânia', state: 'GO');
      expect(athleteMatchesViewerCity(viewer, other), isTrue);
    });

    test('rejects different city', () {
      final viewer = _athlete(id: 'v', city: 'Goiânia', state: 'GO');
      final other = _athlete(id: 'o', city: 'Anápolis', state: 'GO');
      expect(athleteMatchesViewerCity(viewer, other), isFalse);
    });
  });

  group('buildCompeteHubAthletePreview', () {
    test('uses category with level fallback', () {
      final withCategory = buildCompeteHubAthletePreview(
        _athlete(id: '1', name: 'Ana Silva', category: 'Cat B'),
      );
      expect(withCategory.name, 'Ana Silva');
      expect(withCategory.categoryLabel, 'Cat B');
      expect(withCategory.userId, '1');

      final withLevel = buildCompeteHubAthletePreview(
        _athlete(id: '2', name: 'Bob', level: 'Open'),
      );
      expect(withLevel.categoryLabel, 'Open');

      final withPhoto = buildCompeteHubAthletePreview(
        _athlete(
          id: '3',
          name: 'Carla',
          avatarUrl: 'https://example.com/photo.jpg',
        ),
      );
      expect(withPhoto.avatarUrl, 'https://example.com/photo.jpg');
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
        '2 CATEGORIAS',
      );
      expect(
        hubTournamentCategoryCountLabel(
          _tournament(
            id: '1',
            name: 'A',
            categoryOffers: [_openCategory(id: 'c1')],
          ),
        ),
        '1 CATEGORIA',
      );
    });
  });

  group('inscrições agendadas (registrationOpensAt futuro)', () {
    test('torneio some do hub enquanto as inscrições não abrem', () {
      final t = _tournament(
        id: 't-agendado',
        name: 'Etapa Futuro',
        categoryOffers: [_openCategory(id: 'c1')],
        registrationOpensAt: DateTime(2026, 9, 5, 10, 0),
      );

      expect(
        tournamentHasRegisterableCategoryForUser(
          t,
          athleteGender: 'Masculino',
          now: DateTime(2026, 9, 5, 9, 0),
        ),
        isFalse,
      );
      expect(
        tournamentHasRegisterableCategoryForUser(
          t,
          athleteGender: 'Masculino',
          now: DateTime(2026, 9, 5, 10, 0),
        ),
        isTrue,
      );
    });
  });
}
