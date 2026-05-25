import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/arenas/domain/arena_booking_pix_amounts.dart';

void main() {
  group('ArenaBookingPixAmounts', () {
    test('payNowReais at 50% rounds to two decimals', () {
      expect(
        ArenaBookingPixAmounts.payNowReais(52.5, 0.5),
        26.25,
      );
    });

    test('dueOnsiteReais is total minus pay now', () {
      expect(
        ArenaBookingPixAmounts.dueOnsiteReais(52.5, 0.5),
        26.25,
      );
    });

    test('100% leaves nothing due on site', () {
      expect(ArenaBookingPixAmounts.payNowReais(100, 1), 100);
      expect(ArenaBookingPixAmounts.dueOnsiteReais(100, 1), 0);
    });
  });
}
