// Sheet de confirmação de nível na 1ª inscrição do esporte (plano de
// calibração de nível, Task 6): última chance de o atleta revisar o nível
// antes de travar o ratchet "nível só sobe". Cobre a copy exata e os dois
// caminhos de saída ("Confirmar e continuar" → true / "Ajustar nível" →
// false), no mesmo padrão de `showPhoneVerificationSheet` (botão que abre o
// sheet, resultado guardado numa lista).
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/features/tournaments/presentation/widgets/tournament_registration/level_confirmation_sheet.dart';

void main() {
  Future<List<bool?>> pumpSheet(WidgetTester tester) async {
    final results = <bool?>[];
    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.dark,
        home: Scaffold(
          body: Builder(
            builder: (context) => ElevatedButton(
              onPressed: () async {
                results.add(
                  await showLevelConfirmationSheet(
                    context,
                    levelLabel: 'Intermediário 1',
                    sportLabel: 'Vôlei de praia',
                  ),
                );
              },
              child: const Text('abrir'),
            ),
          ),
        ),
      ),
    );
    await tester.tap(find.text('abrir'));
    await tester.pumpAndSettle();
    return results;
  }

  testWidgets('mostra a copy exata com nível e esporte interpolados', (
    tester,
  ) async {
    await pumpSheet(tester);

    expect(find.text('Confirme seu nível'), findsOneWidget);
    expect(
      find.text(
        'Você vai se inscrever como Intermediário 1 em Vôlei de praia. '
        'Após a inscrição, o nível só poderá subir.',
      ),
      findsOneWidget,
    );
    expect(find.text('Ajustar nível'), findsOneWidget);
    expect(find.text('Confirmar e continuar'), findsOneWidget);
  });

  testWidgets('"Confirmar e continuar" resolve com true', (tester) async {
    final results = await pumpSheet(tester);

    await tester.tap(find.text('Confirmar e continuar'));
    await tester.pumpAndSettle();

    expect(results, [true]);
  });

  testWidgets('"Ajustar nível" resolve com false (sem submeter)', (
    tester,
  ) async {
    final results = await pumpSheet(tester);

    await tester.tap(find.text('Ajustar nível'));
    await tester.pumpAndSettle();

    expect(results, [false]);
  });
}
