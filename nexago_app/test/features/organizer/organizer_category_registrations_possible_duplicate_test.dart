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

/// "Possível duplicado" de ponta a ponta no app: os pares saem do mesmo
/// callable dos telefones e têm de chegar às linhas da categoria pela única
/// porta pública, `organizerCategoryRegistrationsProvider`.
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
  _FakeContactsService(this.pairs);

  final List<OrganizerTwinPair> pairs;
  final askedUids = <String>{};

  @override
  Future<OrganizerTournamentContacts> contactsForTournament(
    String tournamentId, {
    Iterable<String> uids = const [],
  }) async {
    askedUids.addAll(uids);
    return OrganizerTournamentContacts(twinPairs: pairs);
  }

  @override
  dynamic noSuchMethod(Invocation invocation) => throw UnimplementedError(
        '${invocation.memberName} não deveria ser chamado neste teste',
      );
}

void main() {
  const key = OrganizerCategoryKey(tournamentId: 't1', categoryId: 'open');

  OrganizerInscriptionWithTeam inscription(
    String registrationId,
    String teamId,
    String p1,
    String p2,
  ) {
    return (
      registrationId: registrationId,
      inscription: <String, dynamic>{'teamId': teamId, 'isPaid': true},
      team: <String, dynamic>{'player1Id': p1, 'player2Id': p2},
    );
  }

  final rows = [
    inscription('r1', 'team-1', 'joanaGoogle', 'bia'),
    inscription('r2', 'team-2', 'joanaEmail', 'carla'),
    inscription('r3', 'team-3', 'ana', 'duda'),
  ];

  const pair = OrganizerTwinPair(
    registrationA: 'r1',
    uidA: 'joanaGoogle',
    registrationB: 'r2',
    uidB: 'joanaEmail',
  );

  Future<List<OrganizerCategoryTeamRow>> readTeams(
    _FakeContactsService contacts, {
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
        organizerContactsServiceProvider.overrideWithValue(contacts),
      ],
    );
    addTearDown(container.dispose);
    container.listen(
      organizerCategoryRegistrationsProvider(key),
      (_, __) {},
      fireImmediately: true,
    );
    return container.read(organizerCategoryRegistrationsProvider(key).future);
  }

  test('marca as duas inscrições do par, e só elas', () async {
    final teams = await readTeams(_FakeContactsService(const [pair]));
    final flagged = {
      for (final t in teams)
        if (t.isPossibleDuplicate) t.registrationId,
    };

    expect(flagged, {'r1', 'r2'});
    expect(
      teams.firstWhere((t) => t.registrationId == 'r1').possibleDuplicateNote,
      startsWith(possibleDuplicateNoteText),
    );
  });

  // A dupla cabeça de chave é reconstruída por `applySeedOrder`: o aviso não
  // pode se perder no caminho, como já aconteceu com outros campos.
  test('o aviso sobrevive à ordenação por cabeça de chave', () async {
    final teams = await readTeams(
      _FakeContactsService(const [pair]),
      seeds: const ['team-2'],
    );

    expect(teams.first.registrationId, 'r2');
    expect(teams.first.seedRank, 1);
    expect(teams.first.isPossibleDuplicate, isTrue);
  });

  // Sem os uids da lista o serviço não sabe quando a busca ficou velha, e o
  // par da inscrição que acabou de entrar nunca chegaria.
  test('pede ao serviço os atletas da lista', () async {
    final contacts = _FakeContactsService(const []);
    await readTeams(contacts);

    expect(
      contacts.askedUids,
      {'joanaGoogle', 'bia', 'joanaEmail', 'carla', 'ana', 'duda'},
    );
  });
}
