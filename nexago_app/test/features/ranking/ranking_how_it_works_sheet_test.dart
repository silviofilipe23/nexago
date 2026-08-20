import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/features/ranking/presentation/widgets/ranking_how_it_works_sheet.dart';

/// O conteúdo da folha é mais alto que qualquer celular: onze linhas de
/// pontuação, sete de peso, dois cards e três parágrafos. Sem teto e sem
/// rolagem ela crescia além do topo da tela e cortava nas duas pontas.
void main() {
  /// `setSurfaceSize` muda só a área pintada: o `MediaQuery` continua no
  /// 800x600 padrão, e é dele que saem os tetos de altura das folhas. Mexer na
  /// view acerta os dois.
  void useScreen(WidgetTester tester, Size size) {
    tester.view.devicePixelRatio = 1.0;
    tester.view.physicalSize = size;
    addTearDown(tester.view.reset);
  }

  Future<void> openSheet(
    WidgetTester tester, {
    Size surface = const Size(390, 844),
    double textScale = 1.0,
  }) async {
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
                onPressed: () => showRankingHowItWorksSheet(context),
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

  testWidgets('cabe na tela e não estoura', (tester) async {
    await openSheet(tester);

    expect(find.text('Como funciona o ranking'), findsOneWidget);
    expect(tester.takeException(), isNull);

    final sheet = tester.getRect(find.text('Como funciona o ranking'));
    expect(sheet.top, greaterThanOrEqualTo(0));
  });

  testWidgets('o fim do conteúdo é alcançável rolando', (tester) async {
    await openSheet(tester);

    final scrollable = find.byType(Scrollable).last;
    await tester.scrollUntilVisible(
      find.textContaining('Ligas podem ajustar a tabela de pontos.'),
      200,
      scrollable: scrollable,
    );

    expect(tester.takeException(), isNull);
  });

  testWidgets('em tela curta com fonte ampliada continua rolável',
      (tester) async {
    await openSheet(
      tester,
      surface: const Size(375, 667),
      textScale: 1.5,
    );

    expect(tester.takeException(), isNull);

    // O título fica fixo no topo enquanto o corpo rola.
    final titleBefore = tester.getRect(find.text('Como funciona o ranking'));
    await tester.scrollUntilVisible(
      find.text('PESOS POR CATEGORIA'),
      200,
      scrollable: find.byType(Scrollable).last,
    );
    final titleAfter = tester.getRect(find.text('Como funciona o ranking'));

    expect(titleAfter.top, titleBefore.top);
    expect(tester.takeException(), isNull);
  });
}
