import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:nexago_app/features/organizer/data/tournament_create_mapper.dart';
import 'package:nexago_app/features/organizer/domain/tournament_create/tournament_create_draft.dart';

void main() {
  setUpAll(() async {
    await initializeDateFormatting('pt_BR');
  });

  test('toFirestore maps draft with publish status open', () {
    final draft = TournamentCreateDraft(
      name: 'Open Goiânia Beach',
      city: 'Goiânia',
      state: 'GO',
      locationName: 'Arena ErreJota',
      startAt: DateTime(2026, 3, 28),
      endAt: DateTime(2026, 3, 30),
      registrationOpensAt: DateTime(2026, 3, 1),
      registrationClosesAt: DateTime(2026, 3, 26),
      categories: const [
        TournamentCategoryDraft(
          id: 'cat-1',
          name: 'Masculino Open',
          spots: 16,
          priceCents: 18000,
        ),
      ],
    );

    final map = TournamentCreateMapper.toFirestore(
      draft: draft,
      managerId: 'manager-1',
      publish: true,
    );

    expect(map['name'], 'Open Goiânia Beach');
    expect(map['managerId'], 'manager-1');
    expect(map['listingStatus'], 'open');
    expect(map['city'], 'Goiânia');
    expect(map['categories'], isA<List>());
    expect((map['categories'] as List).length, 1);
    expect(map.containsKey('bracketSystem'), isFalse);

    final category = (map['categories'] as List).first as Map<String, dynamic>;
    expect(category['bracketFormat'], 'groups_knockout');
    expect(category['teamsPerGroup'], 4);
    expect(category['bestOf'], 'bestOf3');
    expect(map['keywords'], isA<List>());
    expect(map['enrolledCount'], 0);
    expect(map['collectedCents'], 0);
  });

  test('toFirestore draft status when not publishing', () {
    final draft = TournamentCreateDraft(
      name: 'Rascunho',
      city: 'Goiânia',
      locationName: 'Arena',
      startAt: DateTime(2026, 4, 1),
      endAt: DateTime(2026, 4, 2),
      categories: const [TournamentCategoryDraft(id: '1')],
    );

    final map = TournamentCreateMapper.toFirestore(
      draft: draft,
      managerId: 'uid',
      publish: false,
    );

    expect(map['listingStatus'], 'draft');
  });

  test('fromFirestore maps draft and wizardStep', () {
    final parsed = TournamentCreateMapper.fromFirestore(
      {
        'name': 'Open Goiânia Beach',
        'sport': 'beachVolleyball',
        'city': 'Goiânia',
        'state': 'GO',
        'locationName': 'Arena ErreJota',
        'startAt': Timestamp.fromDate(DateTime(2026, 3, 28)),
        'endAt': Timestamp.fromDate(DateTime(2026, 3, 30)),
        'bracketSystem': 'groups_knockout',
        'bestOf': 'bestOf3',
        'paymentMode': 'appPixCard',
        'visibility': 'publicListing',
        'wizardStep': 'registration',
        'categories': [
          {
            'id': 'cat-1',
            'categoryName': 'Masculino Open',
            'genderType': 'male',
            'disputeType': 'dupla',
            'maxTeams': 16,
            'entryFeeCents': 18000,
          },
        ],
      },
      'tournament-123',
    );

    expect(parsed.draft.tournamentId, 'tournament-123');
    expect(parsed.draft.name, 'Open Goiânia Beach');
    expect(parsed.draft.city, 'Goiânia');
    expect(parsed.draft.categories, hasLength(1));
    expect(parsed.draft.categories.first.name, 'Masculino Open');
    expect(
      parsed.draft.categories.first.bracketSystem,
      TournamentBracketSystem.groupsThenKnockout,
    );
    expect(parsed.draft.categories.first.bestOf, TournamentBestOf.bestOf3);
    expect(parsed.wizardStep, TournamentCreateStep.registration);
  });

  test('fromFirestore legacy category inherits tournament-level format', () {
    final parsed = TournamentCreateMapper.fromFirestore(
      {
        'name': 'Legacy',
        'city': 'Goiânia',
        'locationName': 'Arena',
        'startAt': Timestamp.fromDate(DateTime(2026, 3, 28)),
        'endAt': Timestamp.fromDate(DateTime(2026, 3, 30)),
        'bracketSystem': 'double_elimination',
        'teamsPerGroup': 3,
        'qualifiersPerGroup': 1,
        'bestOf': 'bestOf5',
        'finalBestOf5': false,
        'categories': [
          {
            'id': 'cat-1',
            'categoryName': 'Masc',
            'maxTeams': 8,
          },
        ],
      },
      'legacy-1',
    );

    final category = parsed.draft.categories.first;
    expect(category.bracketSystem, TournamentBracketSystem.doubleElimination);
    expect(category.teamsPerGroup, 3);
    expect(category.qualifiersPerGroup, 1);
    expect(category.bestOf, TournamentBestOf.bestOf5);
    expect(category.finalBestOf5, isFalse);
  });

  test('toFirestore persists per-category format fields', () {
    final draft = TournamentCreateDraft(
      name: 'Multi',
      city: 'Goiânia',
      locationName: 'Arena',
      startAt: DateTime(2026, 4, 1),
      endAt: DateTime(2026, 4, 2),
      categories: const [
        TournamentCategoryDraft(
          id: 'c1',
          bracketSystem: TournamentBracketSystem.groupsThenKnockout,
        ),
        TournamentCategoryDraft(
          id: 'c2',
          bracketSystem: TournamentBracketSystem.doubleElimination,
          bestOf: TournamentBestOf.bestOf5,
        ),
      ],
    );

    final map = TournamentCreateMapper.toFirestore(
      draft: draft,
      managerId: 'uid',
      publish: true,
    );

    final categories = map['categories'] as List;
    expect(categories[0]['bracketFormat'], 'groups_knockout');
    expect(categories[1]['bracketFormat'], 'double_elimination');
    expect(categories[1]['bestOf'], 'bestOf5');
  });

    test('toFirestore includes wizardStep when provided', () {
    final draft = TournamentCreateDraft(
      name: 'Rascunho',
      city: 'Goiânia',
      locationName: 'Arena',
      startAt: DateTime(2026, 4, 1),
      endAt: DateTime(2026, 4, 2),
      categories: [TournamentCategoryDraft(id: '1')],
    );

    final map = TournamentCreateMapper.toFirestore(
      draft: draft,
      managerId: 'uid',
      publish: false,
      wizardStep: TournamentCreateStep.rules,
      isUpdate: true,
    );

    expect(map['wizardStep'], 'rules');
    expect(map.containsKey('createdAt'), isFalse);
    expect(map.containsKey('enrolledCount'), isFalse);
    expect(map.containsKey('collectedCents'), isFalse);
  });

  test('toFirestore propagates uniform settings to categories', () {
    final draft = TournamentCreateDraft(
      name: 'Uniform Open',
      city: 'Goiânia',
      locationName: 'Arena',
      startAt: DateTime(2026, 4, 1),
      endAt: DateTime(2026, 4, 2),
      uniformRequired: true,
      uniformNumberOnShirt: true,
      uniformNameOnShirt: true,
      categories: const [TournamentCategoryDraft(id: 'cat-1')],
    );

    final map = TournamentCreateMapper.toFirestore(
      draft: draft,
      managerId: 'uid',
      publish: true,
    );

    expect(map['uniformRequired'], isTrue);
    expect(map['uniformNumberOnShirt'], isTrue);
    expect(map['uniformNameOnShirt'], isTrue);

    final category = (map['categories'] as List).first as Map<String, dynamic>;
    expect(category['uniformType'], 'top_only');
    expect(category['uniformNumberOnShirt'], isTrue);
    expect(category['uniformNameOnShirt'], isTrue);
  });

  test('toFirestore clears category uniform when kit disabled', () {
    final draft = TournamentCreateDraft(
      name: 'No Kit',
      city: 'Goiânia',
      locationName: 'Arena',
      startAt: DateTime(2026, 4, 1),
      endAt: DateTime(2026, 4, 2),
      uniformRequired: false,
      uniformNumberOnShirt: true,
      uniformNameOnShirt: true,
      categories: const [TournamentCategoryDraft(id: 'cat-1')],
    );

    final map = TournamentCreateMapper.toFirestore(
      draft: draft,
      managerId: 'uid',
      publish: true,
    );

    expect(map['uniformRequired'], isFalse);
    expect(map['uniformNumberOnShirt'], isFalse);
    expect(map['uniformNameOnShirt'], isFalse);

    final category = (map['categories'] as List).first as Map<String, dynamic>;
    expect(category['uniformType'], 'none');
    expect(category['uniformNumberOnShirt'], isFalse);
    expect(category['uniformNameOnShirt'], isFalse);
  });

  TournamentCreateDraft draftWith({
    List<TournamentCategoryDraft> categories = const [
      TournamentCategoryDraft(id: 'c1', spots: 16),
    ],
    bool rankingEnabled = true,
    String rankingTableId = 'nexago_standalone',
  }) {
    return TournamentCreateDraft(
      name: 'Open',
      city: 'Goiânia',
      locationName: 'Arena',
      startAt: DateTime(2026, 4, 1),
      endAt: DateTime(2026, 4, 2),
      categories: categories,
      rankingEnabled: rankingEnabled,
      rankingTableId: rankingTableId,
    );
  }

  test('toFirestore capacity is the sum of category spots', () {
    final map = TournamentCreateMapper.toFirestore(
      draft: draftWith(
        categories: const [
          TournamentCategoryDraft(id: 'c1', spots: 16),
          TournamentCategoryDraft(id: 'c2', spots: 12),
        ],
      ),
      managerId: 'uid',
      publish: true,
    );
    expect(map['capacity'], 28);
  });

  test('toFirestore format is dupla by default and individual when present', () {
    final dupla = TournamentCreateMapper.toFirestore(
      draft: draftWith(),
      managerId: 'uid',
      publish: true,
    );
    expect(dupla['format'], 'dupla');

    final individual = TournamentCreateMapper.toFirestore(
      draft: draftWith(
        categories: const [
          TournamentCategoryDraft(id: 'c1'),
          TournamentCategoryDraft(
            id: 'c2',
            dispute: TournamentCategoryDispute.individual,
          ),
        ],
      ),
      managerId: 'uid',
      publish: true,
    );
    expect(individual['format'], 'individual');
  });

  test('toFirestore nulls rankingTableId when ranking disabled', () {
    final on = TournamentCreateMapper.toFirestore(
      draft: draftWith(rankingEnabled: true),
      managerId: 'uid',
      publish: true,
    );
    expect(on['rankingEnabled'], isTrue);
    expect(on['rankingTableId'], 'nexago_standalone');

    final off = TournamentCreateMapper.toFirestore(
      draft: draftWith(rankingEnabled: false),
      managerId: 'uid',
      publish: true,
    );
    expect(off['rankingEnabled'], isFalse);
    expect(off['rankingTableId'], isNull);
  });

  test('fromFirestore parses legacy prize "value" (reais) to cents', () {
    final parsed = TournamentCreateMapper.fromFirestore(
      {
        'name': 'Legacy Prizes',
        'city': 'Goiânia',
        'locationName': 'Arena',
        'startAt': Timestamp.fromDate(DateTime(2026, 3, 28)),
        'endAt': Timestamp.fromDate(DateTime(2026, 3, 30)),
        'categories': [
          {
            'id': 'cat-1',
            'maxTeams': 16,
            'prizes': [
              {'position': '1', 'value': 150},
              {'position': '2', 'valueCents': 8000},
            ],
          },
        ],
      },
      'legacy-prizes',
    );

    final prizes = parsed.draft.categories.first.prizes;
    expect(prizes, hasLength(2));
    expect(prizes[0].valueCents, 15000);
    expect(prizes[1].valueCents, 8000);
  });

  test('fromFirestore tolerates legacy prize "value" as a string (no crash)', () {
    final parsed = TournamentCreateMapper.fromFirestore(
      {
        'name': 'Legacy String Prizes',
        'city': 'Goiânia',
        'locationName': 'Arena',
        'startAt': Timestamp.fromDate(DateTime(2026, 3, 28)),
        'endAt': Timestamp.fromDate(DateTime(2026, 3, 30)),
        'categories': [
          {
            'id': 'cat-1',
            'maxTeams': 16,
            'prizes': [
              {'position': '1', 'value': '150'},
              {'position': '2', 'value': 'abc'},
            ],
          },
        ],
      },
      'legacy-string-prizes',
    );

    final prizes = parsed.draft.categories.first.prizes;
    expect(prizes, hasLength(2));
    expect(prizes[0].valueCents, 15000);
    expect(prizes[1].valueCents, 0); // não numérico → 0, sem estourar
  });

  test('fromFirestore maps coverUrl to coverImageUrl', () {
    final parsed = TournamentCreateMapper.fromFirestore(
      {
        'name': 'Torneio com capa',
        'city': 'Goiânia',
        'locationName': 'Arena',
        'startAt': Timestamp.fromDate(DateTime(2026, 3, 28)),
        'endAt': Timestamp.fromDate(DateTime(2026, 3, 30)),
        'coverUrl': 'https://cdn.example.com/cover.jpg',
        'categories': const [],
      },
      'tournament-cover',
    );

    expect(parsed.draft.coverImageUrl, 'https://cdn.example.com/cover.jpg');
  });

  test('fromFirestore falls back to imageUrl for cover', () {
    final parsed = TournamentCreateMapper.fromFirestore(
      {
        'name': 'Torneio legado',
        'city': 'Goiânia',
        'locationName': 'Arena',
        'startAt': Timestamp.fromDate(DateTime(2026, 3, 28)),
        'endAt': Timestamp.fromDate(DateTime(2026, 3, 30)),
        'imageUrl': 'https://cdn.example.com/legacy.jpg',
        'categories': const [],
      },
      'tournament-legacy-cover',
    );

    expect(parsed.draft.coverImageUrl, 'https://cdn.example.com/legacy.jpg');
  });

  test('fromFirestore maps published tournament with tournamentId', () {
    final parsed = TournamentCreateMapper.fromFirestore(
      {
        'name': 'Open Publicado',
        'sport': 'beachVolleyball',
        'city': 'Goiânia',
        'state': 'GO',
        'locationName': 'Arena ErreJota',
        'startAt': Timestamp.fromDate(DateTime(2026, 3, 28)),
        'endAt': Timestamp.fromDate(DateTime(2026, 3, 30)),
        'listingStatus': 'open',
        'paymentMode': 'appPixCard',
        'visibility': 'publicListing',
        'categories': [
          {
            'id': 'cat-1',
            'categoryName': 'Masculino Open',
            'genderType': 'male',
            'disputeType': 'dupla',
            'maxTeams': 16,
            'entryFeeCents': 18000,
          },
        ],
      },
      'published-tournament-1',
    );

    expect(parsed.draft.tournamentId, 'published-tournament-1');
    expect(parsed.draft.name, 'Open Publicado');
    expect(parsed.draft.categories, hasLength(1));
  });

  test('toFirestore preserves existing listing status on update without publish', () {
    final draft = TournamentCreateDraft(
      tournamentId: 'published-1',
      name: 'Open Publicado',
      city: 'Goiânia',
      locationName: 'Arena',
      startAt: DateTime(2026, 4, 1),
      endAt: DateTime(2026, 4, 2),
      categories: const [TournamentCategoryDraft(id: '1')],
    );

    final map = TournamentCreateMapper.toFirestore(
      draft: draft,
      managerId: 'uid',
      publish: false,
      isUpdate: true,
      existingListingStatus: 'open',
    );

    expect(map['listingStatus'], 'open');
    expect(map['status'], 'open');
  });

  group('categoria de equipe (trio+) — roundtrip de edição', () {
    Map<String, dynamic> docWithCategory(Map<String, dynamic> category) => {
      'name': 'Copa dos Trios',
      'city': 'Goiânia',
      'locationName': 'Arena',
      'startAt': Timestamp.fromDate(DateTime(2026, 5, 10)),
      'endAt': Timestamp.fromDate(DateTime(2026, 5, 11)),
      'categories': [category],
    };

    Map<String, dynamic> trioCompositionCategory() => {
      'id': 'cat-trio',
      'categoryName': 'Trio Misto',
      'genderType': 'mixed',
      'disputeType': 'trio',
      'teamSize': 3,
      'genderMode': 'composition',
      'genderComposition': {'men': 2, 'women': 1},
      'maxTeams': 8,
      'entryFeeCents': 21000,
    };

    test('fromFirestore popula dispute trio + composição de gênero', () {
      final parsed = TournamentCreateMapper.fromFirestore(
        docWithCategory(trioCompositionCategory()),
        'trio-1',
      );

      final category = parsed.draft.categories.single;
      expect(category.dispute, TournamentCategoryDispute.trio);
      expect(category.gender, TournamentCategoryGender.mixed);
      expect(category.genderFree, isFalse);
      expect(category.menCount, 2);
      expect(category.womenCount, 1);
    });

    test('toFirestore do draft parseado preserva teamSize/genderMode/composição', () {
      final parsed = TournamentCreateMapper.fromFirestore(
        docWithCategory(trioCompositionCategory()),
        'trio-1',
      );

      final map = TournamentCreateMapper.toFirestore(
        draft: parsed.draft,
        managerId: 'uid',
        publish: false,
        isUpdate: true,
        existingListingStatus: 'open',
      );

      final category = (map['categories'] as List).single as Map<String, dynamic>;
      expect(category['disputeType'], 'trio');
      expect(category['teamSize'], 3);
      expect(category['genderMode'], 'composition');
      expect(category['genderComposition'], {'men': 2, 'women': 1});
      expect(category['genderType'], 'mixed');
    });

    test('genderMode free → genderFree true e write mixed sem composição', () {
      final parsed = TournamentCreateMapper.fromFirestore(
        docWithCategory({
          'id': 'cat-quarteto',
          'categoryName': 'Quarteto Livre',
          'genderType': 'mixed',
          'disputeType': 'quarteto',
          'teamSize': 4,
          'genderMode': 'free',
          'maxTeams': 6,
          'entryFeeCents': 28000,
        }),
        'quarteto-1',
      );

      final draftCategory = parsed.draft.categories.single;
      expect(draftCategory.dispute, TournamentCategoryDispute.quarteto);
      expect(draftCategory.genderFree, isTrue);
      expect(draftCategory.menCount, isNull);
      expect(draftCategory.womenCount, isNull);

      final map = TournamentCreateMapper.toFirestore(
        draft: parsed.draft,
        managerId: 'uid',
        publish: false,
        isUpdate: true,
        existingListingStatus: 'open',
      );

      final category = (map['categories'] as List).single as Map<String, dynamic>;
      expect(category['teamSize'], 4);
      expect(category['genderMode'], 'free');
      expect(category['genderComposition'], isNull);
      expect(category['genderType'], 'mixed');
    });

    test('dupla não ganha genderMode mas grava teamSize 2', () {
      final map = TournamentCreateMapper.toFirestore(
        draft: TournamentCreateDraft(
          name: 'Open Duplas',
          city: 'Goiânia',
          locationName: 'Arena',
          startAt: DateTime(2026, 5, 10),
          endAt: DateTime(2026, 5, 11),
          categories: const [
            TournamentCategoryDraft(id: 'cat-dupla', name: 'Masculino Open'),
          ],
        ),
        managerId: 'uid',
        publish: true,
      );

      final category = (map['categories'] as List).single as Map<String, dynamic>;
      expect(category['teamSize'], 2);
      expect(category.containsKey('genderMode'), isFalse);
      expect(category.containsKey('genderComposition'), isFalse);
    });
  });
}
