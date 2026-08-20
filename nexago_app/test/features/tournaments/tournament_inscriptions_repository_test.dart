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

  // Categoria de EQUIPE (trio+): o doc de `teams` só tem dois slots fixos
  // (`player1Id`/`player2Id`); do terceiro integrante em diante o elenco mora em
  // `memberUids` no time e em `participantUids` na inscrição. Parar nos dois
  // slots deixava esse atleta invisível para o app inteiro — a tela de
  // inscrição oferecia criar a equipe DE NOVO, o selo "já inscrito" sumia e a
  // barra do torneio convidava a se inscrever numa vaga que já era dele.
  group('athleteIsInscriptionMember — elenco de equipe', () {
    final teamInscription = {
      'categoryId': 'Quarteto Misto',
      'teamId': 't1',
      'participantUids': ['uid-a', 'uid-b', 'uid-c'],
      'player1Id': 'uid-a',
    };
    final teamDoc = {
      'player1Id': 'uid-a',
      'player2Id': 'uid-b',
      'memberUids': ['uid-a', 'uid-b', 'uid-c'],
      'teamSize': 4,
    };

    test('capitão e segundo integrante entram pelos slots fixos', () {
      expect(
        athleteIsInscriptionMember(
          uid: 'uid-a',
          inscription: teamInscription,
          team: teamDoc,
        ),
        isTrue,
      );
      expect(
        athleteIsInscriptionMember(
          uid: 'uid-b',
          inscription: teamInscription,
          team: teamDoc,
        ),
        isTrue,
      );
    });

    test('terceiro integrante entra por memberUids/participantUids', () {
      expect(
        athleteIsInscriptionMember(
          uid: 'uid-c',
          inscription: teamInscription,
          team: teamDoc,
        ),
        isTrue,
      );
    });

    test('equipe sem memberUids ainda encontra pelo elenco da inscrição', () {
      expect(
        athleteIsInscriptionMember(
          uid: 'uid-c',
          inscription: teamInscription,
          team: const {'player1Id': 'uid-a', 'player2Id': 'uid-b'},
        ),
        isTrue,
      );
    });

    test('quem não está em lugar nenhum continua de fora', () {
      expect(
        athleteIsInscriptionMember(
          uid: 'uid-z',
          inscription: teamInscription,
          team: teamDoc,
        ),
        isFalse,
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

    test('maps categoryId to registration with paid flag for athlete teams', () {
      final rowsWithPaid = [
        ...rows,
        (
          registrationId: 'reg-3',
          inscription: {'categoryId': 'Feminino C', 'teamId': 't3', 'isPaid': true},
          team: {'player1Id': 'uid-a', 'player2Id': 'uid-d'},
        ),
        (
          registrationId: 'reg-4',
          inscription: {'categoryId': 'Open', 'teamId': 't4', 'isPaid': false},
          team: {'player1Id': 'uid-a', 'player2Id': 'uid-e'},
        ),
      ];
      expect(
        userRegistrationsByCategoryData(rows, 'uid-a'),
        {
          'Masculino C': const UserCategoryRegistration(
            registrationId: 'reg-1',
            isPaid: false,
          ),
          'Misto': const UserCategoryRegistration(
            registrationId: 'reg-2',
            isPaid: false,
          ),
        },
      );
      expect(
        userRegistrationsByCategoryData(rowsWithPaid, 'uid-a')['Feminino C'],
        const UserCategoryRegistration(registrationId: 'reg-3', isPaid: true),
      );
      // Paga e com dupla fechada: nada pendente.
      expect(
        userRegistrationsByCategoryData(rowsWithPaid, 'uid-a')['Feminino C']
            ?.isIncomplete,
        isFalse,
      );
      // Paga mas ainda sem parceiro (solo pagou o total) segue incompleta.
      expect(
        userRegistrationsByCategoryData([
          (
            registrationId: 'reg-5',
            inscription: {
              'categoryId': 'Open',
              'player1Id': 'uid-a',
              'participantUids': ['uid-a'],
              'isPaid': true,
              'partnerPending': true,
            },
            team: null,
          ),
        ], 'uid-a')['Open']?.isIncomplete,
        isTrue,
      );
      expect(
        userRegistrationsByCategoryData(rowsWithPaid, 'uid-a')['Open']?.isPaid,
        isFalse,
      );
    });

    test('includes solo pending registration without team', () {
      final soloRows = [
        (
          registrationId: 'solo-1',
          inscription: {
            'categoryId': 'Masculino C',
            'player1Id': 'uid-a',
            'participantUids': ['uid-a'],
            'partnerPending': true,
            'isPaid': false,
          },
          team: null,
        ),
      ];
      expect(
        userRegistrationsByCategoryData(soloRows, 'uid-a'),
        {
          'Masculino C': const UserCategoryRegistration(
            registrationId: 'solo-1',
            isPaid: false,
            partnerPending: true,
          ),
        },
      );
      // Reserva solo é inscrição INCOMPLETA: a tela precisa saber disso para
      // levar de volta ao convite em vez de mostrar "já inscrito" e parar.
      expect(
        userRegistrationsByCategoryData(soloRows, 'uid-a')['Masculino C']
            ?.isIncomplete,
        isTrue,
      );
      expect(
        registeredCategoryIdsForUserData(
          soloRows
              .map((r) => (inscription: r.inscription, team: r.team))
              .toList(),
          'uid-a',
        ),
        {'Masculino C'},
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

  group('userTeamIdsByCategoryData — elenco de equipe', () {
    // Sem o teamId o atleta perde o destaque das próprias partidas no torneio.
    test('terceiro integrante recebe o teamId da equipe', () {
      final rows = <({
        String registrationId,
        Map<String, dynamic> inscription,
        Map<String, dynamic>? team,
      })>[
        (
          registrationId: 'reg-1',
          inscription: {
            'categoryId': 'Quarteto Misto',
            'teamId': 't1',
            'participantUids': ['uid-a', 'uid-b', 'uid-c'],
          },
          team: {
            'player1Id': 'uid-a',
            'player2Id': 'uid-b',
            'memberUids': ['uid-a', 'uid-b', 'uid-c'],
          },
        ),
      ];

      expect(userTeamIdsByCategoryData(rows, 'uid-c'), {'Quarteto Misto': 't1'});
      expect(userTeamIdsByCategoryData(rows, 'uid-a'), {'Quarteto Misto': 't1'});
      expect(userTeamIdsByCategoryData(rows, 'uid-z'), isEmpty);
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
