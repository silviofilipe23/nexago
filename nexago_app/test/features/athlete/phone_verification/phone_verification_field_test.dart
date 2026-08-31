import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/features/athlete/phone_verification/presentation/phone_verification_field.dart';

/// O campo de WhatsApp deixou de ser um botão de SMS e virou um input: o
/// número declarado é o que libera a inscrição (`athlete-tournament-access.ts`)
/// e a verificação por SMS virou opcional.
Future<void> _pumpField(
  WidgetTester tester, {
  required TextEditingController controller,
  bool verified = false,
  ValueChanged<String>? onChanged,
  String? errorText,
}) {
  return tester.pumpWidget(
    MaterialApp(
      theme: AppTheme.dark,
      home: Scaffold(
        body: PhoneVerificationField(
          controller: controller,
          verified: verified,
          onChanged: onChanged ?? (_) {},
          onVerified: (_) {},
          errorText: errorText,
        ),
      ),
    ),
  );
}

void main() {
  testWidgets('digita o número e devolve mascarado', (tester) async {
    final controller = TextEditingController();
    final changes = <String>[];
    await _pumpField(
      tester,
      controller: controller,
      onChanged: changes.add,
    );

    await tester.enterText(find.byType(TextField), '62999999999');
    await tester.pump();

    expect(controller.text, '(62) 99999-9999');
    expect(changes.last, '(62) 99999-9999');
  });

  testWidgets('oferece a verificação por SMS como opcional', (tester) async {
    await _pumpField(tester, controller: TextEditingController());

    expect(find.text('Verificar'), findsOneWidget);
  });

  testWidgets('número já verificado vira somente leitura', (tester) async {
    // Depois do selo as rules do Firestore recusam qualquer troca vinda do
    // client — deixar editável só produziria `permission-denied` no save.
    final controller = TextEditingController(text: '(62) 99999-9999');
    await _pumpField(tester, controller: controller, verified: true);

    final field = tester.widget<TextField>(find.byType(TextField));
    expect(field.readOnly, isTrue);
    expect(find.text('Verificado por SMS'), findsOneWidget);
  });

  testWidgets('mostra o erro de validação abaixo do campo', (tester) async {
    await _pumpField(
      tester,
      controller: TextEditingController(),
      errorText: 'Informe seu WhatsApp',
    );

    expect(find.text('Informe seu WhatsApp'), findsOneWidget);
  });
}
