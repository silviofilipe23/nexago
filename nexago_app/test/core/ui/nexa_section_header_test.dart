import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/core/ui/nexa_section_header.dart';

void main() {
  Widget wrap(Widget child) =>
      MaterialApp(theme: AppTheme.dark, home: Scaffold(body: child));

  testWidgets('renderiza título e eyebrow em caixa alta', (tester) async {
    await tester.pumpWidget(wrap(const NexaSectionHeader(
      title: 'Meus torneios',
      eyebrow: 'competições',
    )));
    expect(find.text('Meus torneios'), findsOneWidget);
    expect(find.text('COMPETIÇÕES'), findsOneWidget);
  });

  testWidgets('ação aparece e dispara callback', (tester) async {
    var tapped = false;
    await tester.pumpWidget(wrap(NexaSectionHeader(
      title: 'Ranking',
      actionLabel: 'Ver tudo',
      onAction: () => tapped = true,
    )));
    await tester.tap(find.text('Ver tudo'));
    expect(tapped, isTrue);
  });

  testWidgets('sem ação não renderiza botão', (tester) async {
    await tester.pumpWidget(wrap(const NexaSectionHeader(title: 'Agenda')));
    expect(find.byType(TextButton), findsNothing);
  });
}
