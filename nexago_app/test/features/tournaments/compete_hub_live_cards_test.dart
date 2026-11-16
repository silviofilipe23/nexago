import 'dart:async';

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
import 'package:nexago_app/features/ranking/domain/ranking_providers.dart';
import 'package:nexago_app/features/tournaments/domain/compete_hub_card_labels.dart';
import 'package:nexago_app/features/tournaments/domain/compete_hub_models.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_discovery_models.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_discovery_providers.dart';
import 'package:nexago_app/features/tournaments/presentation/tournament_discovery_page.dart';

import '../../support/recording_analytics.dart';

DiscoveryTournament _tournament(String id, {int liveMatches = 0}) {
  return DiscoveryTournament(
    id: id,
    name: 'Torneio $id',
    location: 'Arena',
    city: 'Goiânia',
    dateLabel: '28 mai',
    startDate: DateTime(2026, 12, 5),
    categories: const [TournamentGenderCat.m],
    format: TournamentFormat.dupla,
    priceLabel: r'R$ 100',
    priceValue: 100,
    spotsLeft: 10,
    spotsTotal: 20,
    status: TournamentListingStatus.open,
    featured: false,
    enrolledCount: 0,
    liveMatchesNow: liveMatches,
  );
}

const _ranking = CompeteHubUserRanking(
  rank: 12,
  seasonLabel: 'TEMPORADA 2026',
  subtitle: '',
  points: 340,
  tournamentsCount: 3,
);

Future<GoRouter> _pumpHub(
  WidgetTester tester, {
  required Stream<List<DiscoveryTournament>> tournaments,
  required Future<CompeteHubUserRanking?> ranking,
}) async {
  await tester.binding.setSurfaceSize(const Size(430, 1400));
  addTearDown(() => tester.binding.setSurfaceSize(null));

  GoRoute stub(String path, String name) => GoRoute(
        path: path,
        name: name,
        builder: (_, state) => Scaffold(body: Text('rota $name ${state.uri}')),
      );

  final router = GoRouter(
    routes: [
      GoRoute(
        path: '/',
        builder: (_, __) => const Scaffold(body: TournamentDiscoveryPage()),
      ),
      stub(AppRoutes.tournamentDiscoveryList,
          AppRouteNames.tournamentDiscoveryList),
      stub(AppRoutes.athleteDiscover, AppRouteNames.athleteDiscover),
      stub(AppRoutes.teamDiscover, AppRouteNames.teamDiscover),
      stub(AppRoutes.organizersDirectory, AppRouteNames.organizersDirectory),
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
        discoveryTournamentsProvider.overrideWith((ref) => tournaments),
        competeHubUserRankingProvider.overrideWith((ref) => ranking),
      ],
      child: MaterialApp.router(theme: AppTheme.dark, routerConfig: router),
    ),
  );
  await tester.pump();
  return router;
}

void main() {
  testWidgets('cards de Torneios e Ranking mostram o dado ao vivo',
      (tester) async {
    await _pumpHub(
      tester,
      tournaments: Stream.value([
        _tournament('a'),
        _tournament('b'),
        _tournament('c', liveMatches: 2),
      ]),
      ranking: Future.value(_ranking),
    );
    await tester.pump();

    expect(find.text('3 abertas · 2 jogos ao vivo'), findsOneWidget);
    expect(find.text('#12 na temporada · 340 pts'), findsOneWidget);
  });

  testWidgets('carregando, os cards ficam com o texto padrão', (tester) async {
    final neverTournaments = StreamController<List<DiscoveryTournament>>();
    addTearDown(neverTournaments.close);
    final neverRanking = Completer<CompeteHubUserRanking?>();

    await _pumpHub(
      tester,
      tournaments: neverTournaments.stream,
      ranking: neverRanking.future,
    );

    expect(find.text(competeHubTournamentsFallbackDescription), findsOneWidget);
    expect(find.text(competeHubRankingFallbackDescription), findsOneWidget);
    // Nunca "nada aberto" só porque a lista ainda não chegou.
    expect(find.text(competeHubTournamentsIdleDescription), findsNothing);
  });

  group('busca do Hub', () {
    testWidgets('a lupa pergunta o que buscar entre as seções do Hub',
        (tester) async {
      await _pumpHub(
        tester,
        tournaments: Stream.value(const []),
        ranking: Future.value(null),
      );

      await tester.tap(find.byTooltip('Buscar no Hub'));
      await tester.pumpAndSettle();

      expect(find.text('O que você procura?'), findsOneWidget);
      for (final label in ['Atletas', 'Equipes', 'Organizadores']) {
        expect(
          find.descendant(
            of: find.byType(BottomSheet),
            matching: find.text(label),
          ),
          findsOneWidget,
        );
      }
    });

    testWidgets('escolher Atletas abre a busca de atletas', (tester) async {
      await _pumpHub(
        tester,
        tournaments: Stream.value(const []),
        ranking: Future.value(null),
      );

      await tester.tap(find.byTooltip('Buscar no Hub'));
      await tester.pumpAndSettle();
      await tester.tap(
        find.descendant(
          of: find.byType(BottomSheet),
          matching: find.text('Atletas'),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.textContaining('rota athleteDiscover'), findsOneWidget);
    });

    testWidgets('escolher Torneios abre a lista já com a busca aberta',
        (tester) async {
      await _pumpHub(
        tester,
        tournaments: Stream.value(const []),
        ranking: Future.value(null),
      );

      await tester.tap(find.byTooltip('Buscar no Hub'));
      await tester.pumpAndSettle();
      await tester.tap(
        find.descendant(
          of: find.byType(BottomSheet),
          matching: find.text('Torneios e ligas'),
        ),
      );
      await tester.pumpAndSettle();

      expect(
        find.textContaining('rota tournamentDiscoveryList'),
        findsOneWidget,
      );
      expect(find.textContaining('search=1'), findsOneWidget);
    });
  });
}
