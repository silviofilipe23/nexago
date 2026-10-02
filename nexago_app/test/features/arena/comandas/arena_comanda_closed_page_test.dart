import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/features/arena/domain/comandas/arena_comanda.dart';
import 'package:nexago_app/features/arena/domain/comandas/arena_comanda_closed_args.dart';
import 'package:nexago_app/features/arena/domain/comandas/arena_comanda_payment.dart';
import 'package:nexago_app/features/arena/presentation/comandas/arena_comanda_closed_page.dart';

void main() {
  testWidgets('comanda fechada não promete cashback (a v1 não credita comanda)',
      (tester) async {
    const comanda = ArenaComanda(
      id: 'c1',
      arenaId: 'a1',
      displayNumber: 7,
      type: ArenaComandaType.individual,
      status: ArenaComandaStatus.closed,
      customerName: 'Ana',
      allowAppOrders: false,
      rentalCents: 0,
      itemsTotalCents: 10000,
      totalCents: 10000,
      itemsCount: 3,
      paidCents: 10000,
      openedByUid: 'u1',
    );

    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.dark,
        home: const ArenaComandaClosedPage(
          args: ArenaComandaClosedArgs(
            comanda: comanda,
            payments: [
              ArenaComandaPayment(
                id: 'p1',
                method: ArenaComandaPaymentMethod.pix,
                amountCents: 10000,
                payerName: 'Ana',
                receivedByUid: 'u1',
              ),
            ],
          ),
        ),
      ),
    );
    await tester.pump();

    expect(find.text('Comanda fechada'), findsOneWidget);
    expect(find.textContaining('Cashback'), findsNothing);
    expect(find.textContaining('cashback'), findsNothing);
  });
}
