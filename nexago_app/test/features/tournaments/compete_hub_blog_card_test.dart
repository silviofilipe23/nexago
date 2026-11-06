import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:nexago_app/core/auth/active_role_providers.dart';
import 'package:nexago_app/core/observability/analytics_service.dart';
import 'package:nexago_app/core/router/routes.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/features/arena/domain/arena_access_provider.dart';
import 'package:nexago_app/features/athlete/domain/athlete_profile_providers.dart';
import 'package:nexago_app/features/tournaments/presentation/tournament_discovery_page.dart';

import '../../support/recording_analytics.dart';

void main() {
  testWidgets('card do Blog no Hub abre o feed do blog', (tester) async {
    await tester.binding.setSurfaceSize(const Size(430, 1400));
    addTearDown(() => tester.binding.setSurfaceSize(null));

    final router = GoRouter(
      routes: [
        GoRoute(
          path: '/',
          // Na casca do app a aba fica dentro do Scaffold do shell.
          builder: (_, __) => const Scaffold(body: TournamentDiscoveryPage()),
        ),
        GoRoute(
          path: AppRoutes.blog,
          name: AppRouteNames.blog,
          builder: (_, __) => const Scaffold(body: Text('feed do blog')),
        ),
      ],
    );
    addTearDown(router.dispose);

    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          athleteProfileProvider.overrideWith((ref) => Stream.value(null)),
          hasMultipleMobileRolesProvider.overrideWithValue(false),
          arenaPanelAccessProvider.overrideWith((ref) async => false),
          analyticsServiceProvider.overrideWithValue(RecordingAnalytics()),
        ],
        child: MaterialApp.router(theme: AppTheme.dark, routerConfig: router),
      ),
    );
    await tester.pump();

    final card = find.byKey(const Key('compete-hub-blog'));
    await tester.scrollUntilVisible(card, 200,
        scrollable: find.byType(Scrollable).first);
    expect(find.text('Blog'), findsOneWidget);
    expect(find.text('Dicas de treino, regras, torneios e novidades do nexaGO'),
        findsOneWidget);

    await tester.tap(card);
    await tester.pumpAndSettle();
    expect(find.text('feed do blog'), findsOneWidget);
  });
}
