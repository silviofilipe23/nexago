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
  category: BlogCategory.torneios,
  readMinutes: 4,
  body: const [BlogParagraph('A 2ª etapa chega com categorias novas.')],
  cta: const BlogCta(
    label: 'Ver torneios',
    destination: HomeBannerDestination.torneios,
  ),
);

late DateTime _now;

Future<(FakeBlogRepository, GoRouter)> _pump(WidgetTester tester) async {
  tester.view.physicalSize = const Size(390 * 3, 844 * 3);
  tester.view.devicePixelRatio = 3;
  addTearDown(tester.view.reset);
  _now = DateTime(2026, 11, 5, 10);
  final repo = FakeBlogRepository([_post]);
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
        blogReadClockProvider.overrideWithValue(() => _now),
      ],
      child: MaterialApp.router(theme: AppTheme.dark, routerConfig: router),
    ),
  );
  // Auth resolvido antes de abrir o post (o uid sai dele na gravação).
  await _settle(tester);
  router.push('/athlete/blog/liga');
  await _settle(tester);
  return (repo, router);
}

Future<void> _settle(WidgetTester tester) async {
  for (var i = 0; i < 8; i++) {
    await tester.pump(const Duration(milliseconds: 100));
  }
}

void _advance(int seconds) => _now = _now.add(Duration(seconds: seconds));

Future<void> _lifecycle(
  WidgetTester tester,
  List<AppLifecycleState> states,
) async {
  for (final s in states) {
    tester.binding.handleAppLifecycleStateChanged(s);
    await tester.pump();
  }
}

const _toBackground = [
  AppLifecycleState.inactive,
  AppLifecycleState.hidden,
  AppLifecycleState.paused,
];
const _toForeground = [
  AppLifecycleState.hidden,
  AppLifecycleState.inactive,
  AppLifecycleState.resumed,
];

void main() {
  testWidgets('sair do post grava uma sessão com as chaves da rule', (
    tester,
  ) async {
    final (repo, router) = await _pump(tester);

    _advance(30);
    router.pop();
    await _settle(tester);

    expect(repo.reads, hasLength(1));
    final read = repo.reads.single;
    expect(read.keys.toSet(), {
      'postId',
      'uid',
      'category',
      'seconds',
      'progress',
      'finished',
      'ctaClicked',
    });
    expect(read['postId'], 'liga');
    expect(read['uid'], 'u1');
    expect(read['category'], 'torneios');
    expect(read['seconds'], 30);
    expect(read['ctaClicked'], isFalse);
  });

  testWidgets('menos de 5 s não grava', (tester) async {
    final (repo, router) = await _pump(tester);

    _advance(3);
    router.pop();
    await _settle(tester);

    expect(repo.reads, isEmpty);
  });

  testWidgets('segundo plano grava a sessão; a volta abre outra', (
    tester,
  ) async {
    final (repo, router) = await _pump(tester);

    _advance(20);
    await _lifecycle(tester, _toBackground);
    expect(repo.reads.map((r) => r['seconds']), [20]);

    _advance(600); // em segundo plano: não conta em sessão nenhuma
    await _lifecycle(tester, _toForeground);
    _advance(12);
    router.pop();
    await _settle(tester);

    expect(repo.reads.map((r) => r['seconds']), [20, 12]);
  });

  testWidgets('pausa sem volta: sair depois não grava de novo', (tester) async {
    final (repo, router) = await _pump(tester);

    _advance(20);
    await _lifecycle(tester, _toBackground);
    router.pop();
    await _settle(tester);

    expect(repo.reads, hasLength(1));
  });

  testWidgets('chamada tocada; o tempo na outra tela não conta', (
    tester,
  ) async {
    final (repo, router) = await _pump(tester);

    _advance(15);
    await tester.scrollUntilVisible(
      find.byKey(const Key('blog-cta')),
      300,
      scrollable: find.byType(Scrollable).first,
    );
    await tester.tap(find.byKey(const Key('blog-cta')));
    await _settle(tester);
    expect(find.text('Lista de torneios'), findsOneWidget);

    _advance(120); // na lista de torneios
    router.pop();
    await _settle(tester);
    _advance(5); // de volta ao post
    router.pop();
    await _settle(tester);

    final read = repo.reads.single;
    expect(read['ctaClicked'], isTrue);
    expect(read['seconds'], 20);
  });

  testWidgets('abrir o mesmo post de novo é outra sessão', (tester) async {
    final (repo, router) = await _pump(tester);

    _advance(10);
    router.pop();
    await _settle(tester);
    router.push('/athlete/blog/liga');
    await _settle(tester);
    _advance(8);
    router.pop();
    await _settle(tester);

    expect(repo.reads.map((r) => r['seconds']), [10, 8]);
  });
}
