import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/arenas/domain/arena_booking_cancellation_policy.dart';

void main() {
  final start = DateTime(2026, 5, 22, 9, 0);

  group('canCancelBookingForFree', () {
    test('true when more than 6 hours before start', () {
      final now = start.subtract(const Duration(hours: 7));
      expect(
        ArenaBookingCancellationPolicy.canCancelBookingForFree(start, now),
        isTrue,
      );
    });

    test('false exactly 6 hours before start', () {
      final now = start.subtract(const Duration(hours: 6));
      expect(
        ArenaBookingCancellationPolicy.canCancelBookingForFree(start, now),
        isFalse,
      );
    });

    test('false when 5h59 before start', () {
      final now = start.subtract(const Duration(hours: 5, minutes: 59));
      expect(
        ArenaBookingCancellationPolicy.canCancelBookingForFree(start, now),
        isFalse,
      );
    });

    test('false after start', () {
      final now = start.add(const Duration(minutes: 1));
      expect(
        ArenaBookingCancellationPolicy.canCancelBookingForFree(start, now),
        isFalse,
      );
    });
  });
}
