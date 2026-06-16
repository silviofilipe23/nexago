import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/tournaments/data/tournament_inscriptions_repository.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_category_spots.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_discovery_models.dart';

void main() {
  group('countInscriptionsByCategoryData', () {
    test('groups paid inscriptions by categoryId', () {
      expect(
        countInscriptionsByCategoryData([
          {'categoryId': 'Masculino C', 'isPaid': true},
          {'categoryId': 'Masculino C', 'isPaid': true},
          {'categoryId': 'Misto', 'isPaid': true},
          {'categoryId': 'Misto', 'isPaid': true, 'waitlist': true},
          {'categoryId': 'Misto', 'isPaid': false},
          {'categoryId': 'Feminino C'},
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

  group('userRegistrationsByCategoryData', () {
    final rows = <({
      String registrationId,
      Map<String, dynamic> inscription,
      Map<String, dynamic>? team,
    })>[
      (
        registrationId: 'reg-1',
        inscription: {'categoryId': 'Masculino C', 'teamId': 't1'},
        team: {'player1Id': 'uid-a', 'player2Id': 'uid-b'},
      ),
      (
        registrationId: 'reg-2',
        inscription: {'categoryId': 'Misto', 'teamId': 't2'},
        team: {'player1Id': 'uid-c', 'player2Id': 'uid-a'},
      ),
    ];

    test('maps categoryId to registrationId for athlete teams', () {
      expect(
        userRegistrationsByCategoryData(rows, 'uid-a'),
        {
          'Masculino C': 'reg-1',
          'Misto': 'reg-2',
        },
      );
    });
  });

  group('userWaitlistByCategoryData', () {
    test('maps only waitlisted categories for athlete', () {
      final rows = <({
        String registrationId,
        Map<String, dynamic> inscription,
        Map<String, dynamic>? team,
      })>[
        (
          registrationId: 'reg-1',
          inscription: {
            'categoryId': 'Misto',
            'teamId': 't1',
            'waitlist': true,
          },
          team: {'player1Id': 'uid-a', 'player2Id': 'uid-b'},
        ),
        (
          registrationId: 'reg-2',
          inscription: {
            'categoryId': 'Masculino C',
            'teamId': 't2',
            'isPaid': true,
          },
          team: {'player1Id': 'uid-a', 'player2Id': 'uid-c'},
        ),
      ];

      expect(
        userWaitlistByCategoryData(rows, 'uid-a'),
        {'Misto': true},
      );
    });
  });

  group('userTeamIdsByCategoryData', () {
    final rows = <({
      String registrationId,
      Map<String, dynamic> inscription,
      Map<String, dynamic>? team,
    })>[
      (
        registrationId: 'reg-1',
        inscription: {'categoryId': 'Masculino C', 'teamId': 'team-1'},
        team: {'player1Id': 'uid-a', 'player2Id': 'uid-b'},
      ),
      (
        registrationId: 'reg-2',
        inscription: {'categoryId': 'Misto', 'teamId': 'team-2'},
        team: {'player1Id': 'uid-c', 'player2Id': 'uid-a'},
      ),
      (
        registrationId: 'reg-3',
        inscription: {'categoryId': 'Feminino C', 'teamId': 'team-3'},
        team: {'player1Id': 'uid-c', 'player2Id': 'uid-d'},
      ),
      (
        registrationId: 'reg-4',
        inscription: {'categoryId': 'Sem time', 'teamId': 'team-4'},
        team: null,
      ),
      (
        registrationId: 'reg-5',
        inscription: {'categoryId': '', 'teamId': 'team-5'},
        team: {'player1Id': 'uid-a', 'player2Id': 'uid-x'},
      ),
    ];

    test('maps categoryId to teamId for athlete teams', () {
      expect(
        userTeamIdsByCategoryData(rows, 'uid-a'),
        {
          'Masculino C': 'team-1',
          'Misto': 'team-2',
        },
      );
    });

    test('returns empty for unknown athlete', () {
      expect(userTeamIdsByCategoryData(rows, 'uid-zzz'), isEmpty);
    });
  });

  group('registeredCategoryIdsForUserData', () {
    final rows = <({Map<String, dynamic> inscription, Map<String, dynamic>? team})>[
      (
        inscription: {'categoryId': 'Masculino C', 'teamId': 't1'},
        team: {'player1Id': 'uid-a', 'player2Id': 'uid-b'},
      ),
      (
        inscription: {'categoryId': 'Misto', 'teamId': 't2'},
        team: {'player1Id': 'uid-c', 'player2Id': 'uid-a'},
      ),
      (
        inscription: {'categoryId': 'Feminino C', 'teamId': 't3'},
        team: {'player1Id': 'uid-c', 'player2Id': 'uid-d'},
      ),
      (
        inscription: {'categoryId': 'Sem time', 'teamId': 't4'},
        team: null,
      ),
      (
        inscription: {'categoryId': '', 'teamId': 't5'},
        team: {'player1Id': 'uid-a', 'player2Id': 'uid-x'},
      ),
    ];

    test('collects categories where uid is player1 or player2', () {
      expect(
        registeredCategoryIdsForUserData(rows, 'uid-a'),
        {'Masculino C', 'Misto'},
      );
    });

    test('returns empty for unknown athlete', () {
      expect(
        registeredCategoryIdsForUserData(rows, 'uid-zzz'),
        isEmpty,
      );
    });

    test('returns empty for blank uid', () {
      expect(
        registeredCategoryIdsForUserData(rows, '   '),
        isEmpty,
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
