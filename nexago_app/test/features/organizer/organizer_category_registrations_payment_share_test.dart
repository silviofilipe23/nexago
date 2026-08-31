import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/profiles/app_user_profile.dart';
import 'package:nexago_app/features/organizer/data/organizer_category_ops_repository.dart';
import 'package:nexago_app/features/organizer/data/organizer_contacts_service.dart';
import 'package:nexago_app/features/organizer/data/organizer_user_profiles_repository.dart';
import 'package:nexago_app/features/organizer/domain/category_ops/category_ops_logic.dart';
import 'package:nexago_app/features/organizer/domain/category_ops/category_ops_models.dart';
import 'package:nexago_app/features/organizer/domain/tournament_ops/tournament_ops_providers.dart';
import 'package:nexago_app/features/tournaments/data/tournament_inscriptions_repository.dart';

/// Leitura dos campos de pagamento por atleta no doc de inscrição
/// (`sharePaidUids`, `organizerConfirmedShareUids`, `declaredPaidAt`,
/// `paymentVerifiedByOrganizer`). O parser (`_uidList`) é privado, então o
/// contrato é exercitado pela única porta pública:
/// `organizerCategoryRegistrationsProvider`.
class _FakeInscriptionsRepository implements TournamentInscriptionsRepository {
  _FakeInscriptionsRepository(this.rows);

  final List<OrganizerInscriptionWithTeam> rows;

  @override
  Stream<List<OrganizerInscriptionWithTeam>> watchByTournamentAndCategory({
    required String tournamentId,
    required String categoryId,
  }) {
    return Stream.value(rows);
  }

  @override
  dynamic noSuchMethod(Invocation invocation) => throw UnimplementedError(
        '${invocation.memberName} não deveria ser chamado neste teste',
      );
}

class _FakeProfilesRepository implements OrganizerUserProfilesRepository {
  @override
  Future<Map<String, AppUserProfile>> batchGetProfiles(
    Iterable<String> uids,
  ) async {
    return const {};
  }

  @override
  dynamic noSuchMethod(Invocation invocation) => throw UnimplementedError(
        '${invocation.memberName} não deveria ser chamado neste teste',
      );
}

class _FakeCategoryOpsRepository implements OrganizerCategoryOpsRepository {
  _FakeCategoryOpsRepository({this.seeds = const []});

  final List<String> seeds;

  @override
  Future<Map<String, dynamic>?> getCategory({
    required String tournamentId,
    required String categoryId,
  }) async {
    return {'entryFeeCents': 10000};
  }

  @override
  Future<CategoryOpsState> getCategoryOps({
    required String tournamentId,
    required String categoryId,
  }) async {
    return CategoryOpsState(seeds: seeds);
  }

  @override
  dynamic noSuchMethod(Invocation invocation) => throw UnimplementedError(
        '${invocation.memberName} não deveria ser chamado neste teste',
      );
}

class _FakeContactsService implements OrganizerContactsService {
  @override
  Future<Map<String, String>> phonesForTournament(String tournamentId) async {
    return const {};
  }

  @override
  dynamic noSuchMethod(Invocation invocation) => throw UnimplementedError(
        '${invocation.memberName} não deveria ser chamado neste teste',
      );
}

