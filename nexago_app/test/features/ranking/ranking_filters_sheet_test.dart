import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/features/ranking/domain/ranking_list_models.dart';
import 'package:nexago_app/features/ranking/presentation/widgets/ranking_filters_sheet.dart';

/// A folha reúne quatro recortes que antes eram quatro folhas separadas — o
/// risco novo é de altura, não de lógica: em tela curta com fonte ampliada ela
/// precisa rolar em vez de estourar.
void main() {
  RankingPageFilter? applied;

  /// `setSurfaceSize` muda só a área pintada: o `MediaQuery` continua no
  /// 800x600 padrão, e é dele que saem os tetos de altura das folhas. Mexer na
  /// view acerta os dois.
  void useScreen(WidgetTester tester, Size size) {
    tester.view.devicePixelRatio = 1.0;
    tester.view.physicalSize = size;
    addTearDown(tester.view.reset);
  }

  Future<void> pumpSheet(
    WidgetTester tester, {
    required RankingPageFilter initial,
    Size surface = const Size(390, 844),
    double textScale = 1.0,
  }) async {
    applied = null;
    useScreen(tester, surface);
    tester.platformDispatcher.textScaleFactorTestValue = textScale;
    addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);

    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.dark,
        home: Scaffold(
          body: Builder(
            builder: (context) => Center(
              child: TextButton(
                onPressed: () async {
                  applied = await showRankingFiltersSheet(
                    context: context,
                    initial: initial,
                    yearOptions: const [2026, 2025, 2024],
                  );
                },
                child: const Text('abrir'),
              ),
            ),
          ),
        ),
      ),
    );

    await tester.tap(find.text('abrir'));
    await tester.pumpAndSettle();
  }

  /// A folha rola: opção fora da dobra precisa entrar em cena antes do toque.
  Future<void> tapOption(WidgetTester tester, String label) async {
    await tester.ensureVisible(find.text(label));
    await tester.pumpAndSettle();
    await tester.tap(find.text(label));
    await tester.pump();
  }

  testWidgets('no modo equipes traz as quatro seções', (tester) async {
    await pumpSheet(
      tester,
      initial: const RankingPageFilter(mode: RankingListMode.teams),
    );

    expect(find.text('TEMPORADA'), findsOneWidget);
    expect(find.text('GÊNERO'), findsOneWidget);
    expect(find.text('NÍVEL'), findsOneWidget);
    expect(find.text('FORMATO'), findsOneWidget);
  });

  testWidgets('aplicar devolve o rascunho e preserva o modo', (tester) async {
    await pumpSheet(
      tester,
      initial: const RankingPageFilter(mode: RankingListMode.teams),
    );

    await tapOption(tester, '2025');
    await tapOption(tester, 'Misto');
    await tapOption(tester, 'Quarteto');
    await tester.tap(find.text('Aplicar filtros'));
    await tester.pumpAndSettle();

    expect(applied, isNotNull);
    expect(applied!.year, 2025);
    expect(applied!.gender, RankingGenderFilter.mixed);
    expect(applied!.format, RankingFormatFilter.quarteto);
    expect(applied!.mode, RankingListMode.teams);
  });

  testWidgets('fechar sem aplicar devolve null', (tester) async {
    await pumpSheet(tester, initial: const RankingPageFilter());

    await tapOption(tester, 'Feminino');
    await tester.tapAt(const Offset(10, 10));
    await tester.pumpAndSettle();

    expect(applied, isNull);
  });

  testWidgets('no modo individual o formato volta para all', (tester) async {
    await pumpSheet(
      tester,
      // Estado herdado de uma sessão em equipes: sem seção pra corrigir, a
      // folha não pode devolver um recorte invisível que esvazia a lista.
      initial: const RankingPageFilter(format: RankingFormatFilter.trio),
    );

    expect(find.text('FORMATO'), findsNothing);
    await tester.tap(find.text('Aplicar filtros'));
    await tester.pumpAndSettle();

    expect(applied!.format, RankingFormatFilter.all);
  });

  testWidgets('limpar só apaga os recortes', (tester) async {
    await pumpSheet(
      tester,
      initial: const RankingPageFilter(
        mode: RankingListMode.teams,
        year: 2024,
        gender: RankingGenderFilter.female,
        level: RankingLevelFilter.open,
        format: RankingFormatFilter.quinteto,
      ),
    );

    await tapOption(tester, 'Limpar');
    await tester.tap(find.text('Aplicar filtros'));
    await tester.pumpAndSettle();

    expect(applied!.year, isNull);
    expect(applied!.gender, RankingGenderFilter.all);
    expect(applied!.level, RankingLevelFilter.all);
    expect(applied!.format, RankingFormatFilter.all);
    expect(applied!.mode, RankingListMode.teams);
  });

  testWidgets('em tela curta com fonte ampliada rola em vez de quebrar',
      (tester) async {
    await pumpSheet(
      tester,
      initial: const RankingPageFilter(mode: RankingListMode.teams),
      surface: const Size(375, 667),
      textScale: 1.5,
    );

    expect(tester.takeException(), isNull);

    // A última seção só é alcançável rolando — e o botão de aplicar não sai
    // da tela junto com ela.
    await tapOption(tester, 'Quinteto');
    expect(tester.takeException(), isNull);

    await tester.tap(find.text('Aplicar filtros'));
    await tester.pumpAndSettle();

    expect(applied!.format, RankingFormatFilter.quinteto);
  });
}
