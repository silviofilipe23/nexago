import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/ui/nexa_slide_to_confirm.dart';

void main() {
  late int confirmed;

  Future<void> pump(WidgetTester tester) async {
    confirmed = 0;
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: Center(
            child: SizedBox(
              width: 340,
              child: NexaSlideToConfirm(
                label: 'DESLIZE PARA O MODO FOCUS',
                semanticLabel: 'Ativar Modo Focus',
                onConfirmed: () => confirmed++,
              ),
            ),
          ),
        ),
      ),
    );
  }

  final thumb = find.byKey(const Key('nexa-slide-thumb'));
  double thumbLeft(WidgetTester tester) => tester.getTopLeft(thumb).dx;

  testWidgets('arrastar até o fim confirma uma vez e o trilho volta', (
    tester,
  ) async {
    await pump(tester);
    final start = thumbLeft(tester);

    await tester.drag(thumb, const Offset(400, 0));
    await tester.pump(const Duration(milliseconds: 300));
    expect(confirmed, 1);
    expect(find.byIcon(Icons.check_rounded), findsOneWidget);

    await tester.pump(const Duration(milliseconds: 500));
    expect(thumbLeft(tester), start);
    expect(confirmed, 1);
  });

  testWidgets('soltar no meio do caminho não confirma e volta', (
    tester,
  ) async {
    await pump(tester);
    final start = thumbLeft(tester);

    await tester.timedDrag(
      thumb,
      const Offset(120, 0),
      const Duration(milliseconds: 600),
    );
    await tester.pumpAndSettle();
    expect(confirmed, 0);
    expect(thumbLeft(tester), start);
  });

  testWidgets('tocar só dá a dica, não confirma', (tester) async {
    await pump(tester);
    final start = thumbLeft(tester);

    await tester.tap(find.byType(NexaSlideToConfirm));
    await tester.pump(); // primeiro quadro só inicia a animação
    await tester.pump(const Duration(milliseconds: 150));
    expect(thumbLeft(tester), greaterThan(start));

    await tester.pumpAndSettle();
    expect(thumbLeft(tester), start);
    expect(confirmed, 0);
  });

  testWidgets('leitor de tela: botão que confirma com o toque', (
    tester,
  ) async {
    final semantics = tester.ensureSemantics();
    await pump(tester);

    final node = find.bySemanticsLabel('Ativar Modo Focus');
    expect(
      tester.getSemantics(node),
      isSemantics(isButton: true, hasTapAction: true),
    );
    tester.semantics.tap(find.semantics.byLabel('Ativar Modo Focus'));
    expect(confirmed, 1);
    semantics.dispose();
  });
}
