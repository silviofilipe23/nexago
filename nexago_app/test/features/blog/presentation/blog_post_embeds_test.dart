import 'package:firebase_auth_mocks/firebase_auth_mocks.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:nexago_app/core/auth/auth_providers.dart';
import 'package:nexago_app/core/router/routes.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/features/blog/application/blog_providers.dart';
import 'package:nexago_app/features/blog/domain/blog_notify_prefs.dart';
import 'package:nexago_app/features/blog/domain/blog_post.dart';
import 'package:nexago_app/features/blog/presentation/blog_library_page.dart';
import 'package:nexago_app/features/blog/presentation/blog_post_page.dart';
import 'package:nexago_app/features/store/application/store_providers.dart';
import 'package:nexago_app/features/store/domain/store_models.dart';
import 'package:nexago_app/features/tournaments/data/tournament_inscriptions_repository.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_discovery_providers.dart';

import '../blog_test_tournaments.dart';
import '../fake_blog_repository.dart';

final _post = BlogPost(
  id: 'liga',
  title: 'Liga nexaGO: tudo sobre a 2ª etapa',
  slug: 'liga',
  category: BlogCategory.torneios,
  authorName: 'Marcelo R.',
  publishAt: DateTime(2026, 10, 28),
  readMinutes: 4,
  body: const [
    BlogParagraph('A 2ª etapa chega com categorias novas.'),
    BlogTournamentEmbed('t1'),
    BlogTournamentEmbed('sumiu'),
    BlogProductEmbed('toalha'),
    BlogVideo(
      url: 'https://www.instagram.com/reel/Cabc123/',
      caption: 'Os melhores pontos da 1ª etapa',
    ),
  ],
);

const _toalha = StoreProduct(
  id: 'toalha',
  name: 'Toalha nexaGO',
  priceCents: 8990,
  minPriceCents: 8990,
  maxPriceCents: 10990,
);

Future<FakeBlogRepository> _pump(
  WidgetTester tester, {
  required String location,
  bool storeOn = true,
  bool? pushOn = true,
  BlogNotifyPrefs prefs = BlogNotifyPrefs.allOn,
}) async {
  tester.view.physicalSize = const Size(390 * 3, 844 * 3);
  tester.view.devicePixelRatio = 3;
  addTearDown(tester.view.reset);
  final repo = FakeBlogRepository([_post])..notifyPrefs = prefs;
  final tournament = blogTestTournament(
    registrationClosesAt: DateTime.now().add(const Duration(days: 6)),
  );
  final router = GoRouter(
    routes: [
      GoRoute(
        path: '/',
        builder: (context, state) => const Scaffold(body: Text('Início')),
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
            BlogPostPage(postId: state.pathParameters['postId'] ?? ''),
      ),
      GoRoute(
        path: AppRoutes.tournamentDetail,
        name: AppRouteNames.tournamentDetail,
        builder: (context, state) => Scaffold(
          body: Text('Torneio ${state.pathParameters['tournamentId']}'),
        ),
      ),
      GoRoute(
        path: AppRoutes.storeProduct,
        name: AppRouteNames.storeProduct,
        builder: (context, state) => Scaffold(
          body: Text(
            'Produto ${state.pathParameters['productId']} '
            '${state.uri.queryParameters['origem']}',
          ),
        ),
      ),
      GoRoute(
        path: AppRoutes.athleteNotificationSettings,
        name: AppRouteNames.athleteNotificationSettings,
        builder: (context, state) =>
            const Scaffold(body: Text('Preferências de notificação')),
      ),
    ],
  );
  addTearDown(router.dispose);
  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        authProvider.overrideWith((ref) => Stream.value(MockUser(uid: 'u1'))),
        blogRepositoryProvider.overrideWithValue(repo),
        blogPushChannelOnProvider.overrideWith((ref) => pushOn),
        tournamentDetailProvider.overrideWith(
          (ref, id) => Stream.value(id == 't1' ? tournament : null),
        ),
        tournamentCategoryEnrollmentCountsProvider.overrideWith(
          (ref, id) => Stream.value(const {'c1': 10, 'c2': 2}),
        ),
        storeEnabledProvider.overrideWith((ref) => storeOn),
        storeCatalogProvider.overrideWith(
          (ref) => Stream.value(const StoreCatalog(products: [_toalha])),
        ),
      ],
      child: MaterialApp.router(theme: AppTheme.dark, routerConfig: router),
    ),
  );
  router.push(location);
  await _settle(tester);
  return repo;
}

