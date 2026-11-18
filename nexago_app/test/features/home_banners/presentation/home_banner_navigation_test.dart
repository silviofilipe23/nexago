import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:nexago_app/core/router/routes.dart';
import 'package:nexago_app/features/app_news/domain/app_news.dart';
import 'package:nexago_app/features/app_news/presentation/app_news_navigation.dart';
import 'package:nexago_app/features/home_banners/domain/home_banner.dart';
import 'package:nexago_app/features/home_banners/presentation/home_banner_navigation.dart';

/// Abre [onTap] a partir de uma tela e devolve o texto da rota do clube
/// (`clube <origem>`), para conferir a fiação até a rota de verdade.
Future<void> _pumpAndTap(
  WidgetTester tester,
  Future<void> Function(BuildContext, WidgetRef) onTap,
) async {
  final router = GoRouter(
    routes: [
      GoRoute(
        path: '/',
        builder: (_, __) => Scaffold(
          body: Consumer(
            builder: (context, ref, _) => TextButton(
              onPressed: () => onTap(context, ref),
              child: const Text('abrir'),
            ),
          ),
        ),
      ),
      GoRoute(
        path: AppRoutes.benefitsClub,
        name: AppRouteNames.benefitsClub,
        builder: (_, state) => Scaffold(
          body: Text('clube ${state.uri.queryParameters['origem']}'),
        ),
      ),
    ],
  );
  addTearDown(router.dispose);
  await tester.pumpWidget(
    ProviderScope(child: MaterialApp.router(routerConfig: router)),
  );
  await tester.tap(find.text('abrir'));
  await tester.pumpAndSettle();
}

void main() {
  testWidgets('destino clube abre o Clube de Vantagens com origem app_news', (
    tester,
  ) async {
    await _pumpAndTap(
      tester,
      (context, ref) =>
          openAppDestination(context, ref, HomeBannerDestination.clube),
    );

    expect(find.text('clube app_news'), findsOneWidget);
  });

  testWidgets('guia ou novidade com destino clube abre o clube', (
    tester,
  ) async {
    final feature = AppNewsFeature.fromMap({
      'id': 'guia-usar-beneficio',
      'title': 'Usar um desconto do clube',
      'ctaLabel': 'Ver o clube',
      'destination': 'clube',
    })!;

    await _pumpAndTap(
      tester,
      (context, ref) => openFeatureDestination(context, ref, feature),
    );

    expect(find.text('clube app_news'), findsOneWidget);
  });
}
