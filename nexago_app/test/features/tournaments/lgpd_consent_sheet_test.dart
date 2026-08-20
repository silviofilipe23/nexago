// Sheet do termo de imagem/LGPD: o texto do termo é longo e o sheet é
// `isScrollControlled`, então sem teto de altura ele esticava até a borda de
// cima da tela e a alça/título ficavam embaixo da barra de status. Estes
// testes travam o enquadramento do topo em tela com notch e em tela baixa.
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/features/tournaments/domain/lgpd_term.dart';
import 'package:nexago_app/features/tournaments/presentation/widgets/lgpd_consent_sheet.dart';

void main() {
  Future<void> pumpSheet(
    WidgetTester tester, {
    required Size screen,
    required double statusBar,
    required double homeIndicator,
  }) async {
    tester.view.devicePixelRatio = 1;
    tester.view.physicalSize = screen;
    tester.view.padding = FakeViewPadding(
      top: statusBar,
      bottom: homeIndicator,
    );
    tester.view.viewPadding = FakeViewPadding(
      top: statusBar,
      bottom: homeIndicator,
    );
    addTearDown(tester.view.reset);

    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.dark,
        home: Scaffold(
          body: Builder(
            builder: (context) => ElevatedButton(
              onPressed: () => showLgpdConsentSheet(context),
              child: const Text('abrir'),
            ),
          ),
        ),
      ),
    );
    await tester.tap(find.text('abrir'));
    await tester.pumpAndSettle();
  }

  testWidgets('tela com notch: o topo do sheet fica abaixo da barra de status',
      (
    tester,
  ) async {
    const screen = Size(390, 844);
    const statusBar = 47.0;
    await pumpSheet(
      tester,
      screen: screen,
      statusBar: statusBar,
      homeIndicator: 34,
    );

    final sheetTop = tester.getTopLeft(find.byType(BottomSheet)).dy;
    expect(sheetTop, greaterThan(statusBar));
    expect(
      tester.getSize(find.byType(BottomSheet)).height,
      lessThanOrEqualTo(screen.height * 0.85),
    );

    // Alça, título e as duas ações ficam dentro da tela.
    expect(
        tester.getTopLeft(find.text(lgpdTermTitle)).dy, greaterThan(statusBar));
    expect(
      tester.getBottomLeft(find.text('Cancelar')).dy,
      lessThanOrEqualTo(screen.height),
    );
    expect(find.text('Aceitar e continuar'), findsOneWidget);
  });

  testWidgets('tela baixa: continua sobrando faixa acima do sheet', (
    tester,
  ) async {
    const screen = Size(360, 640);
    const statusBar = 24.0;
    await pumpSheet(
      tester,
      screen: screen,
      statusBar: statusBar,
      homeIndicator: 0,
    );

    expect(
      tester.getTopLeft(find.byType(BottomSheet)).dy,
      greaterThan(statusBar),
    );
    expect(
        tester.getTopLeft(find.text(lgpdTermTitle)).dy, greaterThan(statusBar));
  });
}
