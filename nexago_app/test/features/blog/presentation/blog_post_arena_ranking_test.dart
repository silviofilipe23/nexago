import 'package:firebase_auth_mocks/firebase_auth_mocks.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:nexago_app/core/auth/auth_providers.dart';
import 'package:nexago_app/core/router/routes.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/features/arenas/domain/arena_list_item.dart';
import 'package:nexago_app/features/arenas/domain/arena_slot.dart';
import 'package:nexago_app/features/arenas/domain/arenas_providers.dart';
import 'package:nexago_app/features/blog/application/blog_embed_providers.dart';
import 'package:nexago_app/features/blog/application/blog_providers.dart';
import 'package:nexago_app/features/blog/domain/blog_embed_logic.dart';
import 'package:nexago_app/features/blog/domain/blog_post.dart';
import 'package:nexago_app/features/blog/presentation/blog_post_page.dart';
import 'package:nexago_app/features/ranking/domain/ranking_list_models.dart';
import 'package:nexago_app/features/ranking/domain/ranking_providers.dart';

import '../fake_blog_repository.dart';

const _ranking = BlogRankingEmbed(
  sport: 'beachVolleyball',
  mode: BlogRankingMode.athletes,
  gender: BlogRankingGender.feminino,
);

BlogPost _post(List<BlogBlock> body) => BlogPost(
  id: 'p1',
  title: 'Onde jogar em Goiânia',
  category: BlogCategory.arenas,
  readMinutes: 3,
  body: [const BlogParagraph('Abertura.'), ...body],
);

const _arena = ArenaListItem(
  id: 'a1',
  name: 'Arena Errejota',
  locationLabel: 'Setor Bueno, Goiânia',
  pricePerHourReais: 120,
  courtTypes: ['beachVolleyball'],
);

ArenaSlot _slot(String start) => ArenaSlot(
  id: 's-$start',
  arenaId: 'a1',
  courtId: 'q1',
  date: DateTime(2026, 11, 5),
  startTime: start,
  endTime: start,
  rawStatus: 'available',
);

RankingListEntry _entry(int rank, String name, int points) => RankingListEntry(
  rank: rank,
  points: points,
  tournamentsCount: 2,
  displayName: name,
  subtitle: '',
  isCurrentUser: false,
  initials: name.substring(0, 1),
);

Future<GoRouter> _pump(
  WidgetTester tester, {
  required List<BlogBlock> body,
  Map<String, ArenaListItem?> arenas = const {'a1': _arena},
  List<BlogArenaFreeTime> times = const [],
  List<RankingListEntry> ranking = const [],
}) async {
  tester.view.physicalSize = const Size(390 * 3, 844 * 3);
  tester.view.devicePixelRatio = 3;
  addTearDown(tester.view.reset);
  final router = GoRouter(
    routes: [
      GoRoute(
        path: '/',
        builder: (context, state) => const Scaffold(body: Text('Início')),
      ),
      GoRoute(
        path: AppRoutes.blogPost,
        name: AppRouteNames.blogPost,
        builder: (context, state) =>
            BlogPostPage(postId: state.pathParameters['postId'] ?? ''),
      ),
      GoRoute(
        path: AppRoutes.arenaSlots,
        name: AppRouteNames.arenaSlots,
        builder: (context, state) => Scaffold(
          body: Text(
            'Reserva ${state.pathParameters['arenaId']} '
            '${state.uri.queryParameters['startTime'] ?? '-'}',
          ),
        ),
      ),
      GoRoute(
        path: AppRoutes.arenaDetail,
        name: AppRouteNames.arenaDetail,
        builder: (context, state) =>
            Scaffold(body: Text('Arena ${state.pathParameters['arenaId']}')),
      ),
      GoRoute(
        path: AppRoutes.athleteRanking,
        name: AppRouteNames.athleteRanking,
        builder: (context, state) => Consumer(
          builder: (context, ref, _) {
            final f = ref.watch(rankingPageFilterProvider);
            return Scaffold(
              body: Text(
                'Ranking ${f.sport} ${f.mode.name} ${f.gender.name} ${f.year}',
              ),
            );
          },
        ),
      ),
    ],
  );
  addTearDown(router.dispose);
  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        authProvider.overrideWith((ref) => Stream.value(MockUser(uid: 'u1'))),
        blogRepositoryProvider.overrideWithValue(
          FakeBlogRepository([_post(body)]),
        ),
        arenaByIdProvider.overrideWith((ref, id) => Stream.value(arenas[id])),
        blogArenaFreeTimesProvider.overrideWith((ref, id) async => times),
        blogRankingTopProvider.overrideWith((ref, block) async => ranking),
        rankingSeasonYearProvider.overrideWithValue(2026),
      ],
      child: MaterialApp.router(theme: AppTheme.dark, routerConfig: router),
    ),
  );
  router.push('/athlete/blog/p1');
  await _settle(tester);
  return router;
}