void main() {
  const key = OrganizerCategoryKey(tournamentId: 't1', categoryId: 'open');

  OrganizerInscriptionWithTeam inscription({
    String registrationId = 'reg-1',
    String teamId = 'team-1',
    bool isPaid = false,
    Map<String, dynamic> extra = const {},
  }) {
    return (
      registrationId: registrationId,
      inscription: <String, dynamic>{
        'teamId': teamId,
        'isPaid': isPaid,
        'paymentMethod': 'organizer_direct',
        ...extra,
      },
      team: <String, dynamic>{'player1Id': 'p1', 'player2Id': 'p2'},
    );
  }

  Future<List<OrganizerCategoryTeamRow>> readTeams(
    List<OrganizerInscriptionWithTeam> rows, {
    List<String> seeds = const [],
  }) async {
    final container = ProviderContainer(
      overrides: [
        tournamentInscriptionsRepositoryProvider
            .overrideWithValue(_FakeInscriptionsRepository(rows)),
        organizerUserProfilesRepositoryProvider
            .overrideWithValue(_FakeProfilesRepository()),
        organizerCategoryOpsRepositoryProvider
            .overrideWithValue(_FakeCategoryOpsRepository(seeds: seeds)),
        organizerContactsServiceProvider
            .overrideWithValue(_FakeContactsService()),
      ],
    );
    addTearDown(container.dispose);
    // autoDispose: mantém o provider vivo até o final da leitura.
    container.listen(
      organizerCategoryRegistrationsProvider(key),
      (_, __) {},
      fireImmediately: true,
    );
    return container.read(organizerCategoryRegistrationsProvider(key).future);
  }

  group('parse dos campos de pagamento por atleta', () {
    test('sharePaidUids e organizerConfirmedShareUids viram listas de uid',
        () async {
      final teams = await readTeams([
        inscription(extra: {
          'sharePaidUids': ['p1', 'p2'],
          'organizerConfirmedShareUids': ['p1'],
        }),
      ]);

      expect(teams.single.sharePaidUids, ['p1', 'p2']);
      expect(teams.single.organizerConfirmedShareUids, ['p1']);
    });

    test('lixo na lista é descartado e o uid é aparado', () async {
      final teams = await readTeams([
        inscription(extra: {
          'sharePaidUids': [' p1 ', '', '   ', 42, null, 'p2'],
        }),
      ]);

      expect(teams.single.sharePaidUids, ['p1', 'p2']);
    });

    test('campo ausente (inscrição antiga) vira lista vazia', () async {
      final teams = await readTeams([inscription()]);

      expect(teams.single.sharePaidUids, isEmpty);
      expect(teams.single.organizerConfirmedShareUids, isEmpty);
      expect(teamHasPartialPayment(teams.single), isFalse);
    });

    test('campo que não é lista vira lista vazia', () async {
      final teams = await readTeams([
        inscription(extra: {
          'sharePaidUids': 'p1',
          'organizerConfirmedShareUids': {'p1': true},
        }),
      ]);

      expect(teams.single.sharePaidUids, isEmpty);
      expect(teams.single.organizerConfirmedShareUids, isEmpty);
    });

    test('declaredPaidAt (Timestamp) vira DateTime', () async {
      final teams = await readTeams([
        inscription(
          isPaid: true,
          extra: {
            'declaredPaidAt': Timestamp.fromDate(DateTime(2026, 8, 20, 10, 30)),
          },
        ),
      ]);

      expect(teams.single.declaredPaidAt, DateTime(2026, 8, 20, 10, 30));
      expect(teams.single.paymentVerifiedByOrganizer, isFalse);
      expect(teamAwaitsPaymentVerification(teams.single), isTrue);
      expect(isTeamPaymentSettled(teams.single), isFalse);
    });

    test(
      'declaredPaidAt de tipo inesperado vira null sem derrubar o mapper da '
      'categoria inteira (um doc torto não pode apagar a lista de inscrições)',
      () async {
        for (final garbage in <Object>[
          '2026-08-20',
          1755648000,
          true,
          <String, dynamic>{'seconds': 1},
          <int>[1],
        ]) {
          final teams = await readTeams([
            inscription(isPaid: true, extra: {'declaredPaidAt': garbage}),
          ]);

          expect(teams, hasLength(1), reason: 'lixo: $garbage');
          expect(teams.single.declaredPaidAt, isNull, reason: 'lixo: $garbage');
          expect(teamAwaitsPaymentVerification(teams.single), isFalse);
          // A linha continua utilizável: nome, status e pagamento intactos.
          expect(teams.single.registrationId, 'reg-1');
          expect(
            teams.single.status,
            OrganizerTeamRegistrationStatus.confirmed,
          );
        }
      },
    );

    test('declaredPaidAt nulo explícito também vira null', () async {
      final teams = await readTeams([
        inscription(isPaid: true, extra: {'declaredPaidAt': null}),
      ]);

      expect(teams.single.declaredPaidAt, isNull);
      expect(isTeamPaymentSettled(teams.single), isTrue);
    });

    test('declaração já conferida sai da fila de conferência', () async {
      final teams = await readTeams([
        inscription(
          isPaid: true,
          extra: {
            'declaredPaidAt': Timestamp.fromDate(DateTime(2026, 8, 20)),
            'paymentVerifiedByOrganizer': true,
          },
        ),
      ]);

      expect(teamAwaitsPaymentVerification(teams.single), isFalse);
      expect(isTeamPaymentSettled(teams.single), isTrue);
    });

    test(
      'inscrição direta paga SEM declaredPaidAt (anterior ao fluxo) não vira '
      'conferência retroativa',
      () async {
        final teams = await readTeams([inscription(isPaid: true)]);

        expect(teams.single.declaredPaidAt, isNull);
        expect(teamAwaitsPaymentVerification(teams.single), isFalse);
        expect(isTeamPaymentSettled(teams.single), isTrue);
        expect(showsAthletePaymentBreakdown(teams.single), isFalse);
      },
    );

    test('pagamento parcial chega inteiro na tela do organizador', () async {
      final teams = await readTeams([
        inscription(extra: {
          'sharePaidUids': ['p1'],
          'organizerConfirmedShareUids': ['p1'],
        }),
      ]);

      final team = teams.single;
      expect(teamHasPartialPayment(team), isTrue);
      expect(showsAthletePaymentBreakdown(team), isTrue);
      expect(
        athletePaymentState(team, 'p1'),
        OrganizerAthletePaymentState.organizerConfirmed,
      );
      expect(
        athletePaymentState(team, 'p2'),
        OrganizerAthletePaymentState.pending,
      );
    });

    test('dupla cabeça de chave não perde o pagamento por atleta', () async {
      final teams = await readTeams(
        [
          inscription(extra: {
            'sharePaidUids': ['p1'],
            'organizerConfirmedShareUids': ['p1'],
          }),
        ],
        seeds: ['team-1'],
      );

      expect(teams.single.seedRank, 1);
      expect(teams.single.sharePaidUids, ['p1']);
      expect(teams.single.organizerConfirmedShareUids, ['p1']);
      expect(teamHasPartialPayment(teams.single), isTrue);
    });
  });
}
