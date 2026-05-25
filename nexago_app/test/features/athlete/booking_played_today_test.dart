import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/arenas/domain/my_booking_item.dart';
import 'package:nexago_app/features/arenas/domain/my_booking_payment.dart';
import 'package:nexago_app/features/athlete/domain/booking_played_today.dart';

MyBookingItem _booking({
  required String dateRaw,
  required String startTime,
  required String endTime,
  String status = 'active',
}) {
  return MyBookingItem(
    id: 'b1',
    arenaName: 'Arena',
    dateRaw: dateRaw,
    startTime: startTime,
    endTime: endTime,
    rawStatus: status,
    paymentDisplay: const MyBookingPaymentDisplay(label: 'Pago'),
  );
}

void main() {
  final today = DateTime(2026, 5, 21, 20, 0);

  test('eligible when slot ended today and not canceled', () {
    final b = _booking(
      dateRaw: '2026-05-21',
      startTime: '18:00',
      endTime: '19:00',
    );
    expect(isEligibleForPlayToday(b, today), isTrue);
  });

  test('not eligible before grace period after end', () {
    final b = _booking(
      dateRaw: '2026-05-21',
      startTime: '19:30',
      endTime: '20:00',
    );
    expect(isEligibleForPlayToday(b, today), isFalse);
  });

  test('not eligible when canceled', () {
    final b = _booking(
      dateRaw: '2026-05-21',
      startTime: '10:00',
      endTime: '11:00',
      status: 'cancelled',
    );
    expect(isEligibleForPlayToday(b, today), isFalse);
  });

  test('not eligible for yesterday', () {
    final b = _booking(
      dateRaw: '2026-05-20',
      startTime: '10:00',
      endTime: '11:00',
    );
    expect(isEligibleForPlayToday(b, today), isFalse);
  });

  test('isDateKeyToday matches calendar day', () {
    expect(isDateKeyToday('2026-05-21', today), isTrue);
    expect(isDateKeyToday('2026-05-20', today), isFalse);
  });
}
