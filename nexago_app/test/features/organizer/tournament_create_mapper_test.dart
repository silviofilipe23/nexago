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
    expect(map['keywords'], isA<List>());
    expect(map['enrolledCount'], 0);
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
    expect(parsed.wizardStep, TournamentCreateStep.registration);
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
      wizardStep: TournamentCreateStep.prizes,
      isUpdate: true,
    );

    expect(map['wizardStep'], 'prizes');
    expect(map.containsKey('createdAt'), isFalse);
    expect(map.containsKey('enrolledCount'), isFalse);
  });
}
