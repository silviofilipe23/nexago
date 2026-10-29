import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/features/arenas/domain/arena_booking_cancellation_policy.dart';
import 'package:nexago_app/features/arenas/domain/my_booking_item.dart';
import 'package:nexago_app/features/arenas/domain/my_booking_payment.dart';
import 'package:nexago_app/features/arenas/presentation/my_bookings/my_bookings_details_sheet.dart';
import 'package:nexago_app/features/arenas/presentation/my_bookings/my_bookings_logic.dart';

// Fake escrito à mão (padrão do repo); `DocumentSnapshot` é sealed.
// ignore: subtype_of_sealed_class
class _Snap implements DocumentSnapshot<Map<String, dynamic>> {
  _Snap(this._data);

  final Map<String, dynamic> _data;

  @override
  String get id => 'b1';

  @override
  Map<String, dynamic> data() => _data;

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

/// Liberada por chuva e sem escolha: cancelar pelo caminho comum faria o
/// atleta perder a opção de crédito, então o botão some.
void main() {
  setUpAll(() async {
    await initializeDateFormatting('pt_BR');
  });

  final start = DateTime.now().add(const Duration(days: 2));
  String two(int v) => v.toString().padLeft(2, '0');

  MyBookingItem item({bool pending = false}) => MyBookingItem(
        id: 'b1',
        ownerAthleteId: 'u1',
        arenaName: 'Arena CFC',
        courtName: 'Quadra 1',
        dateRaw: '${start.year}-${two(start.month)}-${two(start.day)}',
        startTime: '18:00',
        endTime: '19:00',
        rawStatus: 'active',
        paymentDisplay: const MyBookingPaymentDisplay(label: 'Pix'),
        weatherChoicePending: pending,
      );

  test('política: escolha de chuva pendente = nada a cancelar pelo app', () {
    expect(
      ArenaBookingCancellationPolicy.athleteCancellation(
        bookingStart: start,
        now: DateTime.now(),
        rawStatus: 'active',
        weatherChoicePending: true,
      ),
      AthleteBookingCancellation.unavailable,
    );
    expect(
      ArenaBookingCancellationPolicy.athleteCancellation(
        bookingStart: start,
        now: DateTime.now(),
        rawStatus: 'active',
      ),
      AthleteBookingCancellation.allowed,
    );
  });

  test('MyBookingItem lê weatherRelease.status pendente', () {
    MyBookingItem parse(Object? release) => MyBookingItem.fromFirestore(
          _Snap({
            'arenaName': 'Arena CFC',
            'date': '2026-11-01',
            'startTime': '18:00',
            'endTime': '19:00',
            'status': 'active',
            if (release != null) 'weatherRelease': release,
          }),
        );
    expect(parse({'status': 'pending_choice'}).weatherChoicePending, isTrue);
    expect(parse({'status': 'credited'}).weatherChoicePending, isFalse);
    expect(parse(null).weatherChoicePending, isFalse);
  });

  test('myBookingCancellation respeita a escolha pendente', () {
    expect(
      myBookingCancellation(item(pending: true), DateTime.now()),
      AthleteBookingCancellation.unavailable,
    );
    expect(
      myBookingCancellation(item(), DateTime.now()),
      AthleteBookingCancellation.allowed,
    );
  });

  Future<void> pumpSheet(WidgetTester tester, MyBookingItem item) async {
    tester.view.physicalSize = const Size(900, 2400);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.dark,
        home: Scaffold(
          body: BookingDetailsSheet(
            item: item,
            dateLabel: 'Sábado · 1 de novembro',
            onOpenMaps: () {},
            onPayNow: () {},
            onCancelBooking: () {},
            canCancelBooking: !item.weatherChoicePending,
          ),
        ),
      ),
    );
    await tester.pump();
  }

  testWidgets('folha de Minhas reservas: some o "Cancelar reserva"',
      (tester) async {
    await pumpSheet(tester, item(pending: true));
    expect(find.text('Cancelar reserva'), findsNothing);
    expect(find.byKey(const Key('my-booking-weather-pending-hint')),
        findsOneWidget);
  });

  testWidgets('folha sem chuva: o botão continua', (tester) async {
    await pumpSheet(tester, item());
    expect(find.text('Cancelar reserva'), findsOneWidget);
    expect(
        find.byKey(const Key('my-booking-weather-pending-hint')), findsNothing);
  });
}