Future<void> _settle(WidgetTester tester) async {
  for (var i = 0; i < 8; i++) {
    await tester.pump(const Duration(milliseconds: 100));
  }
}

Future<void> _scrollTo(WidgetTester tester, Finder finder) => tester
    .scrollUntilVisible(finder, 300, scrollable: find.byType(Scrollable).first);

void main() {
  testWidgets('torneio ao vivo: status, prazo, vagas e o detalhe', (
    tester,
  ) async {
    await _pump(tester, location: '/athlete/blog/liga');

    await _scrollTo(tester, find.byKey(const Key('blog-tournament-open-t1')));
    expect(find.text('INSCRIÇÕES ABERTAS'), findsOneWidget);
    expect(find.textContaining('fecham em'), findsOneWidget);
    expect(find.text('Arena Errejota · Goiânia'), findsOneWidget);
    expect(find.text('12 vagas restantes'), findsOneWidget);
    expect(find.text('Inscrever minha dupla'), findsOneWidget);
    // Torneio que não existe: o bloco some.
    expect(find.byKey(const Key('blog-tournament-sumiu')), findsNothing);

    await tester.tap(find.byKey(const Key('blog-tournament-open-t1')));
    await _settle(tester);
    expect(find.text('Torneio t1'), findsOneWidget);
  });

  testWidgets('produto: nome, "a partir de" e a página da Loja', (
    tester,
  ) async {
    await _pump(tester, location: '/athlete/blog/liga');

    await _scrollTo(tester, find.byKey(const Key('blog-product-toalha')));
    expect(find.text('Toalha nexaGO'), findsOneWidget);
    expect(find.textContaining('a partir de'), findsOneWidget);

    await tester.tap(find.byKey(const Key('blog-product-toalha')));
    await _settle(tester);
    expect(find.text('Produto toalha blog'), findsOneWidget);
  });

  testWidgets('Loja desligada: o bloco do produto some', (tester) async {
    await _pump(tester, location: '/athlete/blog/liga', storeOn: false);

    await _scrollTo(tester, find.byKey(const Key('blog-helpful')));
    expect(find.byKey(const Key('blog-product-toalha')), findsNothing);
    expect(find.text('Toalha nexaGO'), findsNothing);
  });

  testWidgets('vídeo do Instagram: card com legenda', (tester) async {
    await _pump(tester, location: '/athlete/blog/liga');

    await _scrollTo(tester, find.text('Os melhores pontos da 1ª etapa'));
    expect(find.text('ASSISTIR NO INSTAGRAM'), findsOneWidget);
  });

  testWidgets('avisar posts da categoria: o switch grava o muted', (
    tester,
  ) async {
    final repo = await _pump(tester, location: '/athlete/blog/liga');

    await _scrollTo(tester, find.byKey(const Key('blog-notify-switch')));
    expect(find.text('Avisar posts de Torneios'), findsOneWidget);

    await tester.tap(find.byKey(const Key('blog-notify-switch')));
    await _settle(tester);
    expect(repo.notifyWrites.single.muted, {BlogCategory.torneios});
  });

  testWidgets('push desligado: dica e atalho em vez do switch', (tester) async {
    await _pump(tester, location: '/athlete/blog/liga', pushOn: false);

    await _scrollTo(tester, find.byKey(const Key('blog-notify-open-settings')));
    expect(find.byKey(const Key('blog-notify-switch')), findsNothing);
    expect(
      find.text('O push está desligado nas notificações do app.'),
      findsOneWidget,
    );

    await tester.tap(find.byKey(const Key('blog-notify-open-settings')));
    await _settle(tester);
    expect(find.text('Preferências de notificação'), findsOneWidget);
  });

  testWidgets('Salvos: card dos avisos com resumo e folha de ajuste', (
    tester,
  ) async {
    final repo = await _pump(
      tester,
      location: AppRoutes.blogSaved,
      prefs: const BlogNotifyPrefs(
        muted: {
          BlogCategory.regras,
          BlogCategory.arenas,
          BlogCategory.guia,
          BlogCategory.loja,
        },
      ),
    );

    expect(find.text('Avisos do blog'), findsOneWidget);
    expect(find.text('Torneios e Treino ligados'), findsOneWidget);

    await tester.tap(find.byKey(const Key('blog-notify-card')));
    await _settle(tester);
    await tester.tap(find.byKey(const Key('blog-notify-sheet-regras')));
    await _settle(tester);

    expect(repo.notifyWrites.single.muted, {
      BlogCategory.arenas,
      BlogCategory.guia,
      BlogCategory.loja,
    });
  });
}
