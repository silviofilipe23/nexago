import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/core/ui/nexa_segmented_control.dart';

void main() {
  Widget wrap(Widget child) =>
      MaterialApp(theme: AppTheme.dark, home: Scaffold(body: child));

  testWidgets('mostra segmentos e troca seleção no tap', (tester) async {
    String selected = 'a';
    await tester.pumpWidget(wrap(StatefulBuilder(
      builder: (context, setState) => NexaSegmentedControl<String>(
        segments: const [
          NexaSegment(value: 'a', label: 'Minha parte'),
          NexaSegment(value: 'b', label: 'Pagar a dupla'),
        ],
        selected: selected,
        onChanged: (v) => setState(() => selected = v),
      ),
    )));
    expect(find.text('Minha parte'), findsOneWidget);
    await tester.tap(find.text('Pagar a dupla'));
    await tester.pumpAndSettle();
    expect(selected, 'b');
  });
}
