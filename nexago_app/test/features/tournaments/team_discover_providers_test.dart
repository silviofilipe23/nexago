// Testes do notifier [TeamDiscoverNotifier] (Descobrir › Duplas).
//
// Não há `fake_cloud_firestore` neste projeto. [TeamDiscoverRepository] grava
// `CollectionReference`s já no construtor, então a subclasse de teste precisa
// de um `FirebaseFirestore` que não lance nessa chamada — daí o `noSuchMethod`
// abaixo, o mesmo "fake" mínimo de `athlete_discover_providers_test.dart`.
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/auth/auth_providers.dart';
import 'package:nexago_app/features/athlete/domain/athlete_profile_providers.dart';
import 'package:nexago_app/features/ranking/data/ranking_repository.dart';
import 'package:nexago_app/features/tournaments/data/team_discover_repository.dart';
import 'package:nexago_app/features/tournaments/domain/team_discover_logic.dart';
import 'package:nexago_app/features/tournaments/domain/team_discover_models.dart';
import 'package:nexago_app/features/tournaments/domain/team_discover_providers.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_team.dart';

// ignore: subtype_of_sealed_class
class _NoopCollectionRef implements CollectionReference<Map<String, dynamic>> {
  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class _NoopFirestore implements FirebaseFirestore {
  @override
  CollectionReference<Map<String, dynamic>> collection(String path) =>
      _NoopCollectionRef();

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

/// `build()` dispara `loadInitial` num microtask; espera esse boot assentar
/// antes de dirigir o notifier.
Future<void> _settle() => Future<void>.delayed(Duration.zero);

TournamentTeam _team(String id, {String? name}) => TournamentTeam(
      id: id,
      player1Id: '$id-a',
      player2Id: '$id-b',
      teamName: name ?? 'Dupla $id',
      registrationPaid: true,
    );

/// Repositório de teste: duas páginas por modo de paginação. A segunda é
/// devolvida quando o notifier repassa o cursor da primeira (`loadMore`).
class _FakeTeamDiscoverRepository extends TeamDiscoverRepository {
  _FakeTeamDiscoverRepository()
      : super(
          firestore: _NoopFirestore(),
          rankingRepository: RankingRepository(_NoopFirestore()),
        );

  /// [fetchPage]: ordem do servidor, por id do documento.
  List<TournamentTeam> firstPage = const [];
  List<TournamentTeam> nextPage = const [];

  /// [fetchRankedPage]: já na ordem do ranking.
  List<TournamentTeam> firstRankedPage = const [];
  List<TournamentTeam> nextRankedPage = const [];

  /// Posição/pontos/torneios por equipe — o que o enrich real tira do ranking.
  Map<String, TeamDiscoverRankingSnapshot> rankingById = const {};

  @override
  Future<TeamDiscoverPageResult> fetchPage({
    String? startAfterDocumentId,
    int limit = TeamDiscoverRepository.pageSize,
  }) async {
    if (startAfterDocumentId == 'cursor-1') {
      return TeamDiscoverPageResult(
        teams: nextPage,
        lastDocumentId: 'cursor-2',
        hasMore: false,
      );
    }
    return TeamDiscoverPageResult(
      teams: firstPage,
      lastDocumentId: 'cursor-1',
      hasMore: true,
    );
  }

  @override
  Future<TeamDiscoverRankedPage> fetchRankedPage({
    int rankedOffset = 0,
    String? startAfterDocumentId,
    int limit = TeamDiscoverRepository.pageSize,
  }) async {
    if (startAfterDocumentId == 'ranked-1') {
      return TeamDiscoverRankedPage(
        teams: nextRankedPage,
        nextRankedOffset: rankedOffset,
        lastDocumentId: 'ranked-2',
        hasMore: false,
      );
    }
    return TeamDiscoverRankedPage(
      teams: firstRankedPage,
      nextRankedOffset: 0,
      lastDocumentId: 'ranked-1',
      hasMore: true,
    );
  }

  @override
  Future<List<TeamDiscoverEntry>> enrichEntries({
    required List<TournamentTeam> teams,
    required String? currentUserId,
    Set<String> followingTeamIds = const {},
  }) async {
    return [
      for (final t in teams)
        buildTeamDiscoverEntry(
          team: t,
          ranking: rankingById[t.id] ?? const TeamDiscoverRankingSnapshot(),
        ),
    ];
  }

  @override
  Future<int?> viewerTeamPoints(String? currentUserId) async => null;
}

void main() {
  late _FakeTeamDiscoverRepository repo;
  late ProviderContainer container;

  setUp(() {
    repo = _FakeTeamDiscoverRepository();
    container = ProviderContainer(
      overrides: [
        teamDiscoverRepositoryProvider.overrideWithValue(repo),
        authProvider.overrideWith((ref) => Stream.value(null)),
        athleteProfileProvider.overrideWith((ref) => Stream.value(null)),
      ],
    );
    // AutoDispose: sem ouvinte o notifier morre entre os `await`s.
    container.listen(teamDiscoverProvider, (_, __) {});
    addTearDown(container.dispose);
  });

  List<String> displayedIds() => container
      .read(teamDiscoverProvider)
      .displayEntries
      .map((e) => e.teamId)
      .toList();

  group('paginação (loadMore)', () {
    // O Firestore pagina por id do documento; "Mais próximas" e "Em alta"
    // ordenam no cliente. Reordenar o lote inteiro a cada página espalhava as
    // equipes novas acima do scroll e a lista "pulava" para cima.
    test(
      'Mais próximas: página nova entra DEPOIS do que já está na tela',
      () async {
        // Sem perfil do viewer a proximidade empata e decide o nome.
        repo.firstPage = [
          _team('t1', name: 'Bruno e Caio'),
          _team('t2', name: 'Daniel e Enzo'),
        ];
        repo.nextPage = [
          _team('t3', name: 'Carla e Duda'),
          _team('t4', name: 'Ana e Bia'),
        ];

        final notifier = container.read(teamDiscoverProvider.notifier);
        await _settle();
        await notifier.setSort(TeamDiscoverSort.proximity);
        expect(displayedIds(), ['t1', 't2']);

        await notifier.loadMore();

        expect(
          displayedIds(),
          ['t1', 't2', 't4', 't3'],
          reason: 'o que já estava na tela fica no lugar; a página nova é '
              'ordenada entre si e vai para o fim',
        );
        final state = container.read(teamDiscoverProvider);
        expect(state.rawEntries, hasLength(4));
        expect(state.hasMore, isFalse);
        expect(state.isLoadingMore, isFalse);
      },
    );

    test(
      'Em alta: equipe nova com mais torneios não fura a fila de quem já '
      'está na tela',
      () async {
        repo.firstPage = [_team('t1'), _team('t2')];
        repo.nextPage = [_team('t3'), _team('t4')];
        repo.rankingById = const {
          't1': TeamDiscoverRankingSnapshot(tournamentsCount: 5),
          't2': TeamDiscoverRankingSnapshot(tournamentsCount: 3),
          't3': TeamDiscoverRankingSnapshot(tournamentsCount: 1),
          't4': TeamDiscoverRankingSnapshot(tournamentsCount: 9),
        };

        final notifier = container.read(teamDiscoverProvider.notifier);
        await _settle();
        await notifier.setSort(TeamDiscoverSort.trending);
        expect(displayedIds(), ['t1', 't2']);

        await notifier.loadMore();

        expect(displayedIds(), ['t1', 't2', 't4', 't3']);
      },
    );

    test(
      'Ranking: páginas já vêm na ordem do ranking e continuam nela',
      () async {
        repo.firstRankedPage = [_team('r1'), _team('r2')];
        repo.nextRankedPage = [_team('r3'), _team('r4')];
        repo.rankingById = const {
          'r1': TeamDiscoverRankingSnapshot(rank: 1, points: 900),
          'r2': TeamDiscoverRankingSnapshot(rank: 2, points: 700),
          'r3': TeamDiscoverRankingSnapshot(rank: 3, points: 500),
          // r4 não tem pontos: fase 2 do ranking, sempre no fim.
        };

        final notifier = container.read(teamDiscoverProvider.notifier);
        await _settle();
        await notifier.loadInitial();
        expect(displayedIds(), ['r1', 'r2']);

        await notifier.loadMore();

        expect(displayedIds(), ['r1', 'r2', 'r3', 'r4']);
      },
    );

    test(
      'Ranking: equipes sem pontos não trocam de lugar quando chega página '
      '— o sort do Dart não é estável acima de 32 itens',
      () async {
        // Fase 2 do ranking: todas sem posição e sem pontos, empatadas na
        // ordenação. Reordenar as 60 juntas embaralhava as já exibidas.
        repo.firstRankedPage = [
          for (var i = 0; i < 30; i++)
            _team('a${i.toString().padLeft(2, '0')}'),
        ];
        repo.nextRankedPage = [
          for (var i = 0; i < 30; i++)
            _team('b${i.toString().padLeft(2, '0')}'),
        ];

        final notifier = container.read(teamDiscoverProvider.notifier);
        await _settle();
        await notifier.loadInitial();
        final before = displayedIds();
        expect(before, [for (final t in repo.firstRankedPage) t.id]);

        await notifier.loadMore();

        final after = displayedIds();
        expect(after, hasLength(60));
        expect(after.take(30), before);
      },
    );
  });
}
