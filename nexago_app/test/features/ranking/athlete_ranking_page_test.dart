import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/features/ranking/domain/ranking_list_models.dart';
import 'package:nexago_app/features/ranking/domain/ranking_providers.dart';
import 'package:nexago_app/features/ranking/presentation/athlete_ranking_page.dart';
import 'package:nexago_app/features/ranking/presentation/widgets/ranking_format_filter_chip.dart';

/// Testa o contrato de filtros da página sem tocar Firestore: a lista de
/// entradas é substituída por uma vazia e só o estado do filtro é exercitado.
void main() {
  late ProviderContainer container;

  Future<void> pumpPage(WidgetTester tester) async {
    container = ProviderContainer(overrides: [
      rankingListEntriesProvider
          .overrideWith((ref) async => const <RankingListEntry>[]),
    ]);
    addTearDown(container.dispose);

    await tester.pumpWidget(
      UncontrolledProviderScope(
        container: container,
        child: MaterialApp(
          theme: AppTheme.dark,
          home: const AthleteRankingPage(),
        ),
      ),
    );
    await tester.pumpAndSettle();
  }

  RankingPageFilter filter() => container.read(rankingPageFilterProvider);

  Future<void> setFilter(WidgetTester tester, RankingPageFilter value) async {
    container.read(rankingPageFilterProvider.notifier).state = value;
    await tester.pumpAndSettle();
  }

  testWidgets('chip de formato só aparece no modo equipes', (tester) async {
    await pumpPage(tester);

    // Default da página: modo individual — sem chip de formato.
    expect(filter().mode, RankingListMode.athletes);
    expect(find.byType(RankingFormatFilterChip), findsNothing);

    await setFilter(
      tester,
      RankingPageFilter(
        mode: RankingListMode.teams,
        year: DateTime.now().year,
      ),
    );

    expect(find.byType(RankingFormatFilterChip), findsOneWidget);
    expect(find.text('Todos os formatos'), findsOneWidget);
  });

  testWidgets('trocar para o modo individual reseta o formato para all',
      (tester) async {
    await pumpPage(tester);
    await setFilter(
      tester,
      RankingPageFilter(
        mode: RankingListMode.teams,
        year: DateTime.now().year,
        format: RankingFormatFilter.trio,
      ),
    );
    expect(find.text('Trio'), findsOneWidget);

    await tester.tap(find.text('Atletas'));
    await tester.pumpAndSettle();

    expect(filter().mode, RankingListMode.athletes);
    expect(filter().format, RankingFormatFilter.all);
    expect(find.byType(RankingFormatFilterChip), findsNothing);
  });

  testWidgets('trocar o ano preserva formato e gênero escolhidos',
      (tester) async {
    await pumpPage(tester);
    await setFilter(
      tester,
      RankingPageFilter(
        mode: RankingListMode.teams,
        year: DateTime.now().year,
        gender: RankingGenderFilter.female,
        format: RankingFormatFilter.quinteto,
      ),
    );

    await tester.tap(find.text('Geral'));
    await tester.pumpAndSettle();

    expect(filter().year, isNull);
    expect(filter().mode, RankingListMode.teams);
    expect(filter().format, RankingFormatFilter.quinteto);
    expect(filter().gender, RankingGenderFilter.female);
    expect(find.text('Quinteto'), findsOneWidget);
  });
}
