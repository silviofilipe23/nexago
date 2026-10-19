import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/features/arenas/domain/my_booking_item.dart';
import 'package:nexago_app/features/arenas/domain/my_booking_payment.dart';
import 'package:nexago_app/features/athlete/presentation/widgets/athlete_home/athlete_home_next_reservation_card.dart';

const reserva = MyBookingItem(
  id: 'b1',
  arenaName: 'Arena Sol',
  courtName: 'Quadra 2',
  dateRaw: '2026-10-23',
  startTime: '19:00',
  endTime: '20:00',
  rawStatus: 'confirmed',
  paymentDisplay: MyBookingPaymentDisplay(label: 'PIX'),
);

Future<void> abrirCard(WidgetTester tester, {VoidCallback? onStoryTap}) async {
  tester.view.physicalSize = const Size(375, 800);
  tester.view.devicePixelRatio = 1.0;
  addTearDown(tester.view.reset);

  await tester.pumpWidget(
    MaterialApp(
      theme: AppTheme.dark,
      home: Scaffold(
        body: Padding(
          padding: const EdgeInsets.all(20),
          child: AthleteHomeNextReservationCard(
            booking: reserva,
            now: DateTime(2026, 10, 22, 12),
            onDetailsTap: () {},
            onReserveTap: () {},
            onStoryTap: onStoryTap,
          ),
        ),
      ),
    ),
  );
}

void main() {
  setUpAll(() async {
    await initializeDateFormatting('pt_BR');
  });

  testWidgets('com onStoryTap: botão do story ao lado de Detalhes', (
    tester,
  ) async {
    var taps = 0;
    await abrirCard(tester, onStoryTap: () => taps++);

    await tester.tap(find.byKey(const Key('home-next-booking-story')));
    expect(taps, 1);
    expect(find.byTooltip('Postar no story'), findsOneWidget);
    expect(find.text('Detalhes'), findsOneWidget);
  });

  testWidgets('sem onStoryTap (reserva não garantida): sem botão', (
    tester,
  ) async {
    await abrirCard(tester);

    expect(find.byKey(const Key('home-next-booking-story')), findsNothing);
    expect(find.text('Como chegar'), findsOneWidget);
  });
}
