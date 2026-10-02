import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/features/cashback/application/cashback_providers.dart';
import 'package:nexago_app/features/cashback/domain/cashback_models.dart';
import 'package:nexago_app/features/cashback/presentation/cashback_copy.dart';
import 'package:nexago_app/features/cashback/presentation/widgets/cashback_settings_tile.dart';

const ligado = CashbackConfig(
  enabled: true,
  ratePercent: 2,
  maxShareOfFee: 0.5,
  minCashCents: 500,
  expiryMonths: 6,
  expiryWarningDays: 15,
);

Future<void> abrirTile(
  WidgetTester tester, {
  required CashbackConfig config,
  CashbackWallet wallet = CashbackWallet.empty,
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
        home: Scaffold(body: CashbackSettingsTile(onTap: onTap ?? () {})),
      ),
    ),
  );
  await tester.pump();
  await tester.pump();
}

void main() {
  testWidgets('ligado: "Meu cashback" com o disponível, e o toque abre a tela',
      (tester) async {
    var aberturas = 0;
    await abrirTile(
      tester,
      config: ligado,
      wallet: const CashbackWallet(availableCents: 1000, pendingCents: 240),
      onTap: () => aberturas++,
    );

    expect(find.text(CashbackCopy.pageTitle), findsOneWidget);
    expect(find.text(CashbackCopy.availableToUse(1000)), findsOneWidget);
    await tester.tap(find.text(CashbackCopy.pageTitle));
    expect(aberturas, 1);
  });

  testWidgets('desligado com saldo antigo: o tile some', (tester) async {
    await abrirTile(
      tester,
      config: CashbackConfig.fallback,
      wallet: const CashbackWallet(availableCents: 1000),
    );

    expect(find.text(CashbackCopy.pageTitle), findsNothing);
  });
}
