import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/athlete/presentation/widgets/booking_details/booking_details_view_model.dart';

void main() {
  group('bookingDetailsShowSplitCard', () {
    test('shows when payment status is partial', () {
      expect(
        bookingDetailsShowSplitCard(paymentStatus: 'partial', paidOnline: null),
        isTrue,
      );
    });

    test('shows when paid online amount is positive', () {
      expect(
        bookingDetailsShowSplitCard(paymentStatus: 'pending', paidOnline: 50),
        isTrue,
      );
    });

    test('hidden for arena-only payment', () {
      expect(
        bookingDetailsShowSplitCard(paymentStatus: 'paid', paidOnline: 0),
        isFalse,
      );
      expect(
        bookingDetailsShowSplitCard(paymentStatus: null, paidOnline: null),
        isFalse,
      );
    });
  });

  group('bookingDetailsCountdownLabel', () {
    test('future booking uses Começa em prefix', () {
      final start = DateTime(2026, 6, 8, 8);
      final end = start.add(const Duration(hours: 1));
      final now = start.subtract(const Duration(minutes: 30));
      final label = bookingDetailsCountdownLabel(
        now,
        start,
        end,
        BookingDetailsStatus.future,
      );
      expect(label, startsWith('Começa em'));
      expect(label, contains('30 min'));
    });
  });

  group('bookingDetailsActionsEnabled', () {
    test('enabled for future and current bookings', () {
      expect(bookingDetailsActionsEnabled(BookingDetailsStatus.future), isTrue);
      expect(bookingDetailsActionsEnabled(BookingDetailsStatus.current), isTrue);
    });

    test('disabled for past and canceled bookings', () {
      expect(bookingDetailsActionsEnabled(BookingDetailsStatus.past), isFalse);
      expect(
        bookingDetailsActionsEnabled(BookingDetailsStatus.canceled),
        isFalse,
      );
    });
  });

  group('formatSplitPerPersonLabel', () {
    test('divides amount by team slots', () {
      expect(
        formatSplitPerPersonLabel(200, slots: 4),
        contains('50'),
      );
    });

    test('returns null for missing amount', () {
      expect(formatSplitPerPersonLabel(null), isNull);
    });
  });
}
