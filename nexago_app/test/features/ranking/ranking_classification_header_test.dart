import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/features/ranking/domain/ranking_list_models.dart';
import 'package:nexago_app/features/ranking/presentation/widgets/ranking_classification_header.dart';

/// Com os chips de ano fora da tela, este cabeçalho é o único lugar que diz
/// qual temporada está aberta.
void main() {
  /// `setSurfaceSize` muda só a área pintada: o `MediaQuery` continua no
  /// 800x600 padrão, e é dele que saem os tetos de altura das folhas. Mexer na
  /// view acerta os dois.
  void useScreen(WidgetTester tester, Size size) {
    tester.view.devicePixelRatio = 1.0;
    tester.view.physicalSize = size;
    addTearDown(tester.view.reset);
  }

  Future<void> pumpHeader(
    WidgetTester tester,
    Widget header, {
    Size surface = const Size(375, 667),
    double textScale = 1.0,
  }) async {
    useScreen(tester, surface);
    tester.platformDispatcher.textScaleFactorTestValue = textScale;
    addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);

    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.dark,
        home:
            Scaffold(body: Padding(padding: EdgeInsets.all(20), child: header)),
      ),
    );
    await tester.pumpAndSettle();
  }

  testWidgets('mostra a temporada ao lado do total', (tester) async {
    await pumpHeader(
      tester,
      const RankingClassificationHeader(
        mode: RankingListMode.athletes,
        count: 12,
        yearLabel: 'GERAL',
      ),
    );

    expect(find.text('GERAL · 12 ATLETAS'), findsOneWidget);
  });

  testWidgets('sem temporada mantém só o total', (tester) async {
    await pumpHeader(
      tester,
      const RankingClassificationHeader(
        mode: RankingListMode.teams,
        count: 4,
      ),
    );

    expect(find.text('4 DUPLAS'), findsOneWidget);
  });

  testWidgets('com fonte ampliada o título cede, o contador fica inteiro',
      (tester) async {
    await pumpHeader(
      tester,
      const RankingClassificationHeader(
        mode: RankingListMode.teams,
        count: 128,
        yearLabel: '2026',
      ),
      textScale: 1.5,
    );

    expect(tester.takeException(), isNull);
    expect(find.text('2026 · 128 DUPLAS'), findsOneWidget);
  });
}
