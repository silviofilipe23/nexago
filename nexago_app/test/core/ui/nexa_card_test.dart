import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/core/ui/nexa_card.dart';

void main() {
  Widget wrap(Widget child) =>
      MaterialApp(theme: AppTheme.dark, home: Scaffold(body: child));

  testWidgets('renderiza child e dispara onTap', (tester) async {
    var tapped = false;
    await tester.pumpWidget(wrap(NexaCard(
      onTap: () => tapped = true,
      child: const Text('conteúdo'),
    )));
    expect(find.text('conteúdo'), findsOneWidget);
    await tester.tap(find.byType(NexaCard));
    expect(tapped, isTrue);
  });

  testWidgets('sem onTap não tem InkWell', (tester) async {
    await tester.pumpWidget(wrap(const NexaCard(child: Text('x'))));
    expect(find.byType(InkWell), findsNothing);
  });
}
