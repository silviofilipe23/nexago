import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/arenas/presentation/widgets/booking_pix/booking_pix_expiry_card.dart';

void main() {
  Future<void> pumpCard(WidgetTester tester, DateTime expiresAt) async {
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: BookingPixExpiryCard(expiresAt: expiresAt, amountReais: 50),
        ),
      ),
    );
    // Só um frame: o card tem um Timer.periodic, e `pumpAndSettle` nunca
    // assentaria.
    await tester.pump();
  }

  /// O relógio "MMM:SS" que começa com [minutes] (ex.: "125:" acha "125:59").
  Finder countdown(String minutes) => find.byWidgetPredicate(
    (w) => w is Text && (w.data ?? '').startsWith('$minutes:'),
  );

  testWidgets('abaixo de uma hora mostra mm:ss', (tester) async {
    await pumpCard(
      tester,
      DateTime.now().add(const Duration(minutes: 14, seconds: 59)),
    );
    expect(countdown('14'), findsOneWidget);
  });

  testWidgets('acima de uma hora os minutos não dão a volta', (tester) async {
    // A cobrança PIX de inscrição acompanha o prazo da vaga, que pode ser de
    // horas: 2h05 tem de aparecer como 125:xx, não como 05:xx.
    await pumpCard(
      tester,
      DateTime.now().add(const Duration(minutes: 125, seconds: 59)),
    );
    expect(countdown('125'), findsOneWidget);
    expect(countdown('05'), findsNothing);
  });
}
