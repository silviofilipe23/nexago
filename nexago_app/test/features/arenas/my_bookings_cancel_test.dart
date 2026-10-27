import 'package:firebase_auth_mocks/firebase_auth_mocks.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:nexago_app/core/auth/auth_providers.dart';
import 'package:nexago_app/core/formatting/app_date_format.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/features/arenas/data/booking_service.dart';
import 'package:nexago_app/features/arenas/domain/booking_providers.dart';
import 'package:nexago_app/features/arenas/domain/my_booking_guests_providers.dart';
import 'package:nexago_app/features/arenas/domain/my_booking_item.dart';
import 'package:nexago_app/features/arenas/domain/my_booking_payment.dart';
import 'package:nexago_app/features/arenas/domain/my_bookings_providers.dart';
import 'package:nexago_app/features/arenas/domain/waitlist_providers.dart';
import 'package:nexago_app/features/arenas/presentation/my_bookings/my_bookings_page.dart';
import 'package:nexago_app/features/arenas/presentation/my_bookings/widgets/my_bookings_booking_card.dart';
import 'package:nexago_app/features/athlete/domain/athlete_profile_providers.dart';

/// Só [cancelBooking] interessa: o resto da tela não chama o serviço.
class _FakeBookingService implements BookingService {
  final canceled = <String>[];

  @override
  Future<void> cancelBooking({
    required String bookingId,
    required String athleteId,
  }) async {
    canceled.add('$bookingId/$athleteId');
  }

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

MyBookingItem _itemStartingAt(DateTime start, {String? recurringBookingId}) {
  String two(int v) => v.toString().padLeft(2, '0');
  return MyBookingItem(
    id: 'reserva-1',
    ownerAthleteId: 'atleta-1',
    arenaName: 'Arena Sol',
    courtName: 'Quadra 2',
    dateRaw: calendarDateKey(start),
    startTime: '${two(start.hour)}:${two(start.minute)}',
    endTime: '${two((start.hour + 1) % 24)}:${two(start.minute)}',
    rawStatus: 'active',
    paymentDisplay: const MyBookingPaymentDisplay(label: 'Pagar na arena'),
    recurringBookingId: recurringBookingId,
  );
}

void main() {
  setUpAll(() async {
    await initializeDateFormatting('pt_BR');
  });

  /// Minhas reservas com uma reserva só, já com o sheet de detalhes aberto.
  Future<_FakeBookingService> pumpSheet(
    WidgetTester tester,
    MyBookingItem item,
  ) async {
    tester.view.physicalSize = const Size(1080, 4000);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);

    final service = _FakeBookingService();
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          authProvider.overrideWith(
            (ref) => Stream.value(MockUser(uid: 'atleta-1')),
          ),
          bookingServiceProvider.overrideWithValue(service),
          // Como o provider real: assiste o auth (que o `_openDetails` lê).
          myBookingsStreamProvider.overrideWith((ref) {
            ref.watch(authProvider);
            return Stream.value([item]);
          }),
          athleteProfileProvider.overrideWith((ref) => Stream.value(null)),
          myWaitlistStreamProvider.overrideWith((ref) => Stream.value([])),
          myBookingGuestDisplaysProvider.overrideWith(
            (ref, item) async => const [],
          ),
        ],
        child: MaterialApp(theme: AppTheme.dark, home: const MyBookingsPage()),
      ),
    );
    await tester.pump();
    await tester.pump(const Duration(seconds: 1));

    await tester.tap(find.byType(MyBookingsBookingCard));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 500));
    return service;
  }

  Finder cancelAction() => find.widgetWithText(TextButton, 'Cancelar reserva');

  testWidgets('no prazo: pede confirmação antes de cancelar', (tester) async {
    final service = await pumpSheet(
      tester,
      _itemStartingAt(DateTime.now().add(const Duration(days: 2))),
    );

    await tester.tap(cancelAction());
    await tester.pump(const Duration(milliseconds: 300));

    expect(find.text('Cancelar reserva?'), findsOneWidget);
    expect(service.canceled, isEmpty);

    await tester.tap(find.byKey(const Key('booking-cancel-keep')));
    await tester.pump(const Duration(milliseconds: 300));
    expect(service.canceled, isEmpty);

    await tester.tap(cancelAction());
    await tester.pump(const Duration(milliseconds: 300));
    await tester.tap(find.byKey(const Key('booking-cancel-confirm')));
    await tester.pump(const Duration(milliseconds: 300));

    expect(service.canceled, ['reserva-1/atleta-1']);
  });

  testWidgets('a menos de 6h: botão desligado e aviso da arena',
      (tester) async {
    final service = await pumpSheet(
      tester,
      _itemStartingAt(DateTime.now().add(const Duration(hours: 3))),
    );

    expect(tester.widget<TextButton>(cancelAction()).onPressed, isNull);
    expect(find.textContaining('fale com Arena Sol'), findsOneWidget);
    expect(service.canceled, isEmpty);
  });

  testWidgets('horário fixo: botão desligado mesmo no prazo', (tester) async {
    await pumpSheet(
      tester,
      _itemStartingAt(
        DateTime.now().add(const Duration(days: 2)),
        recurringBookingId: 'serie-1',
      ),
    );

    expect(tester.widget<TextButton>(cancelAction()).onPressed, isNull);
    expect(find.textContaining('fale com'), findsNothing);
  });
}
