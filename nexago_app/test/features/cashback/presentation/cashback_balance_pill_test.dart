import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/formatting/app_currency_format.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/features/cashback/application/cashback_providers.dart';
import 'package:nexago_app/features/cashback/domain/cashback_models.dart';
import 'package:nexago_app/features/cashback/presentation/widgets/cashback_balance_pill.dart';

const ligado = CashbackConfig(
  enabled: true,
  ratePercent: 2,
  maxShareOfFee: 0.5,
  minCashCents: 500,
  expiryMonths: 6,
  expiryWarningDays: 15,
);

Future<void> abrirSlot(
  WidgetTester tester, {
  required CashbackConfig config,
  required CashbackWallet wallet,
  VoidCallback? onTap,
}) async {
  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        cashbackConfigProvider.overrideWith((ref) => Stream.value(config)),
        cashbackWalletProvider.overrideWith((ref) => Stream.value(wallet)),
      ],
      child: MaterialApp(
        theme: AppTheme.dark,
        home: Scaffold(
          body: Center(child: CashbackHeroPillSlot(onTap: onTap ?? () {})),
        ),
      ),
    ),
  );
  await tester.pump();
  await tester.pump();
}

void main() {
  testWidgets('ligado com saldo: mostra disponível + pendente e abre a tela',
      (tester) async {
    var aberturas = 0;
    await abrirSlot(
      tester,
      config: ligado,
      wallet: const CashbackWallet(availableCents: 1000, pendingCents: 240),
      onTap: () => aberturas++,
    );

    expect(find.text(formatBRLFromCents(1240)), findsOneWidget);
    await tester.tap(find.byType(CashbackBalancePill));
    expect(aberturas, 1);
  });

  testWidgets('só pendente também acende a pílula', (tester) async {
    await abrirSlot(
      tester,
      config: ligado,
      wallet: const CashbackWallet(pendingCents: 240),
    );

    expect(find.text(formatBRLFromCents(240)), findsOneWidget);
  });

  testWidgets('desligado com saldo antigo: a pílula some', (tester) async {
    await abrirSlot(
      tester,
      config: CashbackConfig.fallback,
      wallet: const CashbackWallet(availableCents: 1000),
    );

    expect(find.byType(CashbackBalancePill), findsNothing);
  });

  testWidgets('ligado sem saldo: a pílula some', (tester) async {
    await abrirSlot(tester, config: ligado, wallet: CashbackWallet.empty);

    expect(find.byType(CashbackBalancePill), findsNothing);
  });
}
