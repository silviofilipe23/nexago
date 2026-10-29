import 'package:firebase_auth_mocks/firebase_auth_mocks.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/auth/auth_providers.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/features/ranking/domain/ranking_list_models.dart';
import 'package:nexago_app/features/ranking/domain/ranking_providers.dart';
import 'package:nexago_app/features/ranking/presentation/athlete_ranking_page.dart';

/// Testa o contrato de filtros da página sem tocar Firestore: a lista de
/// entradas é substituída por uma vazia e só o estado do filtro é exercitado.
///
/// Depois que ano/gênero/nível/formato saíram da tela, todo ajuste passa pela
/// folha única — é por lá que os testes escrevem.
void main() {
  late ProviderContainer container;

  /// `setSurfaceSize` muda só a área pintada: o `MediaQuery` continua no
  /// 800x600 padrão, e é dele que saem os tetos de altura das folhas. Mexer na
  /// view acerta os dois.
  void useScreen(WidgetTester tester, Size size) {
    tester.view.devicePixelRatio = 1.0;
    tester.view.physicalSize = size;
    addTearDown(tester.view.reset);
  }

  Future<void> pumpPage(WidgetTester tester) async {
    useScreen(tester, const Size(390, 844));

    container = ProviderContainer(overrides: [
      rankingListEntriesProvider
          .overrideWith((ref) async => const <RankingListEntry>[]),
      rankingSportProvider.overrideWith((ref) async => 'VOLEI_PRAIA'),
      authProvider.overrideWith((ref) => Stream.value(MockUser(uid: 'u1'))),
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

  /// O ícone troca conforme haja recorte ativo — abre pelo que estiver na tela.
  Future<void> openFilters(WidgetTester tester) async {
    final tune = find.byIcon(Icons.tune_rounded);
    await tester.tap(
      tune.evaluate().isEmpty ? find.byIcon(Icons.filter_alt_rounded) : tune,
    );
    await tester.pumpAndSettle();
  }

  /// A folha rola: opção fora da dobra precisa entrar em cena antes do toque,
  /// senão o `tap` acerta o que estiver naquele ponto da tela. Procura só
  /// dentro da folha: os chips da tela repetem os rótulos ("Limpar", "Open").
  Future<void> tapOption(WidgetTester tester, String label) async {
    final option = find.descendant(
      of: find.byType(BottomSheet),
      matching: find.text(label),
    );
    await tester.ensureVisible(option);
    await tester.pumpAndSettle();
    await tester.tap(option);
    await tester.pump();
  }

  Future<void> apply(WidgetTester tester) async {
    await tester.tap(find.text('Aplicar filtros'));
    await tester.pumpAndSettle();
  }

  testWidgets('legenda do recorte mostra o esporte e a temporada, mesmo vazia',
      (tester) async {
    await pumpPage(tester);
    expect(
      find.text('Vôlei de praia · ${DateTime.now().year}'),
      findsOneWidget,
    );

    await setFilter(tester, filter().copyWith(year: () => null));
    expect(find.text('Vôlei de praia · Geral'), findsOneWidget);
  });

  testWidgets('a tela só mostra o segmento — os recortes moram na folha',
      (tester) async {
    await pumpPage(tester);

    expect(find.text('Equipes'), findsOneWidget);
    expect(find.text('Atletas'), findsOneWidget);

    // Ano, nível e formato não têm mais controle solto no corpo da tela.
    expect(find.text('Geral'), findsNothing);
    expect(find.text('Todos os níveis'), findsNothing);
    expect(find.text('Todos os formatos'), findsNothing);
  });

  testWidgets('aplicar grava temporada e nível numa passada só',
      (tester) async {
    await pumpPage(tester);
    await openFilters(tester);

    await tapOption(tester, 'Geral');
    await tapOption(tester, 'Avançado');
    await apply(tester);

    expect(filter().year, isNull);
    expect(filter().level, RankingLevelFilter.avancado);
  });

  testWidgets('fechar sem aplicar não mexe no filtro', (tester) async {
    await pumpPage(tester);
    await openFilters(tester);

    await tapOption(tester, 'Feminino');

    // Toque na barreira acima da folha: descarta o rascunho.
    await tester.tapAt(const Offset(10, 10));
    await tester.pumpAndSettle();

    expect(filter().gender, RankingGenderFilter.all);
  });

  testWidgets('seção de formato só existe no modo equipes', (tester) async {
    await pumpPage(tester);

    await openFilters(tester);
    expect(find.text('FORMATO'), findsNothing);
    await apply(tester);

    await tester.tap(find.text('Equipes'));
    await tester.pumpAndSettle();

    await openFilters(tester);
    expect(find.text('FORMATO'), findsOneWidget);
    await tapOption(tester, 'Trio');
    await apply(tester);

    expect(filter().format, RankingFormatFilter.trio);
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

    await tester.tap(find.text('Atletas'));
    await tester.pumpAndSettle();

    expect(filter().mode, RankingListMode.athletes);
    expect(filter().format, RankingFormatFilter.all);
  });

  testWidgets('limpar zera os recortes e preserva o modo', (tester) async {
    await pumpPage(tester);
    await setFilter(
      tester,
      RankingPageFilter(
        mode: RankingListMode.teams,
        year: DateTime.now().year,
        gender: RankingGenderFilter.female,
        level: RankingLevelFilter.open,
        format: RankingFormatFilter.quinteto,
      ),
    );

    await openFilters(tester);
    await tapOption(tester, 'Limpar');
    await apply(tester);

    expect(filter().year, isNull);
    expect(filter().gender, RankingGenderFilter.all);
    expect(filter().level, RankingLevelFilter.all);
    expect(filter().format, RankingFormatFilter.all);
    expect(filter().mode, RankingListMode.teams);
  });

  testWidgets('o ícone da barra avisa que a lista está recortada',
      (tester) async {
    await pumpPage(tester);
    expect(find.byIcon(Icons.tune_rounded), findsOneWidget);
    expect(find.byIcon(Icons.filter_alt_rounded), findsNothing);

    await setFilter(
      tester,
      const RankingPageFilter(gender: RankingGenderFilter.female),
    );

    expect(find.byIcon(Icons.filter_alt_rounded), findsOneWidget);
    expect(find.byIcon(Icons.tune_rounded), findsNothing);
  });

  testWidgets('filtro ligado vira chip; o × tira só ele', (tester) async {
    await pumpPage(tester);
    await setFilter(
      tester,
      filter().copyWith(
        gender: RankingGenderFilter.female,
        level: RankingLevelFilter.open,
      ),
    );

    expect(find.text('Feminino'), findsOneWidget);
    expect(find.text('Open'), findsOneWidget);

    await tester.tap(find.text('Feminino'));
    await tester.pumpAndSettle();

    expect(filter().gender, RankingGenderFilter.all);
    expect(filter().level, RankingLevelFilter.open);
    expect(find.text('Feminino'), findsNothing);
    // Um filtro só: o × dele basta, sem "Limpar".
    expect(find.byKey(const Key('ranking-filter-chips-clear')), findsNothing);
  });

  testWidgets('"Limpar" dos chips preserva temporada e modo', (tester) async {
    await pumpPage(tester);
    await setFilter(
      tester,
      RankingPageFilter(
        mode: RankingListMode.teams,
        year: 2025,
        gender: RankingGenderFilter.male,
        format: RankingFormatFilter.trio,
      ),
    );

    await tester.tap(find.byKey(const Key('ranking-filter-chips-clear')));
    await tester.pumpAndSettle();

    expect(filter().gender, RankingGenderFilter.all);
    expect(filter().format, RankingFormatFilter.all);
    expect(filter().year, 2025);
    expect(filter().mode, RankingListMode.teams);
  });

  testWidgets('o botão de compartilhar abre a folha com o recorte da tela',
      (tester) async {
    await pumpPage(tester);
    await setFilter(
      tester,
      filter().copyWith(gender: RankingGenderFilter.mixed),
    );

    await tester.tap(find.byIcon(Icons.ios_share_rounded));
    await tester.pumpAndSettle();

    expect(find.text('Compartilhar ranking'), findsOneWidget);
    // No chip de "Filtros incluídos" (a prévia vazia não tem arte).
    expect(
      find.descendant(
        of: find.byType(BottomSheet),
        matching: find.text('Misto'),
      ),
      findsOneWidget,
    );
    expect(find.textContaining('Ninguém pontuou'), findsOneWidget);
  });
}
