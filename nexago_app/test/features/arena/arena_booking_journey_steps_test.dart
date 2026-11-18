import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/formatting/app_currency_format.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/features/arena/domain/arena_booking_journey.dart';
import 'package:nexago_app/features/arena/domain/arena_manager_booking.dart';
import 'package:nexago_app/features/arena/presentation/widgets/arena_booking_journey_steps.dart';

// Quarta, 18/11, 17:42 — reserva das 17:00 às 18:00 em quadra.
final _now = DateTime(2026, 11, 18, 17, 42);

ArenaBookingJourney _journey({
  String athleteId = 'ath1',
  Map<String, dynamic> data = const {},
}) =>
    buildArenaBookingJourney(
      ArenaManagerBooking(
        id: 'b1',
        athleteId: athleteId,
        courtId: 'c1',
        courtName: 'Quadra 1',
        dateKey: '2026-11-18',
        startTime: '17:00',
        endTime: '18:00',
        data: {
          'status': 'active',
          'paymentChannel': 'onsite',
          'amountReais': 80,
          ...data,
        },
      ),
      now: _now,
    );

Future<void> _pump(WidgetTester tester, Widget child) => tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.dark,
        home: Scaffold(body: SingleChildScrollView(child: child)),
      ),
    );

FilledButton _button(WidgetTester tester, String key) => tester.widget(
      find.descendant(
        of: find.byKey(Key(key)),
        matching: find.byWidgetPredicate((w) => w is FilledButton),
      ),
    );

void main() {
  testWidgets('reserva sem atleta: check-in desligado e com o motivo',
      (tester) async {
    await _pump(
      tester,
      ArenaBookingJourneySteps(
        journey: _journey(athleteId: '', data: {'customerName': 'Carlos'}),
        onCheckIn: () {},
      ),
    );

    expect(_button(tester, 'arena-booking-step-checkin').onPressed, isNull);
    final reason = find.byKey(const Key('arena-booking-checkin-block-reason'));
    expect(reason, findsOneWidget);
    expect(
      tester.widget<Text>(reason).data,
      contains('Reserva no nome de Carlos'),
    );
  });

  testWidgets('check-in liberado não mostra motivo e chama o callback',
      (tester) async {
    var calls = 0;
    await _pump(
      tester,
      ArenaBookingJourneySteps(
        journey: _journey(),
        onCheckIn: () => calls++,
      ),
    );

    expect(
      find.byKey(const Key('arena-booking-checkin-block-reason')),
      findsNothing,
    );
    await tester.tap(find.byKey(const Key('arena-booking-step-checkin')));
    expect(calls, 1);
  });

  testWidgets('pagamento pendente mostra Receber com o valor', (tester) async {
    var received = false;
    await _pump(
      tester,
      ArenaBookingJourneySteps(
        journey: _journey(),
        onCheckIn: () {},
        onReceive: () => received = true,
      ),
    );

    expect(find.text('Receber ${formatBRL(80)}'), findsOneWidget);
    await tester.tap(find.byKey(const Key('arena-booking-step-receive')));
    expect(received, isTrue);
    expect(find.text('1 de 4'), findsOneWidget);
  });

  testWidgets('papel que só lê não vê os botões das etapas', (tester) async {
    await _pump(tester, ArenaBookingJourneySteps(journey: _journey()));

    expect(find.byKey(const Key('arena-booking-step-checkin')), findsNothing);
    expect(find.byKey(const Key('arena-booking-step-receive')), findsNothing);
    expect(find.text('Chegada'), findsOneWidget);
  });
}
