import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/profiles/app_user_profile.dart';
import 'package:nexago_app/features/organizer/data/organizer_category_ops_repository.dart';
import 'package:nexago_app/features/organizer/data/organizer_contacts_service.dart';
import 'package:nexago_app/features/organizer/data/organizer_user_profiles_repository.dart';
import 'package:nexago_app/features/organizer/domain/category_ops/category_ops_models.dart';
import 'package:nexago_app/features/organizer/domain/tournament_ops/tournament_ops_providers.dart';
import 'package:nexago_app/features/tournaments/data/tournament_inscriptions_repository.dart';

/// Leitura do pedido de cancelamento do doc de inscrição. O parser é privado
/// (`_pendingCancellationReason`), então o contrato é exercitado pela única
/// porta pública: `organizerCategoryRegistrationsProvider`.
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
    Object? cancellationRequest,
    bool includeCancellationField = true,
  }) {
    return (
      registrationId: registrationId,
      inscription: <String, dynamic>{
        'teamId': teamId,
        'isPaid': true,
        'paidAmount': 100,
        'paymentMethod': 'pix',
        if (includeCancellationField) 'cancellationRequest': cancellationRequest,
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

  group('pending cancellation request parsing', () {
    test('pending request exposes the athlete reason', () async {
      final teams = await readTeams([
        inscription(
          cancellationRequest: {
            'status': 'pending',
            'reason': 'Lesão no joelho',
          },
        ),
      ]);

      expect(teams.single.cancellationRequestReason, 'Lesão no joelho');
      expect(teams.single.hasCancellationRequest, isTrue);
    });

    test('legacy doc without the field has no request', () async {
      final teams = await readTeams([
        inscription(includeCancellationField: false),
      ]);

      expect(teams.single.cancellationRequestReason, isNull);
      expect(teams.single.hasCancellationRequest, isFalse);
    });

    test('declined request no longer shows as pending', () async {
      final teams = await readTeams([
        inscription(
          cancellationRequest: {
            'status': 'declined',
            'reason': 'Lesão no joelho',
          },
        ),
      ]);

      expect(teams.single.hasCancellationRequest, isFalse);
    });

    test('approved request no longer shows as pending', () async {
      final teams = await readTeams([
        inscription(
          cancellationRequest: {'status': 'approved', 'reason': 'Vou viajar'},
        ),
      ]);

      expect(teams.single.hasCancellationRequest, isFalse);
    });

    test('request without status is ignored', () async {
      final teams = await readTeams([
        inscription(cancellationRequest: {'reason': 'Vou viajar'}),
      ]);

      expect(teams.single.hasCancellationRequest, isFalse);
    });

    test('non-map garbage in the field is ignored', () async {
      final teams = await readTeams([
        inscription(cancellationRequest: 'pending'),
      ]);

      expect(teams.single.hasCancellationRequest, isFalse);
    });

    test('null field is ignored', () async {
      final teams = await readTeams([inscription(cancellationRequest: null)]);

      expect(teams.single.hasCancellationRequest, isFalse);
    });

    test('pending without reason still flags the request', () async {
      final teams = await readTeams([
        inscription(cancellationRequest: {'status': 'pending'}),
      ]);

      expect(teams.single.cancellationRequestReason, '');
      expect(teams.single.hasCancellationRequest, isTrue);
    });

    test('pending with non-string reason still flags the request', () async {
      final teams = await readTeams([
        inscription(cancellationRequest: {'status': 'pending', 'reason': 42}),
      ]);

      expect(teams.single.cancellationRequestReason, '');
      expect(teams.single.hasCancellationRequest, isTrue);
    });

    test('only the requesting team is flagged', () async {
      final teams = await readTeams([
        inscription(
          registrationId: 'reg-1',
          teamId: 'team-1',
          cancellationRequest: {'status': 'pending', 'reason': 'Lesão'},
        ),
        inscription(
          registrationId: 'reg-2',
          teamId: 'team-2',
          includeCancellationField: false,
        ),
      ]);

      expect(teams, hasLength(2));
      expect(
        {
          for (final t in teams) t.teamId: t.hasCancellationRequest,
        },
        {'team-1': true, 'team-2': false},
      );
    });

    test(
      'seeded team keeps the cancellation request',
      () async {
        final teams = await readTeams(
          [
            inscription(
              teamId: 'team-1',
              cancellationRequest: {'status': 'pending', 'reason': 'Lesão'},
            ),
          ],
          seeds: ['team-1'],
        );

        expect(teams.single.seedRank, 1);
        expect(teams.single.cancellationRequestReason, 'Lesão');
      },
    );
  });
}
