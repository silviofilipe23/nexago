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
}
