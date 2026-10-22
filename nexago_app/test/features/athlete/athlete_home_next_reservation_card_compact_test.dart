import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/features/arenas/domain/my_booking_item.dart';
import 'package:nexago_app/features/arenas/domain/my_booking_payment.dart';
import 'package:nexago_app/features/athlete/presentation/widgets/athlete_home/athlete_home_next_reservation_card.dart';

const _reserva = MyBookingItem(
  id: 'b1',
  arenaName: 'Arena Sol',
  courtName: 'Quadra 2',
  dateRaw: '2026-10-23',
  startTime: '19:00',
  endTime: '20:00',
  rawStatus: 'confirmed',
  paymentDisplay: MyBookingPaymentDisplay(label: 'PIX'),
);

Future<void> _pump(
  WidgetTester tester, {
  MyBookingItem? booking = _reserva,
  VoidCallback? onReserve,
  double width = 375,
}) async {
  tester.view.physicalSize = Size(width, 800);
  tester.view.devicePixelRatio = 1.0;
  addTearDown(tester.view.reset);
  await tester.pumpWidget(
    MaterialApp(
      theme: AppTheme.dark,
      home: Scaffold(
        body: Padding(
          padding: const EdgeInsets.all(20),
          child: AthleteHomeNextReservationCard(
            booking: booking,
            now: DateTime(2026, 10, 22, 12),
            onDetailsTap: () {},
            onReserveTap: onReserve ?? () {},
            initiallyExpanded: false,
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

  testWidgets('compacto: dia, hora, arena e status numa linha', (
    tester,
  ) async {
    await _pump(tester);

    expect(find.byKey(const Key('home-next-booking-compact')), findsOneWidget);
    expect(find.text('AMANHÃ'), findsOneWidget);
    expect(find.text('19:00'), findsOneWidget);
    expect(find.text('Arena Sol · Quadra 2'), findsOneWidget);
    expect(find.text('Confirmada'), findsOneWidget);
    expect(find.text('Como chegar'), findsNothing);
  });

  testWidgets('a seta expande e recolhe o card', (tester) async {
    await _pump(tester);

    await tester.tap(find.byTooltip('Expandir'));
    await tester.pumpAndSettle();
    expect(find.text('Como chegar'), findsOneWidget);
    expect(find.text('Detalhes'), findsOneWidget);

    await tester.tap(find.byKey(const Key('home-next-booking-collapse')));
    await tester.pumpAndSettle();
    expect(find.text('Como chegar'), findsNothing);
    expect(find.byKey(const Key('home-next-booking-compact')), findsOneWidget);
  });

  testWidgets('tocar no card compacto também expande', (tester) async {
    await _pump(tester);
    await tester.tap(find.text('Arena Sol · Quadra 2'));
    await tester.pumpAndSettle();
    expect(find.text('Como chegar'), findsOneWidget);
  });

  testWidgets('sem reserva: linha curta com Reservar', (tester) async {
    var reserve = 0;
    await _pump(tester, booking: null, onReserve: () => reserve++);

    expect(
      find.byKey(const Key('home-next-booking-compact-empty')),
      findsOneWidget,
    );
    await tester.tap(find.text('Reservar'));
    expect(reserve, 1);
  });

  testWidgets('aberto por padrão fora da Início (sem seta de recolher)', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(375, 800);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.reset);
    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.dark,
        home: Scaffold(
          body: AthleteHomeNextReservationCard(
            booking: _reserva,
            now: DateTime(2026, 10, 22, 12),
            onDetailsTap: () {},
            onReserveTap: () {},
          ),
        ),
      ),
    );
    expect(find.text('Como chegar'), findsOneWidget);
    expect(find.byKey(const Key('home-next-booking-collapse')), findsNothing);
  });

  testWidgets('compacto cabe em 320px', (tester) async {
    await _pump(tester, width: 320);
    expect(tester.takeException(), isNull);
  });
}
