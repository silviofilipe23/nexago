import 'package:firebase_auth_mocks/firebase_auth_mocks.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:nexago_app/core/auth/auth_providers.dart';
import 'package:nexago_app/core/router/routes.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/features/blog/application/blog_providers.dart';
import 'package:nexago_app/features/blog/domain/blog_post.dart';
import 'package:nexago_app/features/blog/presentation/blog_post_page.dart';
import 'package:nexago_app/features/home_banners/domain/home_banner.dart';

import '../fake_blog_repository.dart';

final _post = BlogPost(
  id: 'liga',
  title: 'Liga nexaGO: tudo sobre a 2ª etapa',
  slug: 'liga-nexago-2a-etapa',
  category: BlogCategory.torneios,
  authorName: 'Marcelo R.',
  authorRole: 'Organização da Liga',
  publishAt: DateTime(2026, 10, 28),
  readMinutes: 4,
  helpfulCount: 214,
  body: const [
    BlogParagraph('A 2ª etapa chega com categorias novas.'),
    BlogHeading('O que muda'),
    BlogList(['Duas categorias novas.', 'Check-in pelo app.']),
    BlogQuote('Inscreva a dupla junto.'),
  ],
  cta: const BlogCta(
    label: 'Ver torneios',
    destination: HomeBannerDestination.torneios,
  ),
);

final _related = [
  BlogPost(
    id: 'kotc',
    title: 'King of the Court: as regras explicadas',
    category: BlogCategory.regras,
    publishAt: DateTime(2026, 10, 20),
    readMinutes: 3,
    authorName: 'Marcelo R.',
  ),
  BlogPost(
    id: 'saque',
    title: '5 exercícios para melhorar o saque',
    category: BlogCategory.treino,
    publishAt: DateTime(2026, 10, 10),
    readMinutes: 5,
  ),
  BlogPost(
    id: 'ranking',
    title: 'Como funciona o ranking',
    category: BlogCategory.guia,
    publishAt: DateTime(2026, 10, 1),
    readMinutes: 3,
  ),
];

Future<FakeBlogRepository> _pump(
  WidgetTester tester, {
  String postId = 'liga',
}) async {
  tester.view.physicalSize = const Size(390 * 3, 844 * 3);
  tester.view.devicePixelRatio = 3;
  addTearDown(tester.view.reset);
  final repo = FakeBlogRepository([_post, ..._related]);
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
        path: AppRoutes.tournamentDiscoveryList,
        name: AppRouteNames.tournamentDiscoveryList,
        builder: (context, state) =>
            const Scaffold(body: Text('Lista de torneios')),
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
      child: MaterialApp.router(theme: AppTheme.dark, routerConfig: router),
    ),
  );
  router.pushNamed(AppRouteNames.blogPost, pathParameters: {'postId': postId});
  await _settle(tester);
  return repo;
}

Future<void> _settle(WidgetTester tester) async {
  for (var i = 0; i < 8; i++) {
    await tester.pump(const Duration(milliseconds: 100));
  }
}

void main() {
  testWidgets('mostra título, autor, blocos e a chamada', (tester) async {
    await _pump(tester);

    expect(find.text('Liga nexaGO: tudo sobre a 2ª etapa'), findsOneWidget);
    expect(find.text('TORNEIOS'), findsOneWidget);
    expect(find.text('4 min de leitura'), findsOneWidget);
    expect(find.text('MR'), findsOneWidget);
    expect(find.text('Organização da Liga · 28 out'), findsOneWidget);
    expect(find.text('O que muda'), findsOneWidget);
    expect(find.text('Check-in pelo app.'), findsOneWidget);
    expect(find.text('Inscreva a dupla junto.'), findsOneWidget);
    expect(find.text('Ver torneios'), findsOneWidget);
    expect(find.text('Seguir'), findsNothing);
    // "Ficou dúvida" entrou com os comentários (só com sessão).
    expect(find.text('Ficou dúvida'), findsOneWidget);
  });

  testWidgets('ao abrir grava o início da leitura', (tester) async {
    final repo = await _pump(tester);

    expect(repo.writes, isNotEmpty);
    final first = repo.writes.first;
    expect(first.postId, 'liga');
    expect(first.readStartedAt, isNotNull);
    expect(first.saved, isFalse);
  });

  testWidgets('Ajudou soma na hora e grava a reação', (tester) async {
    final repo = await _pump(tester);

    await tester.scrollUntilVisible(
      find.byKey(const Key('blog-helpful')),
      300,
      scrollable: find.byType(Scrollable).first,
    );
    expect(find.text('Ajudou · 214'), findsOneWidget);

    await tester.tap(find.byKey(const Key('blog-helpful')));
    await _settle(tester);

    expect(find.text('Ajudou · 215'), findsOneWidget);
    expect(repo.helpfulCalls, [true]);

    await tester.tap(find.byKey(const Key('blog-helpful')));
    await _settle(tester);
    expect(find.text('Ajudou · 214'), findsOneWidget);
    expect(repo.helpfulCalls, [true, false]);
  });

  testWidgets('leia também traz 2 posts, os mais recentes', (tester) async {
    await _pump(tester);

    await tester.scrollUntilVisible(
      find.text('Leia também'),
      300,
      scrollable: find.byType(Scrollable).first,
    );
    expect(
      find.text('King of the Court: as regras explicadas'),
      findsOneWidget,
    );
    expect(find.text('5 exercícios para melhorar o saque'), findsOneWidget);
    expect(find.text('Como funciona o ranking'), findsNothing);
  });

  testWidgets('salvar grava o doc com saved e savedAt', (tester) async {
    final repo = await _pump(tester);

    await tester.tap(find.byKey(const Key('blog-post-save')));
    await _settle(tester);

    final last = repo.writes.last;
    expect(last.saved, isTrue);
    expect(last.savedAt, isNotNull);
    // Mantém o início da leitura gravado ao abrir.
    expect(last.readStartedAt, isNotNull);
  });

  testWidgets('a chamada abre o destino do banner', (tester) async {
    await _pump(tester);

    await tester.scrollUntilVisible(
      find.byKey(const Key('blog-cta')),
      300,
      scrollable: find.byType(Scrollable).first,
    );
    await tester.tap(find.byKey(const Key('blog-cta')));
    await _settle(tester);

    expect(find.text('Lista de torneios'), findsOneWidget);
  });

  testWidgets('post que sumiu mostra indisponível', (tester) async {
    await _pump(tester, postId: 'nao-existe');

    expect(find.text('Este post não está mais disponível.'), findsOneWidget);
  });
}
