import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:nexago_app/core/router/routes.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/features/athlete/presentation/widgets/athlete_home/athlete_home_shortcuts_grid.dart';
import 'package:nexago_app/features/athlete_training/application/athlete_training_providers.dart';
import 'package:nexago_app/features/squad/application/squad_providers.dart';
import 'package:nexago_app/features/squad/domain/squad_models.dart';

import '../squad/squad_test_support.dart';

Widget _harness({
  int trainingBadge = 0,
  VoidCallback? onReserve,
  MySquad squad = MySquad.none,
}) {
  final router = GoRouter(
    routes: [
      GoRoute(
        path: '/',
        builder: (_, __) => Scaffold(
          body: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 20),
            child: AthleteHomeShortcutsGrid(
              onReserveTap: onReserve ?? () {},
            ),
          ),
        ),
      ),
      GoRoute(
        path: AppRoutes.athleteRanking,
        name: AppRouteNames.athleteRanking,
        builder: (_, __) => const Text('RANKING'),
      ),
      GoRoute(
        path: AppRoutes.athleteTrainings,
        name: AppRouteNames.athleteTrainings,
        builder: (_, __) => const Text('TREINOS'),
      ),
      GoRoute(
        path: AppRoutes.myTournaments,
        name: AppRouteNames.myTournaments,
        builder: (_, __) => const Text('MEUS TORNEIOS'),
      ),
      GoRoute(
        path: AppRoutes.squad,
        name: AppRouteNames.squad,
        builder: (_, __) => const Text('SQUAD'),
      ),
      GoRoute(
        path: AppRoutes.squadInvite,
        name: AppRouteNames.squadInvite,
        builder: (_, state) =>
            Text('CONVITE ${state.pathParameters['inviteId']}'),
      ),
    ],
  );
  return ProviderScope(
    overrides: [
      athleteTrainingNewFeedbackCountProvider.overrideWithValue(trainingBadge),
      squadEntryProvider.overrideWithValue(squad),
    ],
    child: MaterialApp.router(theme: AppTheme.dark, routerConfig: router),
  );
}

void main() {
  testWidgets('quatro atalhos na ordem, sem Torneios nem Squad', (
    tester,
  ) async {
    await tester.pumpWidget(_harness());

    final labels = [
      'Reservar',
      'Ranking',
      'Treinos',
      'Meus torneios',
    ];
    final xs = [for (final l in labels) tester.getCenter(find.text(l)).dx];
    expect(xs, orderedEquals([...xs]..sort()));
    expect(find.text('Bora Jogar'), findsNothing);
    expect(find.text('Torneios'), findsNothing);
    expect(find.byKey(const Key('home-shortcut-squad')), findsNothing);
    expect(tester.takeException(), isNull);
  });

  testWidgets('Treinos mostra o selo só com novidade', (tester) async {
    await tester.pumpWidget(_harness());
    expect(
        find.byKey(const Key('home-shortcut-trainings-badge')), findsNothing);

    await tester.pumpWidget(_harness(trainingBadge: 2));
    await tester.pumpAndSettle();
    expect(
      find.byKey(const Key('home-shortcut-trainings-badge')),
      findsOneWidget,
    );
    expect(find.text('2'), findsOneWidget);
  });

  testWidgets('Reservar troca de aba', (tester) async {
    var reserve = 0;
    await tester.pumpWidget(_harness(onReserve: () => reserve++));
    await tester.tap(find.byKey(const Key('home-shortcut-reserve')));
    expect(reserve, 1);
  });

  testWidgets('embaixador: Squad no fim da linha, abre o Squad', (
    tester,
  ) async {
    await tester.pumpWidget(_harness(squad: memberSquad()));

    final squadX = tester.getCenter(find.text('Squad')).dx;
    final myX = tester.getCenter(find.text('Meus torneios')).dx;
    expect(squadX, greaterThan(myX));
    expect(find.byKey(const Key('home-shortcut-squad-badge')), findsNothing);

    await tester.tap(find.byKey(const Key('home-shortcut-squad')));
    await tester.pumpAndSettle();
    expect(find.text('SQUAD'), findsOneWidget);
  });

  testWidgets('convidado: Squad com selo, abre o convite', (tester) async {
    await tester.pumpWidget(_harness(squad: inviteSquad(id: 'inv-9')));

    expect(find.byKey(const Key('home-shortcut-squad-badge')), findsOneWidget);
    await tester.tap(find.byKey(const Key('home-shortcut-squad')));
    await tester.pumpAndSettle();
    expect(find.text('CONVITE inv-9'), findsOneWidget);
  });

  testWidgets('Ranking abre o ranking', (tester) async {
    await tester.pumpWidget(_harness());
    await tester.tap(find.byKey(const Key('home-shortcut-ranking')));
    await tester.pumpAndSettle();
    expect(find.text('RANKING'), findsOneWidget);
  });

  testWidgets('Treinos abre Meus treinos', (tester) async {
    await tester.pumpWidget(_harness());
    await tester.tap(find.byKey(const Key('home-shortcut-trainings')));
    await tester.pumpAndSettle();
    expect(find.text('TREINOS'), findsOneWidget);
  });

  testWidgets('Meus torneios abre a lista de torneios do atleta', (
    tester,
  ) async {
    await tester.pumpWidget(_harness());
    await tester.tap(find.byKey(const Key('home-shortcut-my-tournaments')));
    await tester.pumpAndSettle();
    expect(find.text('MEUS TORNEIOS'), findsOneWidget);
  });

  for (final width in [320.0, 375.0]) {
    testWidgets('com a Sora em ${width.toInt()}px nenhum rótulo é cortado',
        (tester) async {
      final sora = FontLoader('Sora')
        ..addFont(rootBundle.load('assets/fonts/Sora/Sora-Variable.ttf'));
      await sora.load();
      tester.view.physicalSize = Size(width, 640);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.reset);
      // Pior caso de largura: cinco tiles (com o Squad).
      await tester.pumpWidget(
        _harness(trainingBadge: 2, squad: memberSquad()),
      );

      for (final label in [
        'Reservar',
        'Ranking',
        'Treinos',
        'Meus torneios',
        'Squad',
      ]) {
        final text = tester.widget<Text>(find.text(label));
        final box = tester.renderObject<RenderParagraph>(find.text(label));
        expect(
          box.didExceedMaxLines,
          isFalse,
          reason: '"$label" não pode ficar com reticências',
        );
        expect(text.maxLines, 2);
      }
      expect(tester.takeException(), isNull);
    });
  }

  testWidgets('cabe em tela estreita (320px) sem overflow', (tester) async {
    tester.view.physicalSize = const Size(320, 640);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    await tester.pumpWidget(_harness(trainingBadge: 12));
    expect(tester.takeException(), isNull);
    expect(find.text('9+'), findsOneWidget);
  });
}
