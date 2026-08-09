import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/core/ui/nexa_skeleton.dart';

void main() {
  Widget wrap(Widget child) =>
      MaterialApp(theme: AppTheme.dark, home: Scaffold(body: child));

  testWidgets('renderiza com o tamanho pedido e anima sem crashar',
      (tester) async {
    await tester.pumpWidget(wrap(const NexaSkeleton(width: 120, height: 16)));
    final box = tester.getSize(find.byType(NexaSkeleton));
    expect(box.width, 120);
    expect(box.height, 16);
    await tester.pump(const Duration(milliseconds: 300));
    await tester.pump(const Duration(milliseconds: 300));
  });

  testWidgets('variante circle é quadrada', (tester) async {
    await tester.pumpWidget(wrap(const NexaSkeleton.circle(size: 40)));
    final box = tester.getSize(find.byType(NexaSkeleton));
    expect(box.width, 40);
    expect(box.height, 40);
  });

  testWidgets('oscilação do pulso é verificada', (tester) async {
    await tester.pumpWidget(wrap(const NexaSkeleton(width: 120, height: 16)));

    // Encontra o Container dentro do NexaSkeleton
    final containerFinder = find.descendant(
      of: find.byType(NexaSkeleton),
      matching: find.byType(Container),
    );
    expect(containerFinder, findsOneWidget);

    // Lê alpha na primeira fase (t=0, alpha = 0.08 * 255 ≈ 20)
    var container = tester.widget<Container>(containerFinder);
    var decoration = container.decoration as BoxDecoration;
    var alpha1 = (decoration.color!.a * 255.0).round();
    expect(alpha1, greaterThan(18)); // 0.08 * 255 - tolerance
    expect(alpha1, lessThan(22)); // 0.08 * 255 + tolerance

    // Anima para fase intermediária (alpha ~= 0.12 * 255 ≈ 30)
    await tester.pump(const Duration(milliseconds: 400));
    container = tester.widget<Container>(containerFinder);
    decoration = container.decoration as BoxDecoration;
    var alpha2 = (decoration.color!.a * 255.0).round();
    expect(alpha2, greaterThan(28)); // 0.12 * 255 - tolerance
    expect(alpha2, lessThan(32)); // 0.12 * 255 + tolerance

    // Verifica que realmente oscilou
    expect(alpha2, isNot(alpha1));
  });
}
