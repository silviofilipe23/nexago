import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/features/friendly_match/domain/friendly_match_models.dart';
import 'package:nexago_app/features/friendly_match/presentation/widgets/friendly_match_status_chip.dart';

void main() {
  Widget wrap(Widget child) {
    return MaterialApp(
      theme: AppTheme.dark,
      home: Scaffold(body: child),
    );
  }

  testWidgets('renderiza o label correspondente a cada status', (tester) async {
    for (final status in FriendlyMatchStatus.values) {
      await tester.pumpWidget(wrap(FriendlyMatchStatusChip(status: status)));
      expect(
        find.text(status.label),
        findsOneWidget,
        reason: 'status $status deveria exibir "${status.label}"',
      );
    }
  });

  testWidgets('clientExpired sobrepõe convite pendente com "Expirado"',
      (tester) async {
    await tester.pumpWidget(wrap(const FriendlyMatchStatusChip(
      status: FriendlyMatchStatus.sent,
      clientExpired: true,
    )));

    expect(find.text('Expirado'), findsOneWidget);
    expect(find.text('Aguardando resposta'), findsNothing);
  });

  testWidgets('clientExpired false mantém o label do status', (tester) async {
    await tester.pumpWidget(wrap(const FriendlyMatchStatusChip(
      status: FriendlyMatchStatus.sent,
    )));

    expect(find.text('Aguardando resposta'), findsOneWidget);
    expect(find.text('Expirado'), findsNothing);
  });
}
