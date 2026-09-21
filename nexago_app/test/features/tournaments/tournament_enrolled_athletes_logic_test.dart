import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/profiles/app_user_profile.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_discovery_models.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_enrolled_athletes_logic.dart';

void main() {
  group('isConfirmedTournamentInscription', () {
    test('aceita só inscrição paga, fora da fila e com elenco fechado', () {
      expect(
        isConfirmedTournamentInscription({
          'isPaid': true,
          'waitlist': false,
          'partnerPending': false,
        }),
        isTrue,
      );
      expect(
        isConfirmedTournamentInscription({'isPaid': true}),
        isTrue,
      );
    });

    test('recusa unpaid, waitlist e partnerPending', () {
      expect(
        isConfirmedTournamentInscription({'isPaid': false}),
        isFalse,
      );
      expect(
        isConfirmedTournamentInscription({
          'isPaid': true,
          'waitlist': true,
        }),
        isFalse,
      );
      expect(
        isConfirmedTournamentInscription({
          'isPaid': true,
          'partnerPending': true,
        }),
        isFalse,
      );
    });
  });

  group('inscriptionMemberUids', () {
    test('une participantUids com slots do time sem duplicar', () {
      expect(
        inscriptionMemberUids(
          inscription: {
            'participantUids': ['a', 'b', 'c'],
            'player1Id': 'a',
          },
          team: {
            'player1Id': 'a',
            'player2Id': 'b',
            'memberUids': ['c', 'd'],
          },
        ),
        ['a', 'b', 'c', 'd'],
      );
    });
  });

  group('buildTournamentEnrolledTeams', () {
    const categories = [
      TournamentCategoryOffer(id: 'fem-b', name: 'Feminino B', entryFee: 90),
      TournamentCategoryOffer(id: 'masc-a', name: 'Masculino A', entryFee: 90),
    ];

    test('lista uma equipe por inscrição confirmada e ignora waitlist', () {
      final teams = buildTournamentEnrolledTeams(
        rows: [
          (
            registrationId: 'r1',
            inscription: {
              'isPaid': true,
              'categoryId': 'fem-b',
              'teamId': 't1',
              'participantUids': ['u1', 'u2'],
            },
            team: null,
          ),
          (
            registrationId: 'r2',
            inscription: {
              'isPaid': true,
              'waitlist': true,
              'categoryId': 'masc-a',
              'participantUids': ['u3'],
            },
            team: null,
          ),
        ],
        profiles: {
          'u1': const AppUserProfile(uid: 'u1', fullName: 'Ana Paula'),
          'u2': const AppUserProfile(uid: 'u2', fullName: 'Beatriz Costa'),
        },
        categories: categories,
      );

      expect(teams, hasLength(1));
      expect(teams.single.displayName, 'Ana Paula / Beatriz Costa');
      expect(teams.single.categoryName, 'Feminino B');
      expect(teams.single.members.map((m) => m.uid), ['u1', 'u2']);
    });

    test('usa customTeamName quando existe', () {
      final teams = buildTournamentEnrolledTeams(
        rows: [
          (
            registrationId: 'r1',
            inscription: {
              'isPaid': true,
              'categoryId': 'fem-b',
              'customTeamName': 'As Leoas',
              'participantUids': ['u1', 'u2'],
            },
            team: null,
          ),
        ],
        profiles: {
          'u1': const AppUserProfile(uid: 'u1', fullName: 'Ana'),
          'u2': const AppUserProfile(uid: 'u2', fullName: 'Bia'),
        },
        categories: categories,
      );

      expect(teams.single.displayName, 'As Leoas');
    });

    test('nome do atleta fica em no máximo duas palavras', () {
      expect(enrolledAthleteDisplayName('Ana Paula Silva'), 'Ana Paula');
      expect(enrolledAthleteDisplayName('Bruno'), 'Bruno');
      expect(enrolledAthleteDisplayName('  Carol  Dias  Souza '), 'Carol Dias');

      final teams = buildTournamentEnrolledTeams(
        rows: [
          (
            registrationId: 'r1',
            inscription: {
              'isPaid': true,
              'categoryId': 'fem-b',
              'participantUids': ['u1', 'u2'],
            },
            team: null,
          ),
        ],
        profiles: {
          'u1': const AppUserProfile(uid: 'u1', fullName: 'Ana Paula Silva'),
          'u2': const AppUserProfile(
            uid: 'u2',
            fullName: 'Beatriz Costa Mendes',
          ),
        },
        categories: categories,
      );

      expect(teams.single.displayName, 'Ana Paula / Beatriz Costa');
      expect(teams.single.members.map((m) => m.name), [
        'Ana Paula',
        'Beatriz Costa',
      ]);
    });

    test('agrupa e filtra por categoria', () {
      const list = [
        TournamentEnrolledTeam(
          registrationId: 'r1',
          teamId: 't1',
          displayName: 'Ana / Bia',
          members: [],
          categoryId: 'fem-b',
          categoryName: 'Feminino B',
        ),
        TournamentEnrolledTeam(
          registrationId: 'r2',
          teamId: 't2',
          displayName: 'Carol / Dani',
          members: [],
          categoryId: 'fem-b',
          categoryName: 'Feminino B',
        ),
        TournamentEnrolledTeam(
          registrationId: 'r3',
          teamId: 't3',
          displayName: 'Edu / Fábio',
          members: [],
          categoryId: 'masc-a',
          categoryName: 'Masculino A',
        ),
      ];

      expect(filterEnrolledTeamsByCategory(list, 'masc-a'), hasLength(1));
      final groups = groupEnrolledTeamsByCategory(list);
      expect(groups, hasLength(2));
      expect(groups.first.categoryName, 'Feminino B');
      expect(groups.first.teams, hasLength(2));
      expect(groups.last.teams.single.displayName, 'Edu / Fábio');
    });
  });
}
