// Cancelamento no passo de pagamento da inscrição: enquanto ninguém pagou, o
// atleta vê "Cancelar reserva" (`onCancelRegistration != null`); quando já há
// pagamento (parcela ou total), a página troca o botão pelo texto
// `cancelBlockedHint` orientando a falar com o organizador. O `else if` do
// widget garante que botão e hint nunca coexistem — este teste protege esse
// contrato.
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_discovery_models.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_registration_logic.dart';
import 'package:nexago_app/features/tournaments/presentation/widgets/tournament_registration/tournament_registration_payment_step.dart';

void main() {
  const category = TournamentCategoryOffer(
    id: 'cat-1',
    name: 'Masculina C',
    entryFee: 160,
  );

  Future<void> pumpStep(
    WidgetTester tester, {
    VoidCallback? onCancelRegistration,
    String? cancelBlockedHint,
  }) async {
    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.dark,
        home: Scaffold(
          body: SingleChildScrollView(
            child: TournamentRegistrationPaymentStep(
              category: category,
              quote: buildRegistrationQuote(entryFee: category.entryFee),
              paymentType: 'share',
              onPaymentTypeChanged: (_) {},
              onCancelRegistration: onCancelRegistration,
              cancelBlockedHint: cancelBlockedHint,
            ),
          ),
        ),
      ),
    );
  }

  final cancelButton = find.widgetWithText(TextButton, 'Cancelar reserva');
  const hint =
      'Já existe pagamento nesta inscrição. Fale com o organizador para cancelar.';

  group('TournamentRegistrationPaymentStep — cancelar reserva', () {
    testWidgets(
      'sem onCancelRegistration e com cancelBlockedHint mostra o hint e '
      'esconde o botão',
      (tester) async {
        await pumpStep(tester, cancelBlockedHint: hint);

        expect(find.text(hint), findsOneWidget);
        expect(cancelButton, findsNothing);
      },
    );

    testWidgets(
      'com onCancelRegistration mostra o botão e o tap chama o callback',
      (tester) async {
        var cancelCount = 0;
        await pumpStep(
          tester,
          onCancelRegistration: () => cancelCount++,
        );

        expect(cancelButton, findsOneWidget);

        await tester.tap(cancelButton);
        await tester.pump();

        expect(cancelCount, 1);
      },
    );

    testWidgets(
      'com onCancelRegistration o botão tem prioridade sobre o hint '
      '(nunca coexistem)',
      (tester) async {
        await pumpStep(
          tester,
          onCancelRegistration: () {},
          cancelBlockedHint: hint,
        );

        expect(cancelButton, findsOneWidget);
        expect(find.text(hint), findsNothing);
      },
    );

    testWidgets(
      'sem onCancelRegistration e sem hint não renderiza botão nem texto',
      (tester) async {
        await pumpStep(tester);

        expect(cancelButton, findsNothing);
        expect(find.text(hint), findsNothing);
      },
    );
  });
}
