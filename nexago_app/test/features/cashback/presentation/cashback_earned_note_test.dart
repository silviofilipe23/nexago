import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/features/cashback/application/cashback_providers.dart';
import 'package:nexago_app/features/cashback/domain/cashback_models.dart';
import 'package:nexago_app/features/cashback/presentation/cashback_copy.dart';
import 'package:nexago_app/features/cashback/presentation/widgets/cashback_earned_note.dart';

const ligado = CashbackConfig(
  enabled: true,
  ratePercent: 2,
  maxShareOfFee: 0.5,
  minCashCents: 500,
  expiryMonths: 6,
  expiryWarningDays: 15,
);

CashbackLot lote({
  CashbackLotStatus status = CashbackLotStatus.pending,
  int cents = 240,
}) {
  return CashbackLot(
    id: 'pay_1',
    status: status,
    earnedCents: cents,
    remainingCents: cents,
  );
}

Future<void> abrirNota(
  WidgetTester tester, {
  CashbackConfig config = ligado,
  required Stream<CashbackLot?> lot,
  VoidCallback? onOpen,
}) async {
  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        cashbackConfigProvider.overrideWith((ref) => Stream.value(config)),
        cashbackLotProvider('pay_1').overrideWith((ref) => lot),
      ],
      child: MaterialApp(
        theme: AppTheme.dark,
        home: Scaffold(
          body: CashbackEarnedNote(
            paymentId: 'pay_1',
            onOpenCashback: onOpen ?? () {},
          ),
        ),
      ),
    ),
  );
  await tester.pump();
  await tester.pump();
}

void main() {
  testWidgets('lote pendente do pagamento: "+R\$ X de cashback pendente"',
      (tester) async {
    await abrirNota(tester, lot: Stream.value(lote()));

    expect(find.text(CashbackCopy.earnedNote(240)), findsOneWidget);
    expect(find.text(CashbackCopy.genericSuccessNote), findsNothing);
  });

  testWidgets('sem lote: nota genérica com link para Meu cashback',
      (tester) async {
    var aberturas = 0;
    await abrirNota(
      tester,
      lot: Stream.value(null),
      onOpen: () => aberturas++,
    );

    expect(find.text(CashbackCopy.genericSuccessNote), findsOneWidget);
    await tester.tap(find.text(CashbackCopy.openCashbackAction));
    expect(aberturas, 1);
  });

  testWidgets('lote criado depois da navegação: a nota troca sozinha',
      (tester) async {
    final lots = StreamController<CashbackLot?>.broadcast();
    addTearDown(lots.close);
    await abrirNota(tester, lot: lots.stream);

    expect(find.text(CashbackCopy.genericSuccessNote), findsOneWidget);

    lots.add(lote(cents: 360));
    await tester.pump();
    await tester.pump();

    expect(find.text(CashbackCopy.earnedNote(360)), findsOneWidget);
    expect(find.text(CashbackCopy.genericSuccessNote), findsNothing);
  });

  testWidgets('lote cancelado não é anunciado', (tester) async {
    await abrirNota(
      tester,
      lot: Stream.value(lote(status: CashbackLotStatus.cancelled)),
    );

    expect(find.text(CashbackCopy.genericSuccessNote), findsOneWidget);
  });

  testWidgets('recurso desligado: nada, nem com lote', (tester) async {
    await abrirNota(
      tester,
      config: CashbackConfig.fallback,
      lot: Stream.value(lote()),
    );

    expect(find.textContaining('cashback'), findsNothing);
  });
}
