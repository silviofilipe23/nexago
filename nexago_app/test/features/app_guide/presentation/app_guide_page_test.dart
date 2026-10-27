import 'package:firebase_auth_mocks/firebase_auth_mocks.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:nexago_app/core/auth/auth_providers.dart';
import 'package:nexago_app/core/router/routes.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/features/app_guide/application/app_guide_providers.dart';
import 'package:nexago_app/features/app_guide/domain/app_guide.dart';
import 'package:nexago_app/features/app_guide/presentation/app_guide_page.dart';
import 'package:nexago_app/features/app_guide/presentation/app_guide_topic_page.dart';
import 'package:nexago_app/features/athlete/domain/athlete_shell_providers.dart';

class _FakeRepository implements AppGuideRepository {
  _FakeRepository(this.categories);

  final List<AppGuideCategory> categories;

  @override
  Stream<List<AppGuideCategory>> watchCategories() => Stream.value(categories);
}

final _categories = AppGuideCategory.listFromDoc({
  'categories': [
    {
      'id': 'reservar',
      'title': 'Reservar',
      'topics': [
        {
          'id': 'reservar-quadra',
          'title': 'Reservar uma quadra',
          'summary': 'Escolha a arena no mapa e pague com Pix.',
          'description': 'Explicação da reserva.',
          'steps': ['Abra a aba Reservar', 'Escolha o horário', 'Pague'],
          'where': 'Aba Reservar',
          'ctaLabel': 'Abrir mapa',
          'destination': 'reservar',
        },
      ],
    },
    {
      'id': 'competir',
      'title': 'Competir',
      'topics': [
        {
          'id': 'ranking',
          'title': 'Ranking',
          'summary': 'Veja sua posição na temporada.',
          'steps': ['Abra o Hub', 'Toque em Ranking'],
          'where': 'Hub › Ranking',
          'ctaLabel': 'Ver ranking',
          'destination': 'ranking',
        },
      ],
    },
  ],
});

Future<void> pumpGuide(
  WidgetTester tester, {
  List<AppGuideCategory>? categories,
}) async {
  tester.view.physicalSize = const Size(402 * 3, 874 * 3);
  tester.view.devicePixelRatio = 3;
  addTearDown(tester.view.reset);
  final router = GoRouter(
    routes: [
      GoRoute(
        path: '/',
        builder: (context, state) => Consumer(
          builder: (context, ref, _) => Scaffold(
            body: Text('Shell aba ${ref.watch(athleteShellTabIndexProvider)}'),
          ),
        ),
      ),
      GoRoute(
        path: AppRoutes.appGuide,
        name: AppRouteNames.appGuide,
        builder: (context, state) => const AppGuidePage(),
      ),
      GoRoute(
        path: AppRoutes.appGuideTopic,
        name: AppRouteNames.appGuideTopic,
        builder: (context, state) =>
            AppGuideTopicPage(topicId: state.pathParameters['topicId'] ?? ''),
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
  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        authProvider.overrideWith((ref) => Stream.value(MockUser(uid: 'u1'))),
        appGuideRepositoryProvider.overrideWithValue(
          _FakeRepository(categories ?? _categories),
        ),
      ],
      child: MaterialApp.router(theme: AppTheme.dark, routerConfig: router),
    ),
  );
  // Empilhada sobre o "shell", como no app.
  router.pushNamed(AppRouteNames.appGuide);
  await settle(tester);
}

Future<void> settle(WidgetTester tester) async {
  for (var i = 0; i < 8; i++) {
    await tester.pump(const Duration(milliseconds: 100));
  }
}

void main() {
  testWidgets('lista os guias por categoria', (tester) async {
    await pumpGuide(tester);

    expect(find.text('Como usar o NexaGO'), findsOneWidget);
    expect(find.text('RESERVAR'), findsOneWidget);
    expect(find.text('COMPETIR'), findsOneWidget);
    expect(find.text('Reservar uma quadra'), findsOneWidget);
    expect(find.text('Ranking'), findsOneWidget);
  });

  testWidgets('a busca filtra sem acento e avisa quando não acha', (
    tester,
  ) async {
    await pumpGuide(tester);

    await tester.enterText(
      find.byKey(const Key('app-guide-search')),
      'temporada',
    );
    await settle(tester);
    expect(find.text('1 GUIA'), findsOneWidget);
    expect(find.text('Ranking'), findsOneWidget);
    expect(find.text('Reservar uma quadra'), findsNothing);

    await tester.enterText(find.byKey(const Key('app-guide-search')), 'xyz');
    await settle(tester);
    expect(find.text('Nada encontrado para “xyz”.'), findsOneWidget);
  });

  testWidgets('guia: categoria, passos e o botão abre a função', (
    tester,
  ) async {
    await pumpGuide(tester);

    await tester.tap(find.byKey(const Key('feature-row-ranking')));
    await settle(tester);
    expect(find.text('COMPETIR'), findsOneWidget);
    expect(find.text('Toque em Ranking'), findsOneWidget);
    expect(find.text('Hub › Ranking'), findsOneWidget);

    await tester.tap(find.byKey(const Key('app-news-detail-cta')));
    await settle(tester);
    expect(find.text('Tela do ranking'), findsOneWidget);
  });

  testWidgets('guia que abre uma aba do shell volta ao shell', (tester) async {
    await pumpGuide(tester);

    await tester.tap(find.byKey(const Key('feature-row-reservar-quadra')));
    await settle(tester);
    await tester.tap(find.byKey(const Key('app-news-detail-cta')));
    await settle(tester);

    expect(find.text('Shell aba 2'), findsOneWidget);
  });

  testWidgets('sem guias publicados: aviso, sem busca', (tester) async {
    await pumpGuide(tester, categories: const []);

    expect(
      find.text('Os guias de cada função chegam em breve.'),
      findsOneWidget,
    );
    expect(find.byKey(const Key('app-guide-search')), findsNothing);
  });
}
