import 'package:firebase_auth_mocks/firebase_auth_mocks.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:nexago_app/core/auth/auth_providers.dart';
import 'package:nexago_app/core/router/routes.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/features/blog/application/blog_providers.dart';
import 'package:nexago_app/features/blog/domain/blog_library.dart';
import 'package:nexago_app/features/blog/domain/blog_post.dart';
import 'package:nexago_app/features/blog/presentation/blog_feed_page.dart';
import 'package:nexago_app/features/blog/presentation/blog_library_page.dart';

import '../fake_blog_repository.dart';

final _posts = [
  BlogPost(
    id: 'toalha',
    title: 'Chegou a Toalha nexaGO com o seu nome',
    category: BlogCategory.loja,
    publishAt: DateTime(2026, 11, 4),
    readMinutes: 2,
    authorName: 'Equipe nexaGO',
  ),
  BlogPost(
    id: 'liga',
    title: 'Liga nexaGO: tudo sobre a 2ª etapa',
    category: BlogCategory.torneios,
    featured: true,
    publishAt: DateTime(2026, 10, 28),
    readMinutes: 4,
    authorName: 'Marcelo R.',
  ),
  BlogPost(
    id: 'saque',
    title: '5 exercícios para melhorar o saque',
    category: BlogCategory.treino,
    tags: const ['fundamentos'],
    publishAt: DateTime(2026, 10, 10),
    readMinutes: 5,
  ),
];

Future<FakeBlogRepository> _pump(
  WidgetTester tester, {
  required String route,
  Map<String, BlogLibraryEntry>? library,
}) async {
  tester.view.physicalSize = const Size(390 * 3, 844 * 3);
  tester.view.devicePixelRatio = 3;
  addTearDown(tester.view.reset);
  final repo = FakeBlogRepository(_posts, library: library);
  final router = GoRouter(
    routes: [
      GoRoute(
        path: '/',
        builder: (context, state) => const Scaffold(body: Text('Início')),
      ),
      GoRoute(
        path: AppRoutes.blog,
        name: AppRouteNames.blog,
        builder: (context, state) => const BlogFeedPage(),
      ),
      GoRoute(
        path: AppRoutes.blogSaved,
        name: AppRouteNames.blogSaved,
        builder: (context, state) => const BlogLibraryPage(),
      ),
      GoRoute(
        path: AppRoutes.blogPost,
        name: AppRouteNames.blogPost,
        builder: (context, state) =>
            Scaffold(body: Text('Post ${state.pathParameters['postId']}')),
      ),
    ],
  );
  addTearDown(router.dispose);
  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        authProvider.overrideWith((ref) => Stream.value(MockUser(uid: 'u1'))),
        blogRepositoryProvider.overrideWithValue(repo),
      ],
      child: MaterialApp.router(theme: AppTheme.light, routerConfig: router),
    ),
  );
  router.push(route);
  await _settle(tester);
  return repo;
}

Future<void> _settle(WidgetTester tester) async {
  for (var i = 0; i < 8; i++) {
    await tester.pump(const Duration(milliseconds: 100));
  }
}

void main() {
  testWidgets('feed: destaque, chips, continue lendo e lista', (tester) async {
    await _pump(
      tester,
      route: AppRoutes.blog,
      library: {
        'saque': BlogLibraryEntry(
          postId: 'saque',
          progress: 0.6,
          readStartedAt: DateTime(2026, 11, 1),
        ),
      },
    );

    expect(find.byKey(const Key('blog-featured-liga')), findsOneWidget);
    expect(find.byKey(const Key('blog-chip-all')), findsOneWidget);
    expect(find.byKey(const Key('blog-chip-torneios')), findsOneWidget);
    expect(find.byKey(const Key('blog-chip-regras')), findsNothing);
    expect(find.byKey(const Key('blog-continue-saque')), findsOneWidget);
    expect(find.text('60%'), findsOneWidget);
    expect(find.byKey(const Key('blog-row-toalha')), findsOneWidget);
    expect(find.byKey(const Key('blog-row-liga')), findsNothing);

    // Filtra: o destaque vira o post da categoria; "Continue lendo" sai.
    await tester.tap(find.byKey(const Key('blog-chip-treino')));
    await _settle(tester);
    expect(find.byKey(const Key('blog-featured-saque')), findsOneWidget);
    expect(find.byKey(const Key('blog-featured-liga')), findsNothing);
    expect(find.byKey(const Key('blog-continue-saque')), findsNothing);
    expect(find.byKey(const Key('blog-row-toalha')), findsNothing);
  });

  testWidgets('busca sem acento filtra a lista', (tester) async {
    await _pump(tester, route: AppRoutes.blog);

    await tester.tap(find.byKey(const Key('blog-search-toggle')));
    await _settle(tester);
    await tester.enterText(find.byKey(const Key('blog-search')), 'exercicios');
    await _settle(tester);

    expect(find.text('1 resultado'), findsOneWidget);
    expect(find.byKey(const Key('blog-row-saque')), findsOneWidget);
    expect(find.byKey(const Key('blog-featured-liga')), findsNothing);
  });

  testWidgets('salvar pela lista grava e pinta o marcador', (tester) async {
    final repo = await _pump(tester, route: AppRoutes.blog);

    await tester.tap(find.byKey(const Key('blog-save-toalha')));
    await _settle(tester);

    expect(repo.writes.single.saved, isTrue);
    expect(find.byTooltip('Tirar dos salvos'), findsOneWidget);
  });

  testWidgets('feed vazio avisa', (tester) async {
    tester.view.physicalSize = const Size(390 * 3, 844 * 3);
    tester.view.devicePixelRatio = 3;
    addTearDown(tester.view.reset);
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          authProvider.overrideWith((ref) => Stream.value(MockUser(uid: 'u1'))),
          blogRepositoryProvider.overrideWithValue(
            FakeBlogRepository(const []),
          ),
        ],
        child: MaterialApp(theme: AppTheme.dark, home: const BlogFeedPage()),
      ),
    );
    await _settle(tester);

    expect(
      find.text('Ainda não tem post no blog. Volte em breve.'),
      findsOneWidget,
    );
  });

  testWidgets('salvos: pela metade com minutos restantes e lidos', (
    tester,
  ) async {
    final today = DateTime.now();
    await _pump(
      tester,
      route: AppRoutes.blogSaved,
      library: {
        'saque': BlogLibraryEntry(
          postId: 'saque',
          progress: 0.6,
          readStartedAt: today,
        ),
        'toalha': BlogLibraryEntry(
          postId: 'toalha',
          saved: true,
          savedAt: today,
        ),
        'liga': BlogLibraryEntry(
          postId: 'liga',
          progress: 1,
          readStartedAt: today,
          finishedAt: today,
        ),
      },
    );

    expect(find.text('Salvos · 1'), findsOneWidget);
    expect(find.text('PELA METADE'), findsOneWidget);
    expect(find.text('2 min restantes'), findsOneWidget);
    expect(find.text('2 min · salvo hoje'), findsOneWidget);

    await tester.tap(find.text('Lidos'));
    await _settle(tester);
    expect(find.text('4 min · lido hoje'), findsOneWidget);
    expect(find.byKey(const Key('blog-row-toalha')), findsNothing);
  });
}
