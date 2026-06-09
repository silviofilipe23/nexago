import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/theme/app_colors.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_category_spots.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_discovery_models.dart';

void main() {
  group('resolveInscriptionCountForOffer', () {
    const offer = TournamentCategoryOffer(
      id: 'Masc',
      name: 'Masculino C',
      entryFee: 90,
      maxTeams: 8,
    );

    test('returns null while counts are unresolved', () {
      expect(
        resolveInscriptionCountForOffer(
          const {'Masculino C': 2},
          offer,
          countsResolved: false,
        ),
        isNull,
      );
    });

    test('matches by id, name, or case-insensitive key', () {
      expect(
        resolveInscriptionCountForOffer(
          const {'Masc': 3},
          offer,
          countsResolved: true,
        ),
        3,
      );
      expect(
        resolveInscriptionCountForOffer(
          const {'Masculino C': 2},
          offer,
          countsResolved: true,
        ),
        2,
      );
      expect(
        resolveInscriptionCountForOffer(
          const {'masculino c': 4},
          offer,
          countsResolved: true,
        ),
        4,
      );
    });

    test('returns zero when resolved and category has no paid inscriptions', () {
      expect(
        resolveInscriptionCountForOffer(
          const {'Misto': 1},
          offer,
          countsResolved: true,
        ),
        0,
      );
    });

    test('matches inscription counts keyed by category uuid', () {
      const uuid = '51e5b0b4-7de7-4e39-a883-e83325a2391e';
      const uuidOffer = TournamentCategoryOffer(
        id: uuid,
        name: 'Open',
        entryFee: 0,
        maxTeams: 8,
      );
      expect(
        resolveInscriptionCountForOffer(
          const {uuid: 1},
          uuidOffer,
          countsResolved: true,
        ),
        1,
      );
    });
  });

  group('categoryMaxTeams', () {
    test('uses inscription count when provided', () {
      const offer = TournamentCategoryOffer(
        id: 'c',
        name: 'Cat',
        entryFee: 90,
        maxTeams: 8,
        spotsTotal: 8,
        spotsLeft: 0,
      );
      expect(categoryEnrolledCount(offer, inscriptionCount: 5), 5);
      expect(categorySpotsLeft(offer, inscriptionCount: 5), 3);
    });

    test('prefers maxTeams over spotsTotal', () {
      const offer = TournamentCategoryOffer(
        id: 'c',
        name: 'Cat',
        entryFee: 90,
        maxTeams: 8,
        spotsTotal: 30,
        spotsLeft: 3,
      );
      expect(categoryMaxTeams(offer), 8);
      expect(categoryEnrolledCount(offer), 5);
    });

    test('falls back to spotsTotal when maxTeams is zero', () {
      const offer = TournamentCategoryOffer(
        id: 'c',
        name: 'Cat',
        entryFee: 90,
        spotsTotal: 10,
        spotsLeft: 4,
      );
      expect(categoryMaxTeams(offer), 10);
      expect(categoryEnrolledCount(offer), 6);
    });
  });

  group('categorySpotsVisualStatus', () {
    test('full when no spots left', () {
      expect(
        categorySpotsVisualStatus(spotsLeft: 0, spotsTotal: 8),
        CategorySpotsVisualStatus.full,
      );
      expect(
        categorySpotsRightLabel(
          spotsLeft: 0,
          status: CategorySpotsVisualStatus.full,
        ),
        'LOTADA',
      );
    });

    test('almost full at 75% or more', () {
      expect(
        categorySpotsVisualStatus(spotsLeft: 2, spotsTotal: 8),
        CategorySpotsVisualStatus.almostFull,
      );
      expect(
        categorySpotsStatusColor(CategorySpotsVisualStatus.almostFull),
        AppColors.pending,
      );
    });

    test('available below 75%', () {
      expect(
        categorySpotsVisualStatus(spotsLeft: 8, spotsTotal: 16),
        CategorySpotsVisualStatus.available,
      );
      expect(
        categorySpotsStatusColor(CategorySpotsVisualStatus.available),
        AppColors.win,
      );
      expect(
        categorySpotsRightLabel(
          spotsLeft: 8,
          status: CategorySpotsVisualStatus.available,
        ),
        '8 livres',
      );
    });
  });
}
