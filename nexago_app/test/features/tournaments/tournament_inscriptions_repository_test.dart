import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/tournaments/data/tournament_inscriptions_repository.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_category_spots.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_discovery_models.dart';

void main() {
  group('countInscriptionsByCategoryData', () {
    test('groups by categoryId', () {
      expect(
        countInscriptionsByCategoryData([
          {'categoryId': 'Masculino C'},
          {'categoryId': 'Masculino C'},
          {'categoryId': 'Misto'},
          {'tournamentId': 't1'},
        ]),
        {
          'Masculino C': 2,
          'Misto': 1,
        },
      );
    });
  });

  group('inscriptionCountForCategory', () {
    test('returns zero for unknown category', () {
      expect(inscriptionCountForCategory(const {}, 'X'), 0);
      expect(
        inscriptionCountForCategory({'Misto': 3}, 'Masculino C'),
        0,
      );
    });
  });

  group('categorySpotsLeft with inscriptions', () {
    test('computes remaining from maxTeams and inscription count', () {
      const offer = TournamentCategoryOffer(
        id: 'Misto',
        name: 'Misto',
        entryFee: 90,
        maxTeams: 8,
        spotsTotal: 8,
        spotsLeft: 2,
      );
      expect(
        categorySpotsLeft(offer, inscriptionCount: 5),
        3,
      );
      expect(
        categoryEnrolledCount(offer, inscriptionCount: 5),
        5,
      );
    });
  });
}