Future<void> _settle(WidgetTester tester) async {
  for (var i = 0; i < 8; i++) {
    await tester.pump(const Duration(milliseconds: 100));
  }
}

Future<void> _scrollTo(WidgetTester tester, Finder finder) => tester
    .scrollUntilVisible(finder, 300, scrollable: find.byType(Scrollable).first);

void main() {
  testWidgets('arena: dados, horários de hoje e o horário abre a reserva', (
    tester,
  ) async {
    await _pump(
      tester,
      body: const [BlogArenaEmbed('a1')],
      times: [
        BlogArenaFreeTime(slot: _slot('18:00')),
        BlogArenaFreeTime(slot: _slot('19:30')),
      ],
    );

    await _scrollTo(tester, find.byKey(const Key('blog-arena-book-a1')));
    expect(find.text('Arena Errejota'), findsOneWidget);
    expect(find.text('Setor Bueno, Goiânia'), findsOneWidget);
    expect(find.text('HORÁRIOS LIVRES HOJE'), findsOneWidget);
    expect(find.text('18h'), findsOneWidget);
    expect(find.text('19:30'), findsOneWidget);

    await tester.tap(find.byKey(const Key('blog-arena-time-18:00')));
    await _settle(tester);
    expect(find.text('Reserva a1 18:00'), findsOneWidget);
  });

  testWidgets('arena sem horário hoje: aviso; Reservar abre a grade', (
    tester,
  ) async {
    await _pump(tester, body: const [BlogArenaEmbed('a1')]);

    await _scrollTo(tester, find.byKey(const Key('blog-arena-book-a1')));
    expect(find.text('Sem horário livre hoje'), findsOneWidget);

    await tester.tap(find.byKey(const Key('blog-arena-book-a1')));
    await _settle(tester);
    expect(find.text('Reserva a1 -'), findsOneWidget);
  });

  testWidgets('arena de pré-cadastro: sem horários, "Ver arena"', (
    tester,
  ) async {
    await _pump(
      tester,
      body: const [BlogArenaEmbed('a1')],
      arenas: const {
        'a1': ArenaListItem(
          id: 'a1',
          name: 'Arena Nova',
          locationLabel: 'Goiânia',
          pricePerHourReais: 0,
          isUnclaimed: true,
        ),
      },
    );

    await _scrollTo(tester, find.byKey(const Key('blog-arena-open-a1')));
    expect(find.byKey(const Key('blog-arena-book-a1')), findsNothing);
    expect(find.text('HORÁRIOS LIVRES HOJE'), findsNothing);

    await tester.tap(find.byKey(const Key('blog-arena-open-a1')));
    await _settle(tester);
    expect(find.text('Arena a1'), findsOneWidget);
  });

  testWidgets('arena que não existe: o bloco some', (tester) async {
    await _pump(
      tester,
      body: const [BlogArenaEmbed('sumiu')],
      arenas: const {},
    );

    await _scrollTo(tester, find.byKey(const Key('blog-helpful')));
    expect(find.byKey(const Key('blog-arena-sumiu')), findsNothing);
  });

  testWidgets('ranking: top 5 e o ranking completo no mesmo recorte', (
    tester,
  ) async {
    await _pump(
      tester,
      body: const [_ranking],
      ranking: [
        _entry(1, 'Ana Lima', 820),
        _entry(2, 'Bia Souza', 760),
        _entry(3, 'Carla Dias', 700),
        _entry(4, 'Duda Reis', 640),
        _entry(5, 'Eva Melo', 600),
      ],
    );

    await _scrollTo(tester, find.byKey(const Key('blog-ranking-open')));
    expect(find.text('RANKING · TEMPORADA 2026'), findsOneWidget);
    expect(find.text('Top 5 · Vôlei de praia'), findsOneWidget);
    expect(find.text('Atletas · Feminino'), findsOneWidget);
    expect(find.text('Ana Lima'), findsOneWidget);
    expect(find.text('820 pts'), findsOneWidget);
    expect(find.text('Eva Melo'), findsOneWidget);

    await tester.tap(find.byKey(const Key('blog-ranking-open')));
    await _settle(tester);
    expect(
      find.text('Ranking VOLEI_PRAIA athletes female 2026'),
      findsOneWidget,
    );
  });

  testWidgets('ranking vazio: o bloco some', (tester) async {
    await _pump(tester, body: const [_ranking]);

    await _scrollTo(tester, find.byKey(const Key('blog-helpful')));
    expect(find.byKey(const Key('blog-ranking-open')), findsNothing);
  });
}
