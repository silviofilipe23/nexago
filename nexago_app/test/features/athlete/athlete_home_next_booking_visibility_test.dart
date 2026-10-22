import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/features/arenas/domain/my_booking_item.dart';
import 'package:nexago_app/features/arenas/domain/my_booking_payment.dart';
import 'package:nexago_app/features/arenas/domain/my_bookings_providers.dart';
import 'package:nexago_app/features/athlete/domain/gamification_models.dart';
import 'package:nexago_app/features/athlete/domain/gamification_providers.dart';
import 'package:nexago_app/features/athlete/presentation/athlete_home_page.dart';

Future<void> _pump(WidgetTester tester, List<MyBookingItem> bookings) async {
  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        gamificationSummaryProvider.overrideWith(
          (ref) => Stream.value(GamificationSummary.initial()),
        ),
        myBookingsStreamProvider.overrideWith((ref) => Stream.value(bookings)),
      ],
      child: MaterialApp(
        theme: AppTheme.dark,
        home: const Scaffold(body: AthleteHomePage()),
      ),
    ),
  );
  await tester.pump();
  await tester.pump();
}

void main() {
  setUpAll(() => initializeDateFormatting('pt_BR'));

  testWidgets('sem reserva: o card não aparece', (tester) async {
    await _pump(tester, const []);
    expect(find.byKey(const Key('home-next-booking')), findsNothing);
    expect(find.text('Sem próxima reserva agendada.'), findsNothing);
  });

  testWidgets('com reserva futura: o card compacto aparece', (tester) async {
    final d = DateTime.now().add(const Duration(days: 2));
    final key =
        '${d.year}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';
    await _pump(tester, [
      MyBookingItem(
        id: 'b1',
        arenaName: 'Arena Sol',
        courtName: 'Quadra 2',
        dateRaw: key,
        startTime: '19:00',
        endTime: '20:00',
        rawStatus: 'confirmed',
        paymentDisplay: const MyBookingPaymentDisplay(label: 'PIX'),
      ),
    ]);
    expect(find.byKey(const Key('home-next-booking')), findsOneWidget);
    expect(find.text('Arena Sol · Quadra 2'), findsOneWidget);
  });
}
