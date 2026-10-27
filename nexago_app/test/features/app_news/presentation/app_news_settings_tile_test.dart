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
import 'package:nexago_app/features/app_news/presentation/widgets/app_news_settings_tile.dart';

import 'app_news_test_harness.dart';

Future<void> pumpTile(
  WidgetTester tester, {
  List<AppNewsRelease> releases = const [],
  Set<String> used = const {},
}) async {
  final router = GoRouter(
    routes: [
      GoRoute(
        path: '/',
        builder: (context, state) =>
            const Scaffold(body: Column(children: [AppNewsSettingsTile()])),
      ),
      GoRoute(
        path: AppRoutes.appNews,
        name: AppRouteNames.appNews,
        builder: (context, state) =>
            const Scaffold(body: Text('Tela de Novidades')),
      ),
    ],
  );
  addTearDown(router.dispose);
  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        authProvider.overrideWith((ref) => Stream.value(MockUser(uid: 'u1'))),
        installedBuildNumberProvider.overrideWith((ref) async => 113),
        appNewsRepositoryProvider.overrideWithValue(
          FakeAppNewsRepository(releases),
        ),
        appNewsLocalStoreProvider.overrideWithValue(
          FakeAppNewsLocalStore(used: {...used}),
        ),
      ],
      child: MaterialApp.router(theme: AppTheme.dark, routerConfig: router),
    ),
  );
  await settle(tester);
}

void main() {
  testWidgets('sem nada publicado, o item continua em Sobre e abre a tela', (
    tester,
  ) async {
    await pumpTile(tester);

    expect(find.text('Novidades'), findsOneWidget);
    expect(find.text('O que há de novo no app'), findsOneWidget);
    expect(find.textContaining('nova'), findsNothing);

    await tester.tap(find.text('Novidades'));
    await settle(tester);
    expect(find.text('Tela de Novidades'), findsOneWidget);
  });

  testWidgets('com novidades: versão e quantas o atleta ainda não usou', (
    tester,
  ) async {
    await pumpTile(tester, releases: [currentRelease], used: {'rateio'});

    expect(find.text('O que chegou na versão 1.0.15'), findsOneWidget);
    expect(find.text('3 novas'), findsOneWidget);
  });
}
