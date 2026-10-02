import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/features/cashback/domain/cashback_models.dart';
import 'package:nexago_app/features/cashback/presentation/cashback_copy.dart';
import 'package:nexago_app/features/cashback/presentation/widgets/checkout_cashback_toggle.dart';

const ligado = CashbackConfig(
  enabled: true,
  ratePercent: 2,
  maxShareOfFee: 0.5,
  minCashCents: 500,
  expiryMonths: 6,
  expiryWarningDays: 15,
);

CheckoutCashbackToggle toggle({
  CashbackConfig config = ligado,
  int price = 2000,
  int available = 3000,
  bool value = false,
  bool enabled = true,
  ValueChanged<bool>? onChanged,
}) {
  return CheckoutCashbackToggle(
    priceCents: price,
    availableCents: available,
    config: config,
    value: value,
    enabled: enabled,
    onChanged: onChanged ?? (_) {},
  );
}

Future<void> abrir(WidgetTester tester, Widget child) async {
  await tester.pumpWidget(
    MaterialApp(
      theme: AppTheme.dark,
      home: Scaffold(
        body: Padding(padding: const EdgeInsets.all(16), child: child),
      ),
    ),
  );
}

void main() {
  testWidgets('recurso desligado: nada aparece', (tester) async {
    await abrir(tester, toggle(config: CashbackConfig.fallback));

    expect(find.byKey(CheckoutCashbackToggle.switchKey), findsNothing);
    expect(find.textContaining('de volta'), findsNothing);
  });

  testWidgets('sem saldo: só a linha de ganho', (tester) async {
    await abrir(tester, toggle(available: 0));

    expect(find.text(CashbackCopy.earnHint(ligado)), findsOneWidget);
    expect(find.byKey(CheckoutCashbackToggle.switchKey), findsNothing);
  });

  testWidgets('preço no mínimo em dinheiro: só a linha de ganho, sem switch',
      (tester) async {
    await abrir(tester, toggle(price: 500, available: 3000));

    expect(find.text(CashbackCopy.earnHint(ligado)), findsOneWidget);
    expect(find.byKey(CheckoutCashbackToggle.switchKey), findsNothing);
  });

  testWidgets('com saldo e desligado: mostra o disponível, sem resumo',
      (tester) async {
    await abrir(tester, toggle());

    expect(find.text(CashbackCopy.toggleTitle), findsOneWidget);
    expect(find.text(CashbackCopy.availableToUse(3000)), findsOneWidget);
    expect(
      tester.widget<Switch>(find.byKey(CheckoutCashbackToggle.switchKey)).value,
      isFalse,
    );
    expect(find.text(CashbackCopy.using(1500)), findsNothing);
    expect(find.text(CashbackCopy.summaryLabel), findsNothing);
  });

  testWidgets('ligado: "Usando", aviso do mínimo e linha de resumo',
      (tester) async {
    await abrir(tester, toggle(value: true));

    expect(find.text(CashbackCopy.using(1500)), findsOneWidget);
    expect(find.text(CashbackCopy.minCashNote(500)), findsOneWidget);
    expect(find.text(CashbackCopy.summaryLabel), findsOneWidget);
    expect(find.text(CashbackCopy.summaryAmount(1500)), findsOneWidget);
  });

  testWidgets('saldo abaixo do teto: usa tudo, sem aviso do mínimo',
      (tester) async {
    await abrir(tester, toggle(price: 5000, available: 1000, value: true));

    expect(find.text(CashbackCopy.using(1000)), findsOneWidget);
    expect(find.text(CashbackCopy.minCashNote(500)), findsNothing);
    expect(find.text(CashbackCopy.summaryAmount(1000)), findsOneWidget);
  });

  testWidgets('tocar no switch devolve a escolha', (tester) async {
    final escolhas = <bool>[];
    await abrir(tester, toggle(onChanged: escolhas.add));

    await tester.tap(find.byKey(CheckoutCashbackToggle.switchKey));
    expect(escolhas, [true]);
  });

  testWidgets('desabilitado enquanto a cobrança é gerada', (tester) async {
    final escolhas = <bool>[];
    await abrir(tester, toggle(enabled: false, onChanged: escolhas.add));

    await tester.tap(find.byKey(CheckoutCashbackToggle.switchKey));
    expect(escolhas, isEmpty);
  });

  group('CheckoutCashbackAppliedNote', () {
    testWidgets('mostra o que o servidor aplicou', (tester) async {
      await abrir(tester, const CheckoutCashbackAppliedNote(appliedCents: 1500));

      expect(find.text(CashbackCopy.appliedNote(1500)), findsOneWidget);
    });

    testWidgets('nada aplicado: nada aparece', (tester) async {
      await abrir(tester, const CheckoutCashbackAppliedNote(appliedCents: 0));

      expect(find.textContaining('do seu cashback'), findsNothing);
    });
  });
}
