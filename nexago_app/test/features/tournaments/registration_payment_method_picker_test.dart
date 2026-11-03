import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/formatting/app_currency_format.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/features/tournaments/domain/registration_payment_method.dart';
import 'package:nexago_app/features/tournaments/presentation/widgets/tournament_registration/registration_payment_method_picker.dart';

void main() {
  testWidgets('só Pix: sem pergunta e sem rádio, só o Pix', (tester) async {
    final escolhas = <RegistrationPaymentMethod>[];
    await _pump(
      tester,
      methods: const [RegistrationPaymentMethod.pix],
      cardFeeReais: 4.96,
      onChanged: escolhas.add,
    );

    expect(find.text('Forma de pagamento'), findsOneWidget);
    expect(find.text('Como você quer pagar?'), findsNothing);
    expect(find.byKey(RegistrationPaymentMethodPicker.pixKey), findsOneWidget);
    expect(find.byKey(RegistrationPaymentMethodPicker.cardKey), findsNothing);
    // Sem cartão para comparar, sem selo de "mais barato".
    expect(
      find.byKey(RegistrationPaymentMethodPicker.pixSavingsKey),
      findsNothing,
    );
    expect(find.byIcon(Icons.radio_button_checked_rounded), findsNothing);
    expect(
        find.text('${formatBRL(100)} · pagar com seu banco'), findsOneWidget);

    await tester.tap(find.byKey(RegistrationPaymentMethodPicker.pixKey));
    expect(escolhas, isEmpty);
  });

  testWidgets('só cartão: o total com as taxas e o aviso das taxas do cartão',
      (tester) async {
    await _pump(
      tester,
      value: RegistrationPaymentMethod.card,
      methods: const [RegistrationPaymentMethod.card],
      cardFeeReais: 4.96,
    );

    expect(find.text('Forma de pagamento'), findsOneWidget);
    expect(find.byKey(RegistrationPaymentMethodPicker.pixKey), findsNothing);
    expect(find.byKey(RegistrationPaymentMethodPicker.cardKey), findsOneWidget);
    expect(
      find.text('${formatBRL(104.96)} · checkout seguro do Asaas'),
      findsOneWidget,
    );
    expect(
      find.text('Inclui ${formatBRL(4.96)} de taxas do cartão'),
      findsOneWidget,
    );
    expect(find.byIcon(Icons.radio_button_checked_rounded), findsNothing);
  });

  testWidgets(
      'os dois com taxa: Pix com o cartão riscado e o selo da diferença',
      (tester) async {
    final escolhas = <RegistrationPaymentMethod>[];
    await _pump(tester, cardFeeReais: 4.96, onChanged: escolhas.add);

    expect(find.text('Como você quer pagar?'), findsOneWidget);
    expect(
      find.descendant(
        of: find.byKey(RegistrationPaymentMethodPicker.pixSavingsKey),
        matching: find.text('${formatBRL(4.96)} a menos que no cartão'),
      ),
      findsOneWidget,
    );
    // Total do cartão riscado ao lado do valor do Pix.
    final rich = tester.widget<Text>(
      find.descendant(
        of: find.byKey(RegistrationPaymentMethodPicker.pixKey),
        matching: find.byWidgetPredicate(
          (w) => w is Text && w.textSpan != null,
        ),
      ),
    );
    final struck = (rich.textSpan! as TextSpan).children!.first as TextSpan;
    expect(struck.text, formatBRL(104.96));
    expect(struck.style!.decoration, TextDecoration.lineThrough);
    expect(
      find.text('Inclui ${formatBRL(4.96)} de taxas do cartão'),
      findsOneWidget,
    );

    await tester.tap(find.byKey(RegistrationPaymentMethodPicker.cardKey));
    expect(escolhas, [RegistrationPaymentMethod.card]);
  });

  testWidgets('os dois sem taxa (backend antigo): sem selo e mesmo valor',
      (tester) async {
    await _pump(tester);

    expect(
      find.byKey(RegistrationPaymentMethodPicker.pixSavingsKey),
      findsNothing,
    );
    expect(
        find.text('${formatBRL(100)} · pagar com seu banco'), findsOneWidget);
    expect(
      find.text('${formatBRL(100)} · checkout seguro do Asaas'),
      findsOneWidget,
    );
    expect(find.textContaining('taxas do cartão'), findsNothing);
    expect(
      find.byKey(RegistrationPaymentMethodPicker.cardFeeNoteKey),
      findsNothing,
    );
  });
}

Future<void> _pump(
  WidgetTester tester, {
  RegistrationPaymentMethod value = RegistrationPaymentMethod.pix,
  List<RegistrationPaymentMethod> methods = allRegistrationPaymentMethods,
  double cardFeeReais = 0,
  ValueChanged<RegistrationPaymentMethod>? onChanged,
}) async {
  await tester.pumpWidget(
    MaterialApp(
      theme: AppTheme.dark,
      home: Scaffold(
        body: RegistrationPaymentMethodPicker(
          value: value,
          methods: methods,
          amountReais: 100,
          cardFeeReais: cardFeeReais,
          onChanged: onChanged ?? (_) {},
        ),
      ),
    ),
  );
}
