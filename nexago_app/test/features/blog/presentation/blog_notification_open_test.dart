import 'package:firebase_auth_mocks/firebase_auth_mocks.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:nexago_app/core/auth/auth_providers.dart';
import 'package:nexago_app/core/notifications/notification_navigation.dart';
import 'package:nexago_app/core/router/routes.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/features/blog/application/blog_providers.dart';
import 'package:nexago_app/features/blog/domain/blog_post.dart';
import 'package:nexago_app/features/blog/presentation/blog_post_page.dart';

import '../fake_blog_repository.dart';

/// Payload de `onBlogPostPublishedPush` (`functions/src/blog-push.ts`).
const _payload = <String, dynamic>{
  'type': 'blog_post',
  'url': '/athlete/blog/liga',
  'postId': 'liga',
  'category': 'torneios',
};

final _post = BlogPost(
  id: 'liga',
  title: 'Liga nexaGO: tudo sobre a 2ª etapa',
  categoryKey: 'torneios',
  publishAt: DateTime(2026, 10, 28),
  readMinutes: 4,
  authorName: 'Marcelo R.',
  body: const [BlogParagraph('A 2ª etapa chega com categorias novas.')],
);

Future<(WidgetRef, GoRouter)> _pumpApp(WidgetTester tester) async {
  tester.view.physicalSize = const Size(390 * 3, 844 * 3);
  tester.view.devicePixelRatio = 3;
  addTearDown(tester.view.reset);
  Widget stub(String label) => Scaffold(body: Text(label));
  final router = GoRouter(
    routes: [
      GoRoute(path: '/', builder: (_, __) => stub('Início')),
      GoRoute(
        path: AppRoutes.blog,
        name: AppRouteNames.blog,
        builder: (_, __) => stub('feed do blog'),
      ),
      GoRoute(
        path: AppRoutes.blogPost,
        name: AppRouteNames.blogPost,
        builder: (_, state) =>
            BlogPostPage(postId: state.pathParameters['postId'] ?? ''),
      ),
    ],
  );
  addTearDown(router.dispose);

  late WidgetRef capturedRef;
  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        authProvider.overrideWith((ref) => Stream.value(MockUser(uid: 'u1'))),
        blogRepositoryProvider.overrideWithValue(FakeBlogRepository([_post])),
      ],
      child: Consumer(
        builder: (context, ref, _) {
          capturedRef = ref;
          return MaterialApp.router(theme: AppTheme.dark, routerConfig: router);
        },
      ),
    ),
  );
  await tester.pump();
  return (capturedRef, router);
}

Future<void> _settle(WidgetTester tester) async {
  for (var i = 0; i < 8; i++) {
    await tester.pump(const Duration(milliseconds: 100));
  }
}

Future<void> _openFromNotification(
  WidgetTester tester,
  WidgetRef ref,
  GoRouter router,
) async {
  await navigateFromNotificationData(_payload, router, ref: ref);
  await _settle(tester);
}

String _location(GoRouter router) =>
    router.routerDelegate.currentConfiguration.uri.toString();

void main() {
  testWidgets('o toque na notificação abre o post direto', (tester) async {
    final (ref, router) = await _pumpApp(tester);

    await _openFromNotification(tester, ref, router);

    expect(_location(router), '/athlete/blog/liga');
    expect(find.text('Liga nexaGO: tudo sobre a 2ª etapa'), findsOneWidget);
  });

  testWidgets('aberto pela notificação, o Voltar leva ao feed (não prende)', (
    tester,
  ) async {
    final (ref, router) = await _pumpApp(tester);
    await _openFromNotification(tester, ref, router);
    // `router.go` troca a pilha: o post é a única tela.
    expect(router.canPop(), isFalse);

    await tester.tap(find.bySemanticsLabel('Voltar'));
    await _settle(tester);

    expect(_location(router), AppRoutes.blog);
    expect(find.text('feed do blog'), findsOneWidget);
  });

  testWidgets('aberto pela notificação, o voltar do Android leva ao feed', (
    tester,
  ) async {
    final (ref, router) = await _pumpApp(tester);
    await _openFromNotification(tester, ref, router);

    final handled = await tester.binding.handlePopRoute();
    await _settle(tester);

    expect(handled, isTrue, reason: 'sem isso o app fecha');
    expect(find.text('feed do blog'), findsOneWidget);
  });

  testWidgets('aberto de dentro do app, o Voltar volta para onde estava', (
    tester,
  ) async {
    final (_, router) = await _pumpApp(tester);
    router.pushNamed(AppRouteNames.blogPost, pathParameters: {'postId': 'liga'});
    await _settle(tester);

    await tester.tap(find.bySemanticsLabel('Voltar'));
    await _settle(tester);

    expect(find.text('Início'), findsOneWidget);
  });
}
