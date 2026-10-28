import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/features/ranking/domain/ranking_list_models.dart';
import 'package:nexago_app/features/ranking/domain/ranking_providers.dart';
import 'package:nexago_app/features/ranking/presentation/athlete_ranking_page.dart';
import 'package:nexago_app/features/ranking/presentation/widgets/ranking_list_tile.dart';

/// O cartão "Sua posição" flutua no rodapé por cima das outras linhas: com a
/// tinta translúcida do realce, o nome e os pontos de quem passava por baixo
/// vazavam através dele. Na lista o realce continua translúcido.
void main() {
  const userRank = 25;

  RankingListEntry athlete(int rank) => RankingListEntry(
        rank: rank,
        points: 1000 - rank,
        tournamentsCount: 3,
        displayName: 'Atleta $rank',
        subtitle: 'Vôlei de praia',
        isCurrentUser: rank == userRank,
        entityId: 'a$rank',
        initials: 'AA',
      );

  Future<void> pumpPage(WidgetTester tester, ThemeData theme) async {
    tester.view.devicePixelRatio = 1.0;
    tester.view.physicalSize = const Size(390, 844);
    addTearDown(tester.view.reset);

    final container = ProviderContainer(overrides: [
      rankingListEntriesProvider.overrideWith(
        (ref) async => [for (var rank = 1; rank <= 40; rank++) athlete(rank)],
      ),
      rankingSportProvider.overrideWith((ref) async => 'VOLEI_PRAIA'),
    ]);
    addTearDown(container.dispose);

    await tester.pumpWidget(
      UncontrolledProviderScope(
        container: container,
        child: MaterialApp(theme: theme, home: const AthleteRankingPage()),
      ),
    );
    await tester.pumpAndSettle();
  }

  Finder floatingCard() => find.descendant(
        of: find.byType(Positioned),
        matching: find.byType(RankingUserHighlightTile),
      );

  /// Fundo do realce: o primeiro `DecoratedBox` dentro do tile.
  Color highlightColor(WidgetTester tester, Finder tile) {
    final box = tester.widget<DecoratedBox>(
      find.descendant(of: tile, matching: find.byType(DecoratedBox)).first,
    );
    return (box.decoration as BoxDecoration).color!;
  }

  for (final (label, theme) in [
    ('escuro', AppTheme.dark),
    ('claro', AppTheme.light),
  ]) {
    testWidgets('cartão flutuante tem fundo opaco no tema $label',
        (tester) async {
      await pumpPage(tester, theme);

      expect(floatingCard(), findsOneWidget);
      final color = highlightColor(tester, floatingCard());
      expect(color.a, 1.0);
      // Mesma cor que a linha translúcida mostra por cima do fundo da tela.
      expect(
        color,
        Color.alphaBlend(
          AppColors.brand.withValues(alpha: 0.08),
          theme.colorScheme.surfaceContainerLowest,
        ),
      );
    });
  }

  testWidgets('linha fixa na lista mantém o realce translúcido',
      (tester) async {
    await pumpPage(tester, AppTheme.dark);

    // Passos curtos: o cartão só volta pra lista quando a âncora entra na tela,
    // e um arrasto longo passaria por ela sem construí-la.
    for (var i = 0; i < 20 && floatingCard().evaluate().isNotEmpty; i++) {
      await tester.drag(find.byType(ListView), const Offset(0, -200));
      await tester.pumpAndSettle();
    }

    expect(floatingCard(), findsNothing);
    final inList = find.byType(RankingUserHighlightTile);
    expect(inList, findsOneWidget);
    expect(
      highlightColor(tester, inList),
      AppColors.brand.withValues(alpha: 0.08),
    );
  });
}
