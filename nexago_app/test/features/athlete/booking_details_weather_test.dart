import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth_mocks/firebase_auth_mocks.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:nexago_app/core/auth/auth_providers.dart';
import 'package:nexago_app/core/location/user_location_providers.dart';
import 'package:nexago_app/core/location/user_location_snapshot.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/features/arenas/domain/booking_providers.dart';
import 'package:nexago_app/features/athlete/domain/booking_attendance_providers.dart';
import 'package:nexago_app/features/athlete/presentation/booking_details_page.dart';
import 'package:nexago_app/features/athlete/presentation/widgets/booking_details/booking_details_team_providers.dart';
import 'package:nexago_app/features/weather/presentation/widgets/booking_weather_section.dart';

import '../weather/weather_test_fakes.dart';

/// O aviso de chuva entra na tela da reserva logo depois do hero, a partir do
/// doc vivo (`arenaBookings/{id}`).
void main() {
  setUpAll(() async {
    await initializeDateFormatting('pt_BR');
  });

  Future<void> pumpDetails(
    WidgetTester tester,
    Map<String, dynamic> booking, {
    required DateTime startAt,
  }) async {
    tester.view.physicalSize = const Size(1080, 6000);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);

    final navigatorKey = GlobalKey<NavigatorState>();
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          authProvider
              .overrideWith((ref) => Stream.value(MockUser(uid: 'atleta-1'))),
          arenaBookingDocProvider.overrideWith(
            (ref, id) => Stream<DocumentSnapshot<Map<String, dynamic>>?>.value(
              FakeBookingSnapshot(id, booking),
            ),
          ),
          bookingAttendanceProvider
              .overrideWith((ref, id) => Stream.value(null)),
          bookingDetailsTeamProvider.overrideWith(
            (ref, id) async => const BookingDetailsTeamState(
              members: [],
              confirmedCount: 1,
              totalSlots: 4,
            ),
          ),
          userLocationProvider.overrideWith(
            (ref) async =>
                const UserLocationSnapshot(source: UserLocationSource.none),
          ),
        ],
        child: MaterialApp(
          navigatorKey: navigatorKey,
          theme: AppTheme.dark,
          home: const Scaffold(body: Text('Agenda')),
        ),
      ),
    );
    navigatorKey.currentState!.push(
      MaterialPageRoute<void>(
        builder: (_) => BookingDetailsPage(
          bookingId: 'reserva-1',
          arenaId: null,
          arenaName: 'Arena CFC',
          courtName: 'Quadra 1',
          startAt: startAt,
          endAt: startAt.add(const Duration(hours: 1)),
          status: 'active',
          confirmedParticipants: 1,
        ),
      ),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));
  }

  Map<String, dynamic> doc(DateTime startAt, {Map<String, dynamic>? extra}) => {
        'athleteId': 'atleta-1',
        'arenaName': 'Arena CFC',
        'courtId': 'q1',
        'courtName': 'Quadra 1',
        'date':
            '${startAt.year}-${startAt.month.toString().padLeft(2, '0')}-${startAt.day.toString().padLeft(2, '0')}',
        'startTime': '${startAt.hour.toString().padLeft(2, '0')}:00',
        'endTime': '${(startAt.hour + 1).toString().padLeft(2, '0')}:00',
        'status': 'active',
        'amountReais': 60,
        ...?extra,
      };

  testWidgets('liberada por chuva: aviso A1 na reserva do dono',
      (tester) async {
    final startAt = DateTime.now().add(const Duration(days: 1));
    final start = DateTime(startAt.year, startAt.month, startAt.day, 18);
    await pumpDetails(
      tester,
      doc(start, extra: {
        'weatherRelease': {
          'status': 'pending_choice',
          'creditableReais': 60,
          'canReschedule': true,
          'forecast': [
            {'time': '18:00', 'probability': 92, 'precipitationMm': 5.4},
          ],
        },
      }),
      startAt: start,
    );

    expect(find.byKey(WeatherReleaseAlertCard.cardKey), findsOneWidget);
    expect(find.text('Chuva forte às 18h'), findsOneWidget);
    // Ações na barra fixa do rodapé (Scaffold.bottomNavigationBar), não no
    // card de chuva.
    final scaffold = tester.widget<Scaffold>(
      find
          .ancestor(
            of: find.byType(BookingWeatherSection),
            matching: find.byType(Scaffold),
          )
          .first,
    );
    expect(scaffold.bottomNavigationBar, isA<BookingWeatherBottomBar>());
    final bar = find.byType(BookingWeatherBottomBar);
    expect(
      find.descendant(
          of: bar, matching: find.text('Remarcar ou guardar crédito')),
      findsOneWidget,
    );
    expect(
      find.descendant(of: bar, matching: find.text('Manter minha reserva')),
      findsOneWidget,
    );
    expect(
      find.descendant(
        of: find.byKey(WeatherReleaseAlertCard.cardKey),
        matching: find.byType(ButtonStyleButton),
      ),
      findsNothing,
    );
    // Cancelar pelo caminho comum perderia o crédito: some da tela.
    expect(find.text('Cancelar reserva'), findsNothing);
    expect(find.byIcon(Icons.cancel_outlined), findsNothing);
  });

  testWidgets('sem liberação: o cancelamento comum continua', (tester) async {
    final tomorrow = DateTime.now().add(const Duration(days: 1));
    final start = DateTime(tomorrow.year, tomorrow.month, tomorrow.day, 18);
    await pumpDetails(tester, doc(start), startAt: start);
    final cancel = tester.widget<OutlinedButton>(
      find.widgetWithText(OutlinedButton, 'Cancelar reserva'),
    );
    expect(cancel.onPressed, isNotNull);
  });

  testWidgets('cancelada por chuva: selo e resumo dizem "por chuva"',
      (tester) async {
    final tomorrow = DateTime.now().add(const Duration(days: 1));
    final start = DateTime(tomorrow.year, tomorrow.month, tomorrow.day, 18);
    await pumpDetails(
      tester,
      doc(start, extra: {
        'status': 'canceled',
        'cancelReason': 'weather',
        'weatherRelease': {'status': 'canceled_unpaid', 'creditableReais': 0},
      }),
      startAt: start,
    );

    expect(find.text('CANCELADA POR CHUVA'), findsOneWidget);
    expect(find.text('Cancelada por chuva, nada foi cobrado'), findsOneWidget);
    // Cancelada no doc vivo: o cancelamento comum some.
    final cancel = tester.widget<OutlinedButton>(
      find.widgetWithText(OutlinedButton, 'Cancelar reserva'),
    );
    expect(cancel.onPressed, isNull);
  });
}
