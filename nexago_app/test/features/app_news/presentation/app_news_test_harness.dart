import 'package:firebase_auth/firebase_auth.dart';
import 'package:firebase_auth_mocks/firebase_auth_mocks.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:nexago_app/core/app_update/app_update_providers.dart';
import 'package:nexago_app/core/auth/auth_providers.dart';
import 'package:nexago_app/core/router/routes.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/features/app_news/application/app_news_providers.dart';
import 'package:nexago_app/features/app_news/domain/app_news.dart';
import 'package:nexago_app/features/app_news/domain/app_news_logic.dart';
import 'package:nexago_app/features/app_news/presentation/app_news_detail_page.dart';
import 'package:nexago_app/features/app_news/presentation/app_news_page.dart';
import 'package:nexago_app/features/app_news/presentation/app_news_stories_announcer.dart';
import 'package:nexago_app/features/app_news/presentation/app_news_stories_page.dart';
import 'package:nexago_app/features/athlete/domain/athlete_shell_providers.dart';

class FakeAppNewsRepository implements AppNewsRepository {
  FakeAppNewsRepository(this.releases);

  final List<AppNewsRelease> releases;

  @override
  Stream<List<AppNewsRelease>> watchReleases() => Stream.value(releases);
}

class FakeAppNewsLocalStore implements AppNewsLocalStore {
  FakeAppNewsLocalStore({Set<String>? used, this.seen})
    : used = used ?? <String>{};

  final Set<String> used;
  String? seen;

  @override
  Future<Set<String>> usedFeatures(String uid) async => {...used};

  @override
  Future<void> markUsed(String uid, String featureId) async =>
      used.add(featureId);

  @override
  Future<String?> storiesSeenVersion(String uid) async => seen;

  @override
  Future<void> markStoriesSeen(String uid, String version) async =>
      seen = version;
}

class _Metadata extends UserMetadata {
  _Metadata(DateTime created) : super(created.millisecondsSinceEpoch, null);
}

AppNewsFeature newsFeature(
  String id, {
  String destination = 'ranking',
  bool inStories = true,
}) => AppNewsFeature.fromMap({
  'id': id,
  'title': 'Título $id',
  'summary': 'Resumo $id',
  'description': 'Explicação $id',
  'steps': ['Passo um', 'Passo dois', 'Passo três'],
  'where': 'Início › Ações rápidas',
  'ctaLabel': 'Abrir $id',
  'destination': destination,
  'stories': inStories,
})!;

final currentRelease = AppNewsRelease(
  version: '1.0.15',
  build: 113,
  date: '2026-10-27',
  features: [
    newsFeature('radar', destination: 'reservar'),
    newsFeature('racha'),
    newsFeature('rateio'),
    newsFeature('dupla'),
  ],
  improvements: const ['Placar abre mais rápido', 'Clima na Agenda'],
);

final previousRelease = AppNewsRelease(
  version: '1.0.14',
  build: 112,
  date: '2026-10-05',
  features: [
    AppNewsFeature.fromMap({
      'id': 'convite',
      'title': 'Convite de dupla',
      'summary': 'Chame o parceiro pelo app.',
    })!,
  ],
  improvements: const ['Placar ao vivo'],
);

/// O app mínimo das Novidades: um "shell" com o anunciador dos stories, as
/// rotas de Novidades e o Ranking como destino empilhado.
Future<void> pumpAppNews(
  WidgetTester tester, {
  required FakeAppNewsLocalStore store,
  List<AppNewsRelease>? releases,
  String initialLocation = '/',
  DateTime? accountCreatedAt,
  int installedBuild = 113,
}) async {
  tester.view.physicalSize = const Size(402 * 3, 874 * 3);
  tester.view.devicePixelRatio = 3;
  addTearDown(tester.view.reset);

  final router = GoRouter(
    initialLocation: initialLocation,
    routes: [
      GoRoute(
        path: '/',
        builder: (context, state) =>
            const AppNewsStoriesAnnouncer(child: _FakeShell()),
      ),
      GoRoute(
        path: AppRoutes.appNews,
        name: AppRouteNames.appNews,
        builder: (context, state) => const AppNewsPage(),
      ),
      GoRoute(
        path: AppRoutes.appNewsStories,
        name: AppRouteNames.appNewsStories,
        builder: (context, state) =>
            AppNewsStoriesPage(stories: state.extra! as AppNewsStories),
      ),
      GoRoute(
        path: AppRoutes.appNewsDetail,
        name: AppRouteNames.appNewsDetail,
        builder: (context, state) => AppNewsDetailPage(
          featureId: state.pathParameters['featureId'] ?? '',
        ),
      ),
      GoRoute(
        path: AppRoutes.athleteRanking,
        name: AppRouteNames.athleteRanking,
        builder: (context, state) =>
            const Scaffold(body: Text('Tela do ranking')),
      ),
    ],
  );
  addTearDown(router.dispose);

  final user = MockUser(
    uid: 'u1',
    metadata: _Metadata(accountCreatedAt ?? DateTime.utc(2026, 9, 1)),
  );
  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        authProvider.overrideWith((ref) => Stream.value(user)),
        installedBuildNumberProvider.overrideWith(
          (ref) async => installedBuild,
        ),
        appNewsRepositoryProvider.overrideWithValue(
          FakeAppNewsRepository(releases ?? [currentRelease, previousRelease]),
        ),
        appNewsLocalStoreProvider.overrideWithValue(store),
      ],
      child: MaterialApp.router(theme: AppTheme.dark, routerConfig: router),
    ),
  );
  await settle(tester);
}

/// Streams, futures e o pós-quadro do anunciador, sem `pumpAndSettle`
/// (o indicador de carregamento não para).
Future<void> settle(WidgetTester tester) async {
  for (var i = 0; i < 8; i++) {
    await tester.pump(const Duration(milliseconds: 100));
  }
  await tester.pump(const Duration(milliseconds: 400));
}

class _FakeShell extends ConsumerWidget {
  const _FakeShell();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final tab = ref.watch(athleteShellTabIndexProvider);
    return Scaffold(
      body: Center(
        child: TextButton(
          onPressed: () => context.pushNamed(AppRouteNames.appNews),
          child: Text('Shell aba $tab'),
        ),
      ),
    );
  }
}
