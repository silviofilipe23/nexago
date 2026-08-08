import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/core/ui/nexa_chips.dart';

void main() {
  Widget wrap(Widget child) =>
      MaterialApp(theme: AppTheme.dark, home: Scaffold(body: child));

  testWidgets('NexaStatusChip mostra label na cor pedida', (tester) async {
    await tester.pumpWidget(wrap(const NexaStatusChip(
      label: 'Inscrições abertas',
      color: AppColors.win,
    )));
    final text = tester.widget<Text>(find.text('Inscrições abertas'));
    expect(text.style?.color, AppColors.win);
  });

  testWidgets('NexaMetaChip mostra ícone e label', (tester) async {
    await tester.pumpWidget(wrap(const NexaMetaChip(
      icon: Icons.calendar_today_rounded,
      label: '24/10',
    )));
    expect(find.byIcon(Icons.calendar_today_rounded), findsOneWidget);
    expect(find.text('24/10'), findsOneWidget);
  });
}
