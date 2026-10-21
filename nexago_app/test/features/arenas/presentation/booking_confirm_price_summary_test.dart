import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/features/arenas/presentation/widgets/booking_confirm/booking_confirm_price_summary.dart';

Future<void> _pump(WidgetTester tester, Widget child) => tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.dark,
        home: Scaffold(body: child),
      ),
    );

void main() {
  testWidgets('com desconto de professor: preço cheio, desconto e total',
      (tester) async {
    await _pump(
      tester,
      const BookingConfirmPriceSummary(
        courtLineLabel: 'Quadra (1h)',
        courtAmountLabel: 'R\$ 100,00',
        discountLineLabel: 'Desconto de professor (20%)',
        discountAmountLabel: '−R\$ 20,00',
        totalAmountLabel: 'R\$ 80,00',
      ),
    );
    expect(
      find.byKey(const Key('booking-confirm-professor-discount')),
      findsOneWidget,
    );
    expect(find.text('Desconto de professor (20%)'), findsOneWidget);
    expect(find.text('−R\$ 20,00'), findsOneWidget);
    expect(find.text('Total'), findsOneWidget);
    expect(find.text('R\$ 80,00'), findsOneWidget);
  });

  testWidgets('sem desconto: só a linha da quadra', (tester) async {
    await _pump(
      tester,
      const BookingConfirmPriceSummary(
        courtLineLabel: 'Quadra (1h)',
        courtAmountLabel: 'R\$ 100,00',
      ),
    );
    expect(
      find.byKey(const Key('booking-confirm-professor-discount')),
      findsNothing,
    );
    expect(find.text('Total'), findsNothing);
  });
}
