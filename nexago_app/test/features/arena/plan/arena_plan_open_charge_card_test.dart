// Mensalidade em aberto do plano da arena: no Pix o Asaas gera a cobrança de
// cada ciclo sem avisar ninguém, e a arena perdia o plano depois da carência.
// O card mostra a cobrança e o Pix para pagar; cartão recusado vai à fatura.
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/features/arena/data/arena_subscription_repository.dart';
import 'package:nexago_app/features/arena/presentation/plan/widgets/arena_plan_open_charge_card.dart';

Widget _wrap(Widget child) => MaterialApp(
      theme: AppTheme.dark,
      home: Scaffold(body: SingleChildScrollView(child: child)),
    );

void main() {
  group('ArenaPlanOpenCharge.fromMap', () {
    test('lê a cobrança do callable', () {
      final c = ArenaPlanOpenCharge.fromMap({
        'paymentId': 'pay_1',
        'status': 'OVERDUE',
        'dueDate': '2026-12-12',
        'valueCents': 24900,
        'billingType': 'CREDIT_CARD',
        'invoiceUrl': 'https://asaas/i/1',
        'qrCode': null,
      })!;
      expect(c.overdue, isTrue);
      expect(c.cardDeclined, isTrue);
      expect(c.hasPix, isFalse);
      expect(c.dueDateLabel, '12/12/2026');
    });

    test('sem cobrança vira null', () {
      expect(ArenaPlanOpenCharge.fromMap(null), isNull);
      expect(ArenaPlanOpenCharge.fromMap({'paymentId': ''}), isNull);
    });
  });

  testWidgets('Pix pendente: "Próxima mensalidade" e o código só depois do toque', (tester) async {
    const charge = ArenaPlanOpenCharge(
      paymentId: 'pay_1',
      overdue: false,
      dueDate: '2026-12-12',
      valueCents: 24900,
      billingType: 'PIX',
      qrCode: '00020126pix',
    );
    await tester.pumpWidget(_wrap(ArenaPlanOpenChargeCard(charge: charge, onOpenInvoice: (_) async {})));
    expect(find.text('Próxima mensalidade'), findsOneWidget);
    expect(find.text('Vence em 12/12/2026'), findsOneWidget);
    expect(find.textContaining('O plano é renovado'), findsNothing);

    await tester.tap(find.text('Pagar com Pix'));
    await tester.pumpAndSettle();
    expect(find.textContaining('O plano é renovado'), findsOneWidget);
  });

  testWidgets('cartão recusado: abre a fatura', (tester) async {
    String? opened;
    const charge = ArenaPlanOpenCharge(
      paymentId: 'pay_2',
      overdue: true,
      dueDate: '2026-12-12',
      valueCents: 24900,
      billingType: 'CREDIT_CARD',
      invoiceUrl: 'https://asaas/i/2',
    );
    await tester.pumpWidget(_wrap(ArenaPlanOpenChargeCard(
      charge: charge,
      onOpenInvoice: (url) async => opened = url,
    )));
    expect(find.text('Mensalidade vencida'), findsOneWidget);
    expect(find.text('Venceu em 12/12/2026 · o cartão foi recusado'), findsOneWidget);
    await tester.tap(find.text('Pagar mensalidade'));
    expect(opened, 'https://asaas/i/2');
  });
}
