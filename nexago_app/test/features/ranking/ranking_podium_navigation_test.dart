import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:nexago_app/core/router/routes.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/features/ranking/domain/ranking_list_models.dart';
import 'package:nexago_app/features/ranking/domain/ranking_providers.dart';
import 'package:nexago_app/features/ranking/presentation/athlete_ranking_page.dart';

/// O pódio do ranking abre o mesmo perfil que as linhas de baixo — antes o
/// toque só valia no modo atletas e as três primeiras equipes ficavam mudas.
void main() {
  late ProviderContainer container;

  RankingListEntry team(int rank, String id) => RankingListEntry(
        rank: rank,
        points: 100 - rank,
        tournamentsCount: 3,
        displayName: 'Equipe $rank',
        subtitle: 'Beach tennis',
        isCurrentUser: false,
        entityId: id,
        player1Initials: 'AA',
        player2Initials: 'BB',
      );

  RankingListEntry athlete(int rank, String id) => RankingListEntry(
        rank: rank,
        points: 100 - rank,
        tournamentsCount: 3,
        displayName: 'Atleta $rank',
        subtitle: 'Beach tennis',
        isCurrentUser: false,
        entityId: id,
        initials: 'AA',
      );

  /// `setSurfaceSize` muda só a área pintada: a view acerta também o
  /// `MediaQuery`, de onde saem as alturas da tela.
  void useScreen(WidgetTester tester, Size size) {
    tester.view.devicePixelRatio = 1.0;
    tester.view.physicalSize = size;
    addTearDown(tester.view.reset);
  }

  Future<void> pumpPage(
    WidgetTester tester, {
    required List<RankingListEntry> entries,
    required RankingListMode mode,
  }) async {
    useScreen(tester, const Size(390, 844));

    container = ProviderContainer(overrides: [
      rankingListEntriesProvider.overrideWith((ref) async => entries),
    ]);
    addTearDown(container.dispose);
    container.read(rankingPageFilterProvider.notifier).state =
        RankingPageFilter(mode: mode);

    final router = GoRouter(
      initialLocation: '/ranking',
      routes: [
        GoRoute(
          path: '/ranking',
          builder: (_, __) => const AthleteRankingPage(),
        ),
        GoRoute(
          path: AppRoutes.teamProfile,
          name: AppRouteNames.teamProfile,
          builder: (_, state) =>
              Scaffold(body: Text('equipe ${state.pathParameters['teamId']}')),
        ),
        GoRoute(
          path: AppRoutes.athleteProfile,
          name: AppRouteNames.athleteProfile,
          builder: (_, state) => Scaffold(
            body: Text('atleta ${state.uri.queryParameters['userId']}'),
          ),
        ),
      ],
    );
    addTearDown(router.dispose);

    await tester.pumpWidget(
      UncontrolledProviderScope(
        container: container,
        child: MaterialApp.router(
          theme: AppTheme.dark,
          routerConfig: router,
        ),
      ),
    );
    await tester.pumpAndSettle();
  }

  testWidgets('toque no pódio de equipes abre o perfil da equipe',
      (tester) async {
    await pumpPage(
      tester,
      entries: [team(1, 'time-1'), team(2, 'time-2'), team(3, 'time-3')],
      mode: RankingListMode.teams,
    );

    await tester.tap(find.text('Equipe 1'));
    await tester.pumpAndSettle();

    expect(find.text('equipe time-1'), findsOneWidget);
  });

  testWidgets('o 2º e o 3º do pódio também abrem o perfil', (tester) async {
    await pumpPage(
      tester,
      entries: [team(1, 'time-1'), team(2, 'time-2'), team(3, 'time-3')],
      mode: RankingListMode.teams,
    );

    await tester.tap(find.text('Equipe 3'));
    await tester.pumpAndSettle();

    expect(find.text('equipe time-3'), findsOneWidget);
  });

  testWidgets('o pódio de atletas continua abrindo o perfil do atleta',
      (tester) async {
    await pumpPage(
      tester,
      entries: [athlete(1, 'uid-1'), athlete(2, 'uid-2'), athlete(3, 'uid-3')],
      mode: RankingListMode.athletes,
    );

    await tester.tap(find.text('Atleta 1'));
    await tester.pumpAndSettle();

    expect(find.text('atleta uid-1'), findsOneWidget);
  });
}
